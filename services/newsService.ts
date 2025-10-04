import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const API_TIMEOUT = Number(process.env.NEXT_PUBLIC_API_TIMEOUT || 15000);

export async function fetchNews({
  query,
  days = 7,
  language = "es-419",
  country = "AR",
  limit = 10,
  date = null
}: {
  query: string;
  days?: number;
  language?: string;
  country?: string;
  limit?: number;
  date?: string | null;
}) {
  try {
    if (!query) {
      throw new Error('El parámetro "query" es requerido');
    }

    const params = new URLSearchParams({
      query: query.trim(),
      language,
      country,
      limit: limit.toString()
    });

    if (date) {
      params.append("date", date);
    } else {
      params.append("days", days.toString());
    }

    const apiUrl = `${API_BASE_URL}/news?${params.toString()}`;
    console.log("Fetching from API:", apiUrl);

    const response = await axios.get(apiUrl, {
      timeout: API_TIMEOUT,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });

    const data = response.data;

    if (!data.success) {
      throw new Error(data.message || "Error en la respuesta de la API");
    }

    return {
      success: true,
      query: data.query,
      totalResults: data.totalResults,
      ...(date ? { specificDate: data.specificDate } : { requestedDays: data.requestedDays }),
      language: data.language,
      country: data.country,
      summary: data.summary || "",
      news: data.news || []
    };
  } catch (error: any) {
    console.error("Error fetching news from API:", error);

    if (
      error.code === "ENOTFOUND" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ERR_NETWORK"
    ) {
      throw new Error("Error de conexión con la API. Verifica tu conexión a internet.");
    }

    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || "Error del servidor";

      if (status === 400) {
        throw new Error(`Error en los parámetros: ${message}`);
      } else if (status === 403) {
        throw new Error("Acceso denegado a la API");
      } else if (status === 429) {
        throw new Error("Demasiadas solicitudes. Espera unos minutos e intenta nuevamente.");
      } else if (status >= 500) {
        throw new Error("Error interno del servidor. Intenta más tarde.");
      }

      throw new Error(message);
    }

    throw new Error(error.message || "Error desconocido al obtener noticias");
  }
}
