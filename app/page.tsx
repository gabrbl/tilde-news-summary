import Link from "next/link";
import NewsSearch from "../components/NewsSearch";

export default function Home() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Tilde News</h1>
        <p>Busca las últimas noticias</p>
        <nav className="app-nav">
          <Link href="/stocks" className="secondary-link">
            Explorar gráficos de acciones
          </Link>
        </nav>
      </header>
      <main className="app-main">
        <NewsSearch />
      </main>
    </div>
  );
}
