/* =========================================================
   PetLink · Proxy de IA (Cloudflare Worker)
   ---------------------------------------------------------
   Recibe { especie, raza } desde la app y llama a la API de
   Claude para generar el perfil informativo de la raza (RF-19).
   La clave ANTHROPIC_API_KEY vive como secreto del Worker y
   nunca se envía al navegador (decisión de diseño 16.2).
   ========================================================= */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    energia: {
      type: "object",
      properties: {
        nivel: { type: "string", enum: ["baja", "media", "alta", "muy alta"] },
        texto: { type: "string" }
      },
      required: ["nivel", "texto"],
      additionalProperties: false
    },
    predisposiciones: { type: "array", items: { type: "string" } },
    cuidados: { type: "array", items: { type: "string" } },
    resumen: { type: "string" }
  },
  required: ["energia", "predisposiciones", "cuidados", "resumen"],
  additionalProperties: false
};

const SYSTEM = `Eres el asistente educativo de PetLink, una app colombiana que conecta a dueños de mascotas con sus veterinarios.
Generas perfiles informativos de razas para dueños, en español neutro y claro, sin tecnicismos innecesarios.
Reglas:
- Es información general por raza, no un diagnóstico ni una recomendación médica para una mascota concreta.
- No indiques medicamentos ni dosis.
- "energia.texto": una frase corta sobre su necesidad de actividad.
- "predisposiciones": 3 problemas de salud frecuentes en la raza (frases cortas).
- "cuidados": 3 cuidados prácticos (frases cortas).
- "resumen": una o dos frases sobre su carácter.
- Si es criollo o mestizo, habla de cuidados generales de la especie.`;

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (allowed.includes("*") ? "*" : origin) : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(env, origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST" || url.pathname !== "/breed-profile") return json({ error: "Ruta no encontrada" }, 404, headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Falta configurar ANTHROPIC_API_KEY en el Worker" }, 500, headers);

    let input;
    try {
      input = await request.json();
    } catch {
      return json({ error: "JSON inválido" }, 400, headers);
    }
    const especie = ["perro", "gato", "otro"].includes(input.especie) ? input.especie : null;
    const raza = String(input.raza || "").trim().slice(0, 80);
    if (!especie || !raza) return json({ error: "Envía especie (perro, gato u otro) y raza" }, 400, headers);

    const catalogo = input.datosCatalogo && typeof input.datosCatalogo === "object"
      ? JSON.stringify(input.datosCatalogo).slice(0, 600)
      : "sin datos";

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{
          role: "user",
          content: `Especie: ${especie}\nRaza: ${raza}\nDatos del catálogo de razas: ${catalogo}\n\nGenera el perfil informativo de esta raza.`
        }]
      });

      if (response.stop_reason === "refusal") return json({ error: "La IA no pudo generar este perfil" }, 422, headers);
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
      const profile = JSON.parse(text);
      return json({ ...profile, modelo: "Claude (" + response.model + ")" }, 200, headers);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: "Demasiadas solicitudes, intenta más tarde" }, 429, headers);
      if (err instanceof Anthropic.APIError) return json({ error: "Error de la API de Claude (" + err.status + ")" }, 502, headers);
      if (err instanceof SyntaxError) return json({ error: "La respuesta de la IA no tenía el formato esperado" }, 502, headers);
      return json({ error: "Error inesperado: " + err.message }, 500, headers);
    }
  }
};
