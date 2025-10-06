# Tilde News

Aplicación web construida con Next.js 15 que permite buscar titulares recientes en Google News RSS, obtener un listado curado y, si se configura OpenAI, generar un resumen automático de los temas más repetidos. El frontend consume la API propia alojada en `/api/news`, ofreciéndote una interfaz moderna y responsiva para investigar sectores, empresas o palabras clave.

> **Live demo:** https://tilde-news.vercel.app/

## Tabla de contenidos

- [Características principales](#características-principales)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos previos](#requisitos-previos)
- [Variables de entorno](#variables-de-entorno)
- [Puesta en marcha](#puesta-en-marcha)
- [Colección Postman](#colección-postman)
- [Explorador de acciones](#explorador-de-acciones)
- [Endpoints disponibles](#endpoints-disponibles)
- [Flujo de datos](#flujo-de-datos)
- [Buenas prácticas y comprobaciones](#buenas-prácticas-y-comprobaciones)
- [Próximos pasos sugeridos](#próximos-pasos-sugeridos)

## Características principales

- **Búsqueda avanzada** sobre Google News RSS aplicando filtros de idioma, país, fecha exacta o ventana de días.
- **Interfaz responsive** que divide el panel de filtros y los resultados, optimizada para escritorio y móviles.
- **Resumen automatizado** con OpenAI (opcional) que condensa los títulos más repetidos en un único párrafo informativo.
- **Gestión de errores** clara, mostrando mensajes diferenciados para problemas de validación, límites de la API o conectividad.
- **Experiencia en tiempo real**: los resultados se obtienen directamente desde Google News al momento de la consulta.
- **Explorador bursátil** con gráficos interactivos y datos históricos diarios provistos por Yahoo Finance.

## Stack tecnológico

- [Next.js 15](https://nextjs.org/) (App Router, API routes) con React 19 y TypeScript.
- [Axios](https://axios-http.com/) para llamadas HTTP desde el cliente y el servidor.
- [xml2js](https://www.npmjs.com/package/xml2js) para transformar el feed RSS en objetos JavaScript.
- [OpenAI Node SDK v4](https://github.com/openai/openai-node) para el resumen automatizado (modelos GPT-4o mini).
- [Chart.js](https://www.chartjs.org/) + [react-chartjs-2](https://react-chartjs-2.js.org/) para la renderización de gráficos bursátiles.
- [Yahoo Finance](https://github.com/gadicc/node-yahoo-finance2) como fuente gratuita de datos históricos de acciones (sin API key requerida).
- Estilos con CSS modular (`NewsSearch.css`) y tipografía global definida en `globals.css`.

## Estructura del proyecto

```text
app/
  layout.tsx        # Layout raíz, metadatos y estilos globales
  page.tsx          # Página principal con el componente de búsqueda
  api/
    route.ts        # Índice de la API con información general
    health/route.ts # Endpoint de health-check
    news/route.ts   # Endpoint que consulta Google News RSS y opcionalmente OpenAI
    stocks/route.ts # Endpoint que obtiene precios diarios desde Yahoo Finance
components/
  NewsSearch.tsx    # Componente principal del buscador con lógica de UI
  NewsSearch.css    # Estilos específicos del componente
  StockExplorer.tsx # Página interactiva para explorar acciones y gráficos
  StockExplorer.css # Estilos del explorador de acciones
app/stocks/page.tsx # Página principal del explorador bursátil
services/
  newsService.ts    # Cliente Axios que consume la API desde el frontend
```

## Requisitos previos

- Node.js **>= 18.18** (recomendado 20 LTS). Puedes verificar con:

```powershell
node -v
```

- npm **>= 9** (se instala junto con Node). Comprueba la versión con:

```powershell
npm -v
```

## Variables de entorno

Crea un archivo `.env.local` en la raíz con las claves que necesites:

```env
# Requerido sólo si quieres habilitar el resumen automático
OPENAI_API_KEY=sk-...

# Base URL que usará el frontend (por defecto "/api")
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api

# Tiempo máximo de espera (ms) para las solicitudes desde el cliente
NEXT_PUBLIC_API_TIMEOUT=15000
```

> Si `OPENAI_API_KEY` no está definido, la aplicación seguirá funcionando; simplemente omitirá el resumen automatizado.
> Yahoo Finance no requiere API key y es completamente gratuito para consultas razonables.

## Puesta en marcha

1. **Instala las dependencias**:

   ```powershell
   npm install
   ```

2. **Levanta el entorno de desarrollo** (http://localhost:3000):

   ```powershell
   npm run dev
   ```

3. **Compila y ejecuta en producción** (opcional):

   ```powershell
   npm run build
   npm start
   ```

4. **Ejecuta el linting** para asegurar el estilo de código:

   ```powershell
   npm run lint
   ```

## Colección Postman

- Archivo: `postman/tilde-news-api.postman_collection.json`.
- Importa la colección en Postman y ajusta la variable `baseUrl` según tu entorno (por defecto `http://localhost:3000`).
- Incluye requests listos para `/api`, `/api/health` y `/api/news` (búsquedas por días y por fecha exacta).

## Explorador de acciones

- Página disponible en `/stocks` con buscador de ticker, selector de periodo (1M, 3M, 6M, 1Y o máximo disponible) y gráfico lineal de precios de cierre diarios.
- **No requiere API key**: utiliza Yahoo Finance de forma completamente gratuita y sin límites estrictos.
- La API interna `/api/stocks` obtiene datos históricos de Yahoo Finance y los normaliza exponiendo: fecha, apertura, cierre, máximos, mínimos y volumen.
- Incluye tabla de los últimos 10 días y resaltado del último precio de cierre para facilitar el análisis rápido.

## Endpoints disponibles

### `GET /api/news`
Obtiene noticias desde Google News RSS.

#### Parámetros de consulta

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `query`   | string | Sí | Término de búsqueda o expresión (soporta operadores OR, comillas, etc.) |
| `days`    | number | opcional | Ventana de tiempo en días. Por defecto 7. Ignorado si se usa `date`. |
| `date`    | string (YYYY-MM-DD) | opcional | Fecha exacta a consultar. No puede combinarse con `days`. |
| `language`| string | opcional | Código de idioma/región para Google News (por defecto `es-419`). |
| `country` | string | opcional | País para la búsqueda (por defecto `AR`). |
| `limit`   | number | opcional | Número máximo de resultados devueltos (por defecto 10). |

#### Respuesta

```json
{
  "success": true,
  "query": "YPF",
  "totalResults": 10,
  "requestedDays": 7,
  "language": "es-419",
  "country": "AR",
  "rssUrl": "https://news.google.com/rss/search?...",
  "summary": "Resumen opcional generado con OpenAI.",
  "news": [
    {
      "title": "YPF anuncia nueva inversión...",
      "link": "https://www.diario.com/nota",
      "description": "Texto del feed RSS",
      "pubDate": "Thu, 03 Oct 2025 12:34:56 GMT",
      "source": "Diario Ejemplo",
      "guid": "tag:news.google.com,..."
    }
  ]
}
```

**Ejemplo con `curl`**

```powershell
curl "http://localhost:3000/api/news?query=YPF&days=7&limit=5"
```

## Flujo de datos

1. El usuario ingresa un término y (opcionalmente) una fecha desde el componente `NewsSearch`.
2. El frontend invoca `services/newsService.ts`, que construye la URL contra `/api/news` con Axios.
3. El endpoint `/api/news` genera la URL de Google News RSS, descarga el feed y lo parsea con `xml2js`.
4. Si existe `OPENAI_API_KEY`, las cabeceras de los artículos se envían a OpenAI para crear un resumen.
5. La respuesta JSON se devuelve al cliente, que renderiza la lista y el resumen en pantalla.

## Buenas prácticas y comprobaciones

- `npm run lint` mantiene el estilo y las reglas de Next.js.
- Los mensajes de error están localizados en español para mejorar la UX.
- El cliente maneja estados de carga, ausencia de resultados y errores de conectividad.
- El servidor controla parámetros inválidos (`query` vacío, combinación de `days` + `date`, errores de fecha, etc.).

## Próximos pasos sugeridos

- Implementar paginación o lazy loading para manejar más de 10 resultados.
- Añadir pruebas unitarias/e2e (por ejemplo con Jest + Testing Library o Playwright).
- Permitir elegir idioma/país desde la UI sin modificar el código.
- Guardar búsquedas recientes o favoritas en localStorage o una base de datos.
