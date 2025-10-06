import type { Metadata } from "next";
import type { ReactNode } from "react";
import Header from "../components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tilde News",
  description: "Busca las últimas noticias desde Google News RSS"
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Header />
        <main style={{ paddingTop: "64px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
