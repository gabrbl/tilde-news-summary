'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Line } from "react-chartjs-2";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip
} from "chart.js";
import "./StockExplorer.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface StockDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
}

interface StockApiResponse {
  success: boolean;
  symbol: string;
  range: string;
  lastUpdated: string | null;
  timezone: string | null;
  data: StockDataPoint[];
}

interface SymbolSuggestion {
  symbol: string;
  name?: string;
  region?: string;
  currency?: string;
}

type RangeOption = {
  value: "1M" | "3M" | "6M" | "1Y" | "MAX";
  label: string;
};

const RANGE_OPTIONS: RangeOption[] = [
  { value: "1M", label: "1 mes" },
  { value: "3M", label: "3 meses" },
  { value: "6M", label: "6 meses" },
  { value: "1Y", label: "1 año" },
  { value: "MAX", label: "Máximo" }
];

const DEFAULT_SYMBOL = "AAPL";

export default function StockExplorer() {
  const [symbol, setSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [searchTerm, setSearchTerm] = useState<string>(DEFAULT_SYMBOL);
  const [range, setRange] = useState<RangeOption["value"]>("3M");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<StockDataPoint[]>([]);
  const [meta, setMeta] = useState<{ lastUpdated: string | null; timezone: string | null } | null>(null);
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);

  const fetchStockData = useCallback(
    async (targetSymbol: string, selectedRange: RangeOption["value"]) => {
      const cleanedSymbol = targetSymbol.trim().toUpperCase();

      if (!cleanedSymbol) {
        setError("Ingresa un ticker válido para continuar");
        return;
      }

      setLoading(true);
      setError("");
      setSuggestions([]);

      try {
        const response = await fetch(
          `/api/stocks?symbol=${encodeURIComponent(cleanedSymbol)}&range=${selectedRange}`
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          setError(payload.message || "Error consultando la API de acciones");
          setSuggestions(payload.suggestions ?? []);
          setData([]);
          setMeta(null);
          return;
        }

        const payload: StockApiResponse = await response.json();

        if (!payload.success) {
          throw new Error("No se pudo obtener la información bursátil");
        }

        setData(payload.data);
        setSuggestions([]);
        setMeta({ lastUpdated: payload.lastUpdated, timezone: payload.timezone });
      } catch (err: any) {
        console.error("Error fetching stocks", err);
        setError(err.message || "Error inesperado al obtener las cotizaciones");
        setData([]);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!symbol) {
      return;
    }

    fetchStockData(symbol, range).catch((error) => {
      console.error("Error obteniendo datos bursátiles", error);
    });
  }, [fetchStockData, symbol, range]);

  const chartData = useMemo(() => {
    return {
      labels: data.map((point) => point.date),
      datasets: [
        {
          label: `Precio de cierre (${symbol})`,
          data: data.map((point) => point.close),
          borderColor: "#5a67d8",
          backgroundColor: "rgba(90, 103, 216, 0.15)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    };
  }, [data, symbol]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index" as const
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 10,
            color: "#4a5568"
          },
          grid: {
            color: "rgba(203, 213, 224, 0.35)"
          }
        },
        y: {
          ticks: {
            color: "#4a5568",
            callback: (value: number | string) => `$${value}`
          },
          grid: {
            color: "rgba(226, 232, 240, 0.35)"
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#2d3748"
          }
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const price = context.parsed.y as number;
              return `Cierre: $${price.toFixed(2)}`;
            }
          }
        }
      }
    };
  }, []);

  const handleSearch = () => {
    const cleaned = searchTerm.trim().toUpperCase();

    if (!cleaned) {
      setError("Ingresa un ticker válido para continuar");
      return;
    }

    setSearchTerm(cleaned);
    setSymbol(cleaned);
    setError("");
    setSuggestions([]);
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  };

  const latestPoint = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="stocks-page">
      <header className="stocks-header">
        <div>
          <h1>Explorador de Acciones</h1>
          <p>Consulta cotizaciones históricas con datos diarios y visualízalas en un gráfico interactivo.</p>
        </div>
        <div className="header-meta">
          {meta?.lastUpdated && (
            <p>
              Última actualización API: <strong>{meta.lastUpdated}</strong>
              {meta?.timezone && <span> ({meta.timezone})</span>}
            </p>
          )}
        </div>
      </header>

      <section className="stocks-controls">
        <div className="symbol-search">
          <label htmlFor="symbolInput">Símbolo bursátil (ticker)</label>
          <div className="input-group">
            <input
              id="symbolInput"
              type="text"
              placeholder="Ej: AAPL, MSFT, TSLA, AMZN..."
              value={searchTerm}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value.toUpperCase())}
              onKeyDown={handleKeyPress}
              aria-label="Ticker bursátil"
            />
            <button type="button" onClick={handleSearch} disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>

        <div className="range-selector" role="group" aria-label="Periodo de tiempo">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === range ? "active" : ""}
              onClick={() => setRange(option.value)}
              disabled={loading && option.value !== range}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="stocks-error" role="alert">
          <p>{error}</p>
          {suggestions.length > 0 && (
            <ul className="stocks-suggestions">
              {suggestions.map((item) => (
                <li key={item.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm(item.symbol);
                      setSymbol(item.symbol);
                      setError("");
                      setSuggestions([]);
                    }}
                  >
                    <span className="suggestion-symbol">{item.symbol}</span>
                    {item.name && <span className="suggestion-name">{item.name}</span>}
                    {(item.region || item.currency) && (
                      <span className="suggestion-meta">
                        {item.region && <span>{item.region}</span>}
                        {item.region && item.currency && <span> · </span>}
                        {item.currency && <span>{item.currency}</span>}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="chart-card">
        {loading && <div className="loading-state">Cargando datos históricos...</div>}
        {!loading && data.length === 0 && !error && (
          <div className="empty-state">
            <h3>No hay datos disponibles</h3>
            <p>Intenta con otro símbolo o espera un minuto si alcanzaste el límite gratuito de la API.</p>
          </div>
        )}
        {!loading && data.length > 0 && (
          <>
            <div className="chart-header">
              <div>
                <h2>{symbol}</h2>
                <p>
                  Mostrando precios de cierre diarios para los últimos {range === "MAX" ? "años registrados" : RANGE_OPTIONS.find((opt) => opt.value === range)?.label?.toLowerCase()}.
                </p>
              </div>
              {latestPoint && (
                <div className="price-highlight">
                  <span>Último cierre</span>
                  <strong>${latestPoint.close.toFixed(2)}</strong>
                  <small>{latestPoint.date}</small>
                </div>
              )}
            </div>
            <div className="chart-wrapper">
              <Line options={chartOptions} data={chartData} />
            </div>
          </>
        )}
      </section>

      {!loading && data.length > 0 && (
        <section className="table-card">
          <h3>Últimos datos diarios</h3>
          <div className="table-wrapper" role="region" aria-live="polite">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Mínimo</th>
                  <th>Máximo</th>
                  <th>Volumen</th>
                </tr>
              </thead>
              <tbody>
                {data
                  .slice(-10)
                  .reverse()
                  .map((point) => (
                    <tr key={point.date}>
                      <td>{point.date}</td>
                      <td>${point.open.toFixed(2)}</td>
                      <td>${point.close.toFixed(2)}</td>
                      <td>${point.low.toFixed(2)}</td>
                      <td>${point.high.toFixed(2)}</td>
                      <td>{point.volume.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
