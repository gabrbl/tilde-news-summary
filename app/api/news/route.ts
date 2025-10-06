import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import xml2js from "xml2js";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

function buildGoogleNewsURL(
  query: string,
  days = 7,
  language = "es-419",
  country = "AR",
  specificDate: string | null = null
) {
  const encodedQuery = encodeURIComponent(query);
  const baseURL = "https://news.google.com/rss/search";

  let timeFilter;
  if (specificDate) {
    const date = new Date(specificDate);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Formato de fecha inválido. Use YYYY-MM-DD");
    }

    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const formatDate = (d: Date) => d.toISOString().split("T")[0];
    timeFilter = `after:${formatDate(date)} before:${formatDate(nextDay)}`;
  } else {
    timeFilter = `when:${days}d`;
  }

  const params = new URLSearchParams({
    q: `${query} ${timeFilter}`,
    hl: language,
    gl: country,
    ceid: `${country}:${language}`
  });

  console.log({params});
  

  return `${baseURL}?${params.toString()}`;
}

async function parseRSSFeed(rssData: string) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true
  });

  try {
    const result = await parser.parseStringPromise(rssData);
    const items = result.rss.channel.item || [];
    const newsItems = Array.isArray(items) ? items : [items];

    return newsItems.map((item: any) => ({
      title: item.title || "",
      link: item.link || "",
      description: item.description || "",
      pubDate: item.pubDate || "",
      source: item.source ? item.source._ || item.source : "",
      guid: item.guid ? item.guid._ || item.guid : ""
    }));
  } catch (error: any) {
    throw new Error(`Error parsing RSS: ${error.message}`);
  }
}

async function extractTitlesFromRSS(xmlData: string) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true
  });

  try {
    const result = await parser.parseStringPromise(xmlData);
    const items = result.rss.channel.item || [];
    const newsItems = Array.isArray(items) ? items : [items];

    return newsItems.map((item: any) => ({
      title: item.title || "",
      source: item.source ? item.source._ || item.source : null,
      pubDate: item.pubDate || null
    }));
  } catch (error: any) {
    throw new Error(`Error extrayendo títulos del RSS: ${error.message}`);
  }
}

async function analyzeRSSWithGPT(items: Array<{
  title: string;
  source: string | null;
  pubDate: string | null;
}>) {
  if (!openai) {
    throw new Error("OPENAI_API_KEY no configurada");
  }

  try {
    const payload = items.map((item) => ({
      title: item.title || "",
      source: item.source || null,
      pubDate: item.pubDate || null
    }));

    const ITEMS_JSON = JSON.stringify(payload, null, 2);

    const ANALYSIS_PROMPT = `Rol/objetivo
    Sos un analista de noticias. Te paso SOLO un array JSON con títulos de notas. Tu trabajo es producir un RESUMEN CORTO, en un único párrafo, que cuente “qué pasó” según esos títulos.

    Reglas estrictas
    - Usá EXCLUSIVAMENTE la info que se infiere de los títulos. No inventes detalles.
    - Deduplicá títulos casi idénticos (normalizá a minúsculas, quitá puntuación y palabras de relleno; considerá duplicado si la similitud ≥ 0.8).
    - Agrupá mentalmente por temas (ej.: emisión/colocación de ON, prórroga de concesiones, venta de activos, suba de combustibles, hitos técnicos en Vaca Muerta, actos institucionales, conflictos/querellas).
    - Priorizá en el resumen los temas más repetidos.
    - Tono informativo, neutro y conciso.
    - Extensión: 2 a 4 oraciones (máx. ~100 palabras).
    - Salida: SOLO el párrafo del resumen, sin encabezados, listas, ni texto extra.
    - Si el array está vacío, respondé: “No se recibieron títulos para resumir.”

    Entrada (array JSON de títulos)
    <<<TITULOS_JSON
    {{${ITEMS_JSON}}}
    TITULOS_JSON>>>

    Entregá directamente el párrafo final.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente experto en análisis de noticias. Tu tarea es analizar el contenido de RSS de Google News y proporcionar insights valiosos."
        },
        {
          role: "user",
          content: ANALYSIS_PROMPT
        }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });

    return {
      summary: completion.choices[0].message.content
    };
  } catch (error: any) {
    console.error("Error al analizar con GPT:", error);
    throw new Error(`Error en análisis GPT: ${error.message}`);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get("query");
    const daysParam = searchParams.get("days") ?? "7";
    const language = searchParams.get("language") ?? "es-419";
    const country = searchParams.get("country") ?? "AR";
    const limitParam = searchParams.get("limit") ?? "10";
    const date = searchParams.get("date");

    if (!query) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: 'El parámetro "query" es requerido'
        },
        { status: 400 }
      );
    }

    if (date && searchParams.has("days")) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: 'No se puede usar "date" y "days" al mismo tiempo. Use uno u otro.'
        },
        { status: 400 }
      );
    }

    let googleNewsURL;
    let days = Number.parseInt(daysParam, 10);
    if (Number.isNaN(days) || days < 1) {
      days = 7;
    }

    try {
      googleNewsURL = buildGoogleNewsURL(
        query,
        days,
        language,
        country,
        date
      );
    } catch (dateError: any) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: dateError.message
        },
        { status: 400 }
      );
    }

    const response = await axios.get(googleNewsURL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      timeout: 10000
    });

    let gptAnalysis: { summary: string | null } | null = null;
    if (openai) {
      try {
        const titlesForAnalysis = await extractTitlesFromRSS(response.data);
        gptAnalysis = await analyzeRSSWithGPT(titlesForAnalysis);
      } catch (gptError: any) {
        console.warn("No se pudo realizar el análisis GPT:", gptError.message);
      }
    } else {
      console.info("OPENAI_API_KEY no configurada, omitiendo análisis GPT");
    }

    const news = await parseRSSFeed(response.data);

    const limit = Number.parseInt(limitParam, 10);
    const limitedNews = Number.isNaN(limit) ? news : news.slice(0, limit);

    return NextResponse.json({
      success: true,
      query,
      totalResults: limitedNews.length,
      ...(date ? { specificDate: date } : { requestedDays: days }),
      language,
      country,
      rssUrl: googleNewsURL,
      ...gptAnalysis,
      news: limitedNews
    });
  } catch (error: any) {
    console.error(error);

    if (error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
      return NextResponse.json(
        {
          error: "Service Unavailable",
          message: "No se pudo conectar con Google News RSS"
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Error procesando la solicitud de noticias"
      },
      { status: 500 }
    );
  }
}
