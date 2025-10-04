import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    service: "Tilde News API",
    version: "1.0.0",
    description: "API REST para extraer noticias de Google News RSS",
    endpoints: {
      "/api/news": "Obtener noticias basadas en query y fecha",
      "/api/health": "Estado de salud del servicio"
    }
  });
}
