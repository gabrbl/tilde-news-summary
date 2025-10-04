import NewsSearch from "../components/NewsSearch";

export default function Home() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Tilde News</h1>
        <p>Busca las últimas noticias</p>
      </header>
      <main className="app-main">
        <NewsSearch />
      </main>
    </div>
  );
}
