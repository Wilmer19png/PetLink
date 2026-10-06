# Proxy de IA de PetLink (API de Claude)

La app genera el **perfil informativo de raza** (RF-19) con la API de Claude.
Según la decisión de diseño 16.2, los servicios externos se consumen desde el
backend: la clave de Anthropic vive solo en este proxy y nunca llega al navegador.

Mientras el proxy no esté configurado, la app usa una base de conocimiento local
y lo indica en la pantalla ("Fuente: Base local").

## Desplegarlo (Cloudflare Workers, plan gratuito)

Requisitos: [Node.js](https://nodejs.org) 20 o superior, una cuenta gratuita de
[Cloudflare](https://dash.cloudflare.com/sign-up) y una clave de la API de
Anthropic ([console.anthropic.com](https://console.anthropic.com)).

```bash
cd server/claude-proxy
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # pega la clave cuando la pida
npx wrangler deploy
```

`wrangler deploy` imprime una URL como `https://petlink-ia.<tu-cuenta>.workers.dev`.

## Conectarlo a la app

Crea el archivo `js/config.local.js` (está en `.gitignore`):

```js
PL.config.ai.proxyUrl = "https://petlink-ia.<tu-cuenta>.workers.dev";
```

Para la versión publicada en GitHub Pages puedes poner la URL directamente en
`js/config.js` (la URL del proxy no es secreta; la clave sí, y esa no sale del Worker).

## Contrato

`POST /breed-profile`

```json
{ "especie": "perro", "raza": "Labrador", "datosCatalogo": { "label": "Labrador" } }
```

Respuesta:

```json
{
  "energia": { "nivel": "alta", "texto": "Necesita ejercicio diario" },
  "predisposiciones": ["Displasia de cadera", "..."],
  "cuidados": ["Control de peso", "..."],
  "resumen": "Raza amigable y activa.",
  "modelo": "Claude (claude-opus-5-5)"
}
```

El backend de PetLink guarda cada perfil generado (entidad *Perfil de raza*) para
no volver a llamar a la IA en cada consulta (sección 15.1).
