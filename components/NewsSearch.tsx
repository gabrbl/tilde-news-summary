'use client';

import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import { fetchNews } from "../services/newsService";
import "./NewsSearch.css";

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  guid: string;
}

interface FetchNewsParams {
  query: string;
  days?: number;
  language?: string;
  country?: string;
  limit?: number;
  date?: string | null;
}

const NewsSearch = () => {
  const [query, setQuery] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [totalResults, setTotalResults] = useState<number>(0);
  const [summary, setSummary] = useState<string>("");

  const cleanHtmlContent = (htmlString: string) => {
    if (!htmlString) return "";

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    const textContent = tempDiv.textContent || tempDiv.innerText || "";

    return textContent.trim().replace(/\s+/g, " ");
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Por favor ingresa un término de búsqueda");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const searchParams: FetchNewsParams = {
        query: query.trim(),
        limit: 10,
        language: "es-419",
        country: "AR"
      };

      if (selectedDate) {
        searchParams.date = selectedDate;
      }

      const result = await fetchNews(searchParams);

      if (result.success && result.news && result.news.length > 0) {
        setNews(result.news);
        setTotalResults(result.totalResults);
        setSummary(result.summary || "");
        setError("");
      } else {
        setNews([]);
        setTotalResults(0);
        setSummary("");
        setError("No se encontraron noticias para tu búsqueda. Intenta con otros términos.");
      }
    } catch (err: any) {
      console.error("Error fetching news:", err);
      setNews([]);
      setTotalResults(0);
      setSummary("");

      if (err.message.includes("conexión")) {
        setError("❌ Error de conexión a internet. Verifica tu conexión y vuelve a intentar.");
      } else if (err.message.includes("requerido")) {
        setError("❌ Por favor ingresa un término de búsqueda.");
      } else {
        setError(`❌ ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Sin fecha";

    try {
      const date = new Date(dateString);

      if (Number.isNaN(date.getTime())) return "Fecha inválida";

      const now = new Date();
      const diffTime = Number(now) - Number(date);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return (
          date.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit"
          }) + " (hoy)"
        );
      } else if (diffDays === 1) {
        return "Ayer";
      } else if (diffDays < 7) {
        return `Hace ${diffDays} días`;
      } else {
        return date.toLocaleDateString("es-AR", {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }
    } catch (error) {
      return "Error en fecha";
    }
  };

  const openArticle = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="news-search">
      <div className="search-panel">
        <div className="search-form">
          <h2>Buscar Noticias</h2>

          <div className="form-group">
            <label htmlFor="query">Término de búsqueda:</label>
            <input
              id="query"
              type="text"
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ej: YPF, AAPL, Intel..."
              className="query-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="selectedDate">Fecha específica:</label>
            <input
              id="selectedDate"
              type="date"
              value={selectedDate}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedDate(e.target.value)}
              className="date-input"
              max={new Date().toISOString().split("T")[0]}
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="search-button"
          >
            {loading ? "Buscando..." : "Buscar Noticias"}
          </button>

          {error && <div className="error-message">{error}</div>}

          {summary && query && (
            <div className="news-summary search-summary desktop-summary">
              <h4>Resumen de las noticias</h4>
              <p>{summary}</p>
            </div>
          )}
        </div>
      </div>

      {summary && query && (
        <div className="news-summary mobile-summary">
          <h4>Resumen de las noticias</h4>
          <p>{summary}</p>
        </div>
      )}

      <div className="news-results">
        {totalResults > 0 && (
          <div className="results-header">
            <h3>Resultados ({totalResults} noticias encontradas)</h3>
            <p className="search-info">
              Búsqueda: &quot;{query}&quot; {selectedDate && ` - Fecha: ${new Date(selectedDate).toLocaleDateString("es-AR")}`}
            </p>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando noticias...</p>
          </div>
        )}

        <div className="news-list">
          {news.map((article, index) => (
            <article key={index} className="news-item">
              <div className="news-content">
                <h4 className="news-title" onClick={() => openArticle(article.link)}>
                  {article.title}
                </h4>
                <p className="news-description">
                  {cleanHtmlContent(article.description)}
                </p>
                <div className="news-meta">
                  <div className="news-meta-row">
                    <span className="news-source">{article.source}</span>
                    <span className="news-date">📅 {formatDate(article.pubDate)}</span>
                  </div>
                </div>
              </div>
              <button className="read-more-btn" onClick={() => openArticle(article.link)}>
                Leer más →
              </button>
            </article>
          ))}
        </div>

        {!loading && news.length === 0 && query && (
          <div className="no-results">
            <h3>No se encontraron noticias</h3>
            <p>Intenta con otros términos de búsqueda o cambia el rango de fechas.</p>
          </div>
        )}

        {!query && (
          <div className="welcome-message">
            <h3>¡Bienvenido a Tilde News!</h3>
            <p>
              Busca las últimas noticias directamente desde <strong>Google News RSS</strong>
            </p>
            <div className="example-queries">
              <p>Ejemplos de búsqueda:</p>
              <ul>
                <li>&quot;Bitcoin&quot;</li>
                <li>&quot;Argentina economía&quot;</li>
                <li>&quot;tecnología IA&quot;</li>
                <li>&quot;YPF OR Vaca Muerta&quot;</li>
              </ul>
              <p>
                <small>📡 Todas las noticias son extraídas en tiempo real de Google News</small>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsSearch;
