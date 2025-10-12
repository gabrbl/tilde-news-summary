'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
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

interface PriceSpike {
  date: string;
  index: number;
  close: number;
  changePercent: number;
  newsLoaded: boolean;
  newsSummary: string | null;
  kind: "peak" | "valley" | "point";
}

type RangeOption = {
  value: "1M" | "3M" | "6M" | "1Y" | "2Y" | "MAX";
  label: string;
};

const RANGE_OPTIONS: RangeOption[] = [
  { value: "1M", label: "1 mes" },
  { value: "3M", label: "3 meses" },
  { value: "6M", label: "6 meses" },
  { value: "1Y", label: "1 año" },
  // { value: "MAX", label: "Máximo" }
];

const DEFAULT_SYMBOL = "YPF";

export default function StockExplorer() {
  const [symbol, setSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [searchTerm, setSearchTerm] = useState<string>(DEFAULT_SYMBOL);
  const [range, setRange] = useState<RangeOption["value"]>("3M");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<StockDataPoint[]>([]);
  const [meta, setMeta] = useState<{ lastUpdated: string | null; timezone: string | null } | null>(null);
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [spikes, setSpikes] = useState<PriceSpike[]>([]);
  const [hoveredSpike, setHoveredSpike] = useState<PriceSpike | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const chartRef = useRef<any>(null);
  const newsCacheRef = useRef<Record<string, string>>({});

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
          
          let errorMessage = payload.message || "Error consultando la API de acciones";
          
          // Personalizar mensajes según el código de estado
          if (response.status === 429) {
            errorMessage = "Has alcanzado el límite de solicitudes. Por favor, espera un minuto antes de intentar nuevamente.";
          } else if (response.status === 503) {
            errorMessage = "El servicio no está disponible temporalmente. Por favor, intenta más tarde.";
          } else if (response.status === 504) {
            errorMessage = "La solicitud tardó demasiado tiempo. Por favor, intenta nuevamente.";
          }
          
          setError(errorMessage);
          setSuggestions(payload.suggestions ?? []);
          setData([]);
          setMeta(null);
          setSpikes([]);
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
        setSpikes([]);
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

  const detectSpikes = useCallback((prices: StockDataPoint[]): PriceSpike[] => {
    if (prices.length < 9) {
      return [];
    }

    // Usamos Fractales de Williams: un punto es pico/valle si es extremo local
    // comparado con N períodos a cada lado
    const LEFT_BARS = 4;
    const RIGHT_BARS = 4;
    const MIN_PROMINENCE_PERCENT = 2.0; // Mínimo 2% de diferencia con vecinos para ser significativo

    const detected: PriceSpike[] = [];

    for (let i = LEFT_BARS; i < prices.length - RIGHT_BARS; i++) {
      const curr = prices[i];
      
      // Obtener barras a la izquierda y derecha
      const leftBars = prices.slice(i - LEFT_BARS, i);
      const rightBars = prices.slice(i + 1, i + RIGHT_BARS + 1);
      
      // Verificar si es un pico (fractal alcista)
      const isPeak = leftBars.every((bar) => curr.close > bar.close) && 
                     rightBars.every((bar) => curr.close > bar.close);
      
      // Verificar si es un valle (fractal bajista)
      const isValley = leftBars.every((bar) => curr.close < bar.close) && 
                       rightBars.every((bar) => curr.close < bar.close);

      if (!isPeak && !isValley) {
        continue;
      }

      // Calcular prominencia: diferencia promedio con los vecinos
      const allNeighbors = [...leftBars, ...rightBars];
      const avgNeighbor = allNeighbors.reduce((sum, bar) => sum + bar.close, 0) / allNeighbors.length;
      const prominencePercent = avgNeighbor !== 0 
        ? Math.abs((curr.close - avgNeighbor) / avgNeighbor) * 100 
        : 0;

      // Filtrar por prominencia mínima
      if (prominencePercent < MIN_PROMINENCE_PERCENT) {
        continue;
      }

      // Calcular cambio porcentual respecto al día anterior
      const prev = prices[i - 1];
      const changePercent = prev && prev.close !== 0
        ? ((curr.close - prev.close) / prev.close) * 100
        : 0;

      detected.push({
        date: curr.date,
        index: i,
        close: curr.close,
        changePercent,
        newsLoaded: false,
        newsSummary: null,
        kind: isPeak ? "peak" : "valley"
      });
    }

    return detected;
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      const detectedSpikes = detectSpikes(data);
      setSpikes(detectedSpikes);
    } else {
      setSpikes([]);
    }
  }, [data, detectSpikes]);

  const chartData = useMemo(() => {
    const spikeIndices = new Set(spikes.map((s) => s.index));
    
    return {
      labels: data.map((point) => point.date),
      datasets: [
        {
          label: `Precio de cierre (${symbol})`,
          data: data.map((point) => point.close),
          borderColor: "#5a67d8",
          backgroundColor: "rgba(90, 103, 216, 0.08)",
          fill: true,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.5,
          pointBackgroundColor: "#5a67d8",
          pointBorderColor: "#fff",
          pointBorderWidth: 1
        },
        {
          label: "Picos y valles pronunciados",
          data: data.map((point, idx) => (spikeIndices.has(idx) ? point.close : null)),
          borderColor: "#dc2626",
          backgroundColor: "rgba(220, 38, 38, 0.85)",
          pointRadius: data.map((_, idx) => (spikeIndices.has(idx) ? 8 : 0)),
          pointHoverRadius: data.map((_, idx) => (spikeIndices.has(idx) ? 12 : 0)),
          pointStyle: "circle",
          showLine: false,
          pointHitRadius: data.map((_, idx) => (spikeIndices.has(idx) ? 15 : 0))
        }
      ]
    };
  }, [data, symbol, spikes]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index" as const
      },
      onHover: (_event: any, elements: any[]) => {
        const canvas = chartRef.current?.canvas;
        if (!canvas) {
          return;
        }

        canvas.style.cursor = elements.length > 0 ? "pointer" : "default";
      },
      onClick: (_event: any, elements: any[]) => {
        const chartInstance = chartRef.current;

        if (!chartInstance) {
          console.warn("El gráfico aún no está listo para recibir clicks");
          return;
        }

        if (elements.length === 0) {
          setHoveredSpike(null);
          setPopoverPosition(null);
          return;
        }

        const [{ index: clickedIndex, datasetIndex }] = elements;
        const pointData = data[clickedIndex];

        if (!pointData) {
          console.warn("No se encontró información de mercado para el punto clickeado");
          return;
        }

        const existingSpike = spikes.find((s) => s.index === clickedIndex);
        const cachedSummary = newsCacheRef.current[pointData.date];
        const previousPoint = clickedIndex > 0 ? data[clickedIndex - 1] : null;
        const computedChange = previousPoint && previousPoint.close !== 0
          ? ((pointData.close - previousPoint.close) / previousPoint.close) * 100
          : 0;

        const nextSpike: PriceSpike = existingSpike
          ? { ...existingSpike }
          : {
              date: pointData.date,
              index: clickedIndex,
              close: pointData.close,
              changePercent: computedChange,
              newsLoaded: Boolean(cachedSummary),
              newsSummary: cachedSummary ?? null,
              kind: "point"
            };

        const preferredDatasetIndex = existingSpike ? 1 : datasetIndex ?? 0;
        let targetMeta = chartInstance.getDatasetMeta(preferredDatasetIndex);
        let targetElement = targetMeta?.data?.[clickedIndex];

        if (!targetElement && preferredDatasetIndex !== 0) {
          targetMeta = chartInstance.getDatasetMeta(0);
          targetElement = targetMeta?.data?.[clickedIndex];
        }

        if (!targetElement) {
          console.warn("No se pudo determinar la posición del punto clickeado");
          return;
        }

        const rect = chartInstance.canvas.getBoundingClientRect();
        const rawX = rect.left + targetElement.x;
        const rawY = rect.top + targetElement.y;

        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
        const horizontalPadding = 16;
        const effectivePopoverWidth = viewportWidth
          ? Math.min(360, viewportWidth - horizontalPadding * 2)
          : 360;
        const minX = horizontalPadding + effectivePopoverWidth / 2;
        const maxX = viewportWidth
          ? viewportWidth - horizontalPadding - effectivePopoverWidth / 2
          : rawX;

        const clampedX = viewportWidth ? Math.min(Math.max(rawX, minX), maxX) : rawX;

        setPopoverPosition({ x: clampedX, y: rawY });
        setHoveredSpike(nextSpike);
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 10,
            color: "#6b7280",
            font: {
              size: 11
            }
          },
          grid: {
            display: true,
            color: "rgba(229, 231, 235, 0.5)",
            drawTicks: true,
            tickLength: 5
          },
          border: {
            display: true,
            color: "#d1d5db"
          }
        },
        y: {
          position: "right" as const,
          ticks: {
            color: "#6b7280",
            font: {
              size: 11
            },
            callback: (value: number | string) => `$${value}`,
            padding: 8
          },
          grid: {
            display: true,
            color: "rgba(229, 231, 235, 0.5)",
            drawTicks: false
          },
          border: {
            display: true,
            color: "#d1d5db"
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
          backgroundColor: "rgba(17, 24, 39, 0.96)",
          titleColor: "#f9fafb",
          bodyColor: "#d1d5db",
          borderColor: "#374151",
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          titleFont: {
            size: 11,
            weight: 600
          },
          bodyFont: {
            size: 11,
            weight: 400
          },
          callbacks: {
            title: (context: any) => {
              return context[0].label;
            },
            label: (context: any) => {
              const price = context.parsed.y as number;
              const datasetIndex = context.datasetIndex;
              const dataIndex = context.dataIndex;
              
              if (datasetIndex === 1 && price !== null) {
                const spike = spikes.find((s) => s.index === dataIndex);
                if (spike) {
                  const typeLabel = spike.kind === "peak" ? "📈 Pico pronunciado" : "📉 Valle pronunciado";
                  return [
                    typeLabel,
                    `Cierre: $${price.toFixed(2)}`,
                    `Variación: ${spike.changePercent > 0 ? '+' : ''}${spike.changePercent.toFixed(2)}%`,
                    '⚠️ Click para ver noticias del día'
                  ];
                }
              }
              
              if (datasetIndex === 0) {
                const point = data[dataIndex];
                if (point) {
                  return [
                    `Cierre: $${price.toFixed(2)}`,
                    `Apertura: $${point.open.toFixed(2)}`,
                    `Máximo: $${point.high.toFixed(2)}`,
                    `Mínimo: $${point.low.toFixed(2)}`,
                    `Volumen: ${point.volume.toLocaleString()}`
                  ];
                }
              }
              
              return `Cierre: $${price.toFixed(2)}`;
            }
          }
        }
      }
    };
  }, [spikes, data]);

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

  const fetchNewsForSpike = useCallback(async (spike: PriceSpike) => {
    if (spike.newsLoaded) {
      return;
    }

    try {
      const companyName = `Acciones ${symbol}`;
      const response = await fetch(
        `/api/news?query=${encodeURIComponent(companyName)}&date=${spike.date}&limit=5`
      );

      if (!response.ok) {
        console.warn(`No se pudieron obtener noticias para ${spike.date}`);
        const fallbackMessage = "No se encontraron noticias para esta fecha.";

        if (spike.kind !== "point") {
          setSpikes((prev) =>
            prev.map((s) =>
              s.date === spike.date
                ? { ...s, newsLoaded: true, newsSummary: fallbackMessage }
                : s
            )
          );
        }

        newsCacheRef.current[spike.date] = fallbackMessage;

        setHoveredSpike((prev) =>
          prev && prev.date === spike.date
            ? { ...prev, newsLoaded: true, newsSummary: fallbackMessage }
            : prev
        );
        return;
      }

      const payload = await response.json();
      const summary = payload.summary || "No hay resumen disponible.";

      if (spike.kind !== "point") {
        setSpikes((prev) =>
          prev.map((s) =>
            s.date === spike.date ? { ...s, newsLoaded: true, newsSummary: summary } : s
          )
        );
      }

      newsCacheRef.current[spike.date] = summary;

      setHoveredSpike((prev) =>
        prev && prev.date === spike.date
          ? { ...prev, newsLoaded: true, newsSummary: summary }
          : prev
      );
    } catch (error) {
      console.error("Error fetching news:", error);
      const errorMessage = "Error al cargar las noticias.";

      if (spike.kind !== "point") {
        setSpikes((prev) =>
          prev.map((s) =>
            s.date === spike.date
              ? { ...s, newsLoaded: true, newsSummary: errorMessage }
              : s
          )
        );
      }

      setHoveredSpike((prev) =>
        prev && prev.date === spike.date
          ? { ...prev, newsLoaded: true, newsSummary: errorMessage }
          : prev
      );
    }
  }, [symbol]);

  useEffect(() => {
    if (hoveredSpike && !hoveredSpike.newsLoaded) {
      fetchNewsForSpike(hoveredSpike).catch(console.error);
    }
  }, [hoveredSpike, fetchNewsForSpike]);

  return (
    <div className="stocks-page">
      <header className="stocks-header">
        <div>
          <h1>Explorador de Acciones</h1>
          <p>Consulta cotizaciones históricas con datos diarios y visualízalas en un gráfico interactivo.</p>
        </div>
      </header>

      {hoveredSpike && popoverPosition && (
        <>
          <div 
            className="spike-popover-overlay" 
            onClick={() => {
              setHoveredSpike(null);
              setPopoverPosition(null);
            }}
          />
          <div
            className="spike-popover"
            style={{
              position: "fixed",
              left: `${popoverPosition.x}px`,
              top: `${popoverPosition.y}px`,
              transform: "translate(-50%, -120%)"
            }}
          >
            <button
              className="spike-popover-close"
              onClick={() => {
                setHoveredSpike(null);
                setPopoverPosition(null);
              }}
              aria-label="Cerrar"
            >
              ✕
            </button>
            <div className="spike-popover-header">
              <div className="spike-popover-title">
                <h4>{hoveredSpike.date}</h4>
                <small>
                  {hoveredSpike.kind === "peak"
                    ? "Pico pronunciado"
                    : hoveredSpike.kind === "valley"
                      ? "Valle pronunciado"
                      : "Cierre diario"}
                </small>
              </div>
              <span
                className={
                  hoveredSpike.changePercent > 0
                    ? "change-positive"
                    : hoveredSpike.changePercent < 0
                      ? "change-negative"
                      : "change-neutral"
                }
              >
                {hoveredSpike.changePercent > 0 ? "+" : hoveredSpike.changePercent < 0 ? "" : "±"}
                {Math.abs(hoveredSpike.changePercent).toFixed(2)}%
              </span>
            </div>
            <div className="spike-popover-body">
              <p className="price-detail">
                Precio de cierre: <strong>${hoveredSpike.close.toFixed(2)}</strong>
              </p>
              {!hoveredSpike.newsLoaded && <p className="loading-news">Cargando noticias...</p>}
              {hoveredSpike.newsLoaded && (
                <p className="news-summary">{hoveredSpike.newsSummary || "Sin noticias disponibles."}</p>
              )}
            </div>
          </div>
        </>
      )}

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
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <p className="error-message">{error}</p>
            {error.includes("límite") && (
              <p className="error-hint">
                💡 Sugerencia: Si ves errores frecuentes, considera esperar un momento antes de intentar nuevamente.
              </p>
            )}
            {suggestions.length > 0 && (
              <div className="suggestions-container">
                <p className="suggestions-title">¿Quisiste buscar alguno de estos?</p>
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
              </div>
            )}
          </div>
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
              <Line options={chartOptions} data={chartData} ref={chartRef} />
            </div>
          </>
        )}
      </section>

    </div>
  );
}
