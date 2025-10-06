import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

type TimeRange = "1M" | "3M" | "6M" | "1Y" | "MAX";

const RANGE_TO_PERIOD: Record<TimeRange, string> = {
  "1M": "1mo",
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
  "MAX": "max"
};

interface StockDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
}

type ChartQuoteEntry = {
  date?: Date | number | string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  adjclose?: number | null;
  adjClose?: number | null;
};

type ChartResultWithQuotes = Awaited<ReturnType<typeof yahooFinance.chart>> & {
  quotes?: ChartQuoteEntry[];
};

async function searchSymbols(query: string): Promise<Array<{
  symbol: string;
  name?: string;
  region?: string;
  currency?: string;
}>> {
  try {
    const results = await yahooFinance.search(query, {
      quotesCount: 5,
      newsCount: 0
    });

    const quotes = results.quotes || [];
    return quotes.slice(0, 5).map((quote: any) => ({
      symbol: quote.symbol || "",
      name: quote.shortname || quote.longname || "",
      region: quote.exchDisp || "",
      currency: quote.currency || ""
    }));
  } catch (error) {
    console.warn("No se pudieron obtener sugerencias de símbolos:", error);
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

  try {
    const period = RANGE_TO_PERIOD[range];
    const cleanedSymbol = symbol.trim().toUpperCase();

    // Calcular período de inicio según el rango
    let period1: Date | undefined;
    if (range !== "MAX") {
      period1 = new Date();
      switch (range) {
        case "1M":
          period1.setMonth(period1.getMonth() - 1);
          break;
        case "3M":
          period1.setMonth(period1.getMonth() - 3);
          break;
        case "6M":
          period1.setMonth(period1.getMonth() - 6);
          break;
        case "1Y":
          period1.setFullYear(period1.getFullYear() - 1);
          break;
      }
    }

    // Obtener datos históricos usando chart()
    const queryOptions: any = {
      period1: period1,
      period2: new Date(),
      interval: "1d" as const
    };

    // Si es MAX, usamos period en lugar de period1/period2
    if (range === "MAX") {
      delete queryOptions.period1;
      delete queryOptions.period2;
      queryOptions.period = "max";
    }

  const result = (await yahooFinance.chart(cleanedSymbol, queryOptions)) as ChartResultWithQuotes;

    const timestamps: number[] = Array.isArray(result?.timestamp)
      ? (result.timestamp as number[])
      : [];

    const quoteSeries = Array.isArray(result?.indicators?.quote)
      ? result.indicators!.quote
      : [];

    const quoteData = quoteSeries[0];

    const adjCloseSeries = Array.isArray(result?.indicators?.adjclose)
      ? result.indicators!.adjclose
      : [];

    const adjCloseData = adjCloseSeries[0];

    const quotes = Array.isArray(result?.quotes) ? result.quotes : [];

    let parsed: StockDataPoint[] = [];

    if (quotes.length > 0) {
      parsed = quotes
        .filter((entry: any) => entry && entry.date)
        .map((entry: any) => {
          const dateValue = entry.date instanceof Date
            ? entry.date
            : typeof entry.date === "number"
              ? new Date(entry.date * 1000)
              : new Date(entry.date);

          const adjCloseValue = entry.adjclose ?? entry.adjClose ?? entry.close;

          return {
            date: dateValue.toISOString().split("T")[0],
            open: entry.open ?? 0,
            high: entry.high ?? 0,
            low: entry.low ?? 0,
            close: entry.close ?? 0,
            adjustedClose: adjCloseValue ?? 0,
            volume: entry.volume ?? 0
          };
        });
    } else if (timestamps.length && quoteData) {
      parsed = timestamps.map((timestamp, index) => {
        const open = quoteData.open?.[index];
        const high = quoteData.high?.[index];
        const low = quoteData.low?.[index];
        const close = quoteData.close?.[index];
        const volume = quoteData.volume?.[index];
        const adjustedClose = adjCloseData?.adjclose?.[index] ?? close;

        return {
          date: new Date(timestamp * 1000).toISOString().split("T")[0],
          open: open ?? 0,
          high: high ?? 0,
          low: low ?? 0,
          close: close ?? 0,
          adjustedClose: adjustedClose ?? 0,
          volume: volume ?? 0
        };
      });
    }

    if (parsed.length === 0) {
      // Intentar buscar sugerencias
      const suggestions = await searchSymbols(cleanedSymbol);
      
      return NextResponse.json(
        {
          error: "Not Found",
          message: `No se encontraron datos históricos para el símbolo "${cleanedSymbol}". Verifica que el ticker sea correcto.`,
          suggestions
        },
        { status: 404 }
      );
    }

    // Ordenar por fecha
    parsed.sort((a, b) => a.date.localeCompare(b.date));

    // Filtrar según el rango solicitado
    let filtered = parsed;
    if (range !== "MAX") {
      const periodMap: Record<Exclude<TimeRange, "MAX">, number> = {
        "1M": 22,
        "3M": 66,
        "6M": 132,
        "1Y": 264
      };
      const days = periodMap[range];
      filtered = parsed.slice(-days);
    }

    // Obtener metadatos del símbolo
    let lastUpdated: string | null = null;
    let timezone: string | null = null;

    try {
      const quote = await yahooFinance.quote(cleanedSymbol);
      const regularMarketTime = quote.regularMarketTime;
      if (regularMarketTime instanceof Date) {
        lastUpdated = regularMarketTime.toISOString();
      } else if (typeof regularMarketTime === "number") {
        lastUpdated = new Date(regularMarketTime * 1000).toISOString();
      } else {
        lastUpdated = null;
      }
      timezone = quote.exchangeTimezoneName || null;
    } catch (error) {
      console.warn("No se pudieron obtener metadatos del símbolo:", error);
    }

    return NextResponse.json({
      success: true,
      symbol: cleanedSymbol,
      range,
      provider: "Yahoo Finance",
      lastUpdated,
      timezone,
      data: filtered
    });

  } catch (error: any) {
    console.error("Error fetching stock data from Yahoo Finance:", error);

    // Manejar errores específicos de Yahoo Finance
    if (error.message?.includes("No data found") || error.message?.includes("Not Found")) {
      const suggestions = await searchSymbols(symbol);
      
      return NextResponse.json(
        {
          error: "Not Found",
          message: `El símbolo "${symbol}" no fue encontrado. Intenta con otro ticker.`,
          suggestions
        },
        { status: 404 }
      );
    }

    if (error.message?.includes("Too Many Requests") || error.code === "ETIMEDOUT") {
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: "Demasiadas solicitudes. Por favor, espera un momento antes de intentar nuevamente."
        },
        { status: 429 }
      );
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return NextResponse.json(
        {
          error: "Gateway Timeout",
          message: "La solicitud tardó demasiado tiempo. Por favor, intenta nuevamente."
        },
        { status: 504 }
      );
    }

    // Error genérico
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Error inesperado obteniendo los datos bursátiles. Por favor, intenta nuevamente."
      },
      { status: 500 }
    );
  }
}
