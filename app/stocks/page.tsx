import StockExplorer from "../../components/StockExplorer";

export const metadata = {
  title: "Explorador de Acciones | Tilde News",
  description: "Visualiza cotizaciones históricas y gráficos de acciones utilizando Yahoo Finance"
};

export default function StocksPage() {
  return <StockExplorer />;
}
