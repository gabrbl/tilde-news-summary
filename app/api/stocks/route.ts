import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const ALPHA_VANTAGE_API_URL = "https://www.alphavantage.co/query";
const REQUEST_TIMEOUT = Number(process.env.STOCKS_API_TIMEOUT ?? 10000);

interface AlphaVantageDailyEntry extends Record<string, string | undefined> {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
}

interface AlphaVantageDailySeries {
  [date: string]: AlphaVantageDailyEntry;
}

type TimeRange = "1M" | "3M" | "6M" | "1Y" | "MAX";

const RANGE_TO_DAYS: Record<Exclude<TimeRange, "MAX">, number> = {
  "1M": 22,
  "3M": 66,
  "6M": 132,
  "1Y": 264
};

function filterByRange<T extends { date: string }>(
  data: T[],
  range: TimeRange
) {
  if (range === "MAX") {
    return data;
  }

  const days = RANGE_TO_DAYS[range];
  return data.slice(-days);
}

const TIME_SERIES_KEYS = [
  "Time Series (Daily)",
  "Time Series (Daily Adjusted)",
  "Time Series (Digital Currency Daily)"
] as const;

type TimeSeriesKey = (typeof TIME_SERIES_KEYS)[number];

type AlphaVantageFunction = "TIME_SERIES_DAILY_ADJUSTED" | "TIME_SERIES_DAILY";

const FUNCTIONS_TO_TRY: AlphaVantageFunction[] = [
  "TIME_SERIES_DAILY_ADJUSTED",
  "TIME_SERIES_DAILY"
];

function extractSeries(data: Record<string, any>) {
  for (const key of TIME_SERIES_KEYS) {
    if (data[key]) {
      return data[key] as AlphaVantageDailySeries;
    }
  }

  return undefined;
}

async function callAlphaVantage(
  symbol: string,
  range: TimeRange,
  apiKey: string,
  fn: AlphaVantageFunction
) {
  const response = await axios.get(ALPHA_VANTAGE_API_URL, {
    params: {
      function: fn,
      symbol,
      outputsize: range === "MAX" || range === "1Y" ? "full" : "compact",
      datatype: "json",
      apikey: apiKey
    },
    timeout: REQUEST_TIMEOUT
  });

  return response.data;
}

async function suggestSymbols(symbol: string, apiKey: string) {
  try {
    const { data } = await axios.get(ALPHA_VANTAGE_API_URL, {
      params: {
        function: "SYMBOL_SEARCH",
        keywords: symbol,
        apikey: apiKey
      },
      timeout: REQUEST_TIMEOUT
    });

    const matches = (data?.bestMatches ?? []) as Array<Record<string, string>>;

    return matches.slice(0, 5).map((match) => ({
      symbol: match["1. symbol"],
      name: match["2. name"],
      region: match["4. region"],
      currency: match["8. currency"]
    }));
  } catch (error) {
    console.warn("No se pudieron obtener sugerencias de símbolos", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get("symbol");
  const range = (searchParams.get("range")?.toUpperCase() as TimeRange) ?? "3M";

  if (!symbol) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: 'El parámetro "symbol" es requerido'
      },
      { status: 400 }
    );
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Service Unavailable",
        message: "ALPHA_VANTAGE_API_KEY no configurada en el servidor"
      },
      { status: 503 }
    );
  }

  try {
  let lastError: { status: number; body: Record<string, any> } | null = null;

    for (const fn of FUNCTIONS_TO_TRY) {
      const data = await callAlphaVantage(symbol.toUpperCase(), range, apiKey, fn);

      if (data.Note) {
        return NextResponse.json(
          {
            error: "Too Many Requests",
            message:
              "Límite de la API de Alpha Vantage alcanzado. Intenta nuevamente en un minuto."
          },
          { status: 429 }
        );
      }

      if (data.Information) {
        lastError = {
          status: 400,
          body: {
            error: "Bad Request",
            message: data.Information,
            triedFunction: fn
          }
        };
        continue;
      }

      if (data["Error Message"]) {
        lastError = {
          status: 400,
          body: {
            error: "Bad Request",
            message: data["Error Message"],
            triedFunction: fn
          }
        };
        continue;
      }

      const series = extractSeries(data);

      if (!series) {
        lastError = {
          status: 404,
          body: {
            error: "Not Found",
            message: "No se encontraron datos históricos para el símbolo solicitado",
            triedFunction: fn
          }
        };
        continue;
      }

      const parsed = Object.keys(series)
        .sort()
        .map((date) => {
          const entry = series[date];
          const adjustedCloseValue = entry["5. adjusted close"] ?? entry["4. close"];
          const volumeValue = entry["6. volume"] ?? entry["5. volume"] ?? "0";

          return {
            date,
            open: Number.parseFloat(entry["1. open"]),
            high: Number.parseFloat(entry["2. high"]),
            low: Number.parseFloat(entry["3. low"]),
            close: Number.parseFloat(entry["4. close"]),
            adjustedClose: Number.parseFloat(adjustedCloseValue),
            volume: Number.parseInt(volumeValue, 10)
          };
        });

      const filtered = filterByRange(parsed, range);

      return NextResponse.json({
        success: true,
        symbol: symbol.toUpperCase(),
        range,
        providerFunction: fn,
        lastUpdated: data["Meta Data"]?.["3. Last Refreshed"] ?? null,
        timezone: data["Meta Data"]?.["5. Time Zone"] ?? null,
        data: filtered
      });
    }

    if (lastError) {
      if (lastError.status === 404) {
        const suggestions = await suggestSymbols(symbol, apiKey);
        return NextResponse.json(
          {
            ...lastError.body,
            suggestions
          },
          { status: lastError.status }
        );
      }

      return NextResponse.json(lastError.body, { status: lastError.status });
    }

    return NextResponse.json(
      {
        error: "Not Found",
        message: "No se encontraron datos históricos para el símbolo solicitado"
      },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("Error fetching stock data:", error);

    if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      return NextResponse.json(
        {
          error: "Gateway Timeout",
          message: "La solicitud a Alpha Vantage excedió el tiempo de espera"
        },
        { status: 504 }
      );
    }

    if (error.response) {
      return NextResponse.json(
        {
          error: "Upstream Error",
          message: error.response.data?.message ?? "Error desde la API de Alpha Vantage"
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error.message ?? "Error inesperado obteniendo los datos bursátiles"
      },
      { status: 500 }
    );
  }
}
