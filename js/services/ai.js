/* =========================================================
   Servicio externo: MODELO DE LENGUAJE / IA (RF-19, RNF-11)
   ---------------------------------------------------------
   Genera el perfil informativo de una raza llamando a la API de
   Claude A TRAVÉS de un proxy (server/claude-proxy). La clave de
   Anthropic nunca llega al navegador (decisión 16.2).

   Si el proxy no está configurado o falla, usa una base de
   conocimiento local para que la pantalla siga funcionando, y lo
   indica claramente en el campo "fuente".
   ========================================================= */
PL.services = PL.services || {};

PL.services.ai = (function () {
  const U = PL.utils;
  const DISCLAIMER = "Información general generada con IA. No reemplaza al veterinario.";

  async function breedProfile({ especie, raza, razaKey }) {
    const catalog = await PL.services.breeds.info(especie, razaKey).catch(() => null);
    const proxy = PL.config.ai.proxyUrl;
    if (proxy) {
      try {
        const json = await U.fetchJson(proxy.replace(/\/$/, "") + "/breed-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ especie, raza, datosCatalogo: catalog })
        }, PL.config.ai.timeoutMs);
        if (json && json.energia) {
          return normalize(json, "ia", json.modelo || "Claude");
        }
        throw new Error(json && json.error ? json.error : "Respuesta inválida del proxy de IA");
      } catch (err) {
        console.warn("IA no disponible, se usa la base local:", err.message);
        return normalize(localProfile(especie, raza, catalog), "local", "Base local (la IA no respondió: " + err.message + ")");
      }
    }
    return normalize(localProfile(especie, raza, catalog), "local", "Base local (configura el proxy de IA para usar Claude)");
  }

  function normalize(p, fuente, detalle) {
    return {
      energia: p.energia || { nivel: "media", texto: "" },
      predisposiciones: (p.predisposiciones || []).slice(0, 5),
      cuidados: (p.cuidados || []).slice(0, 5),
      resumen: p.resumen || "",
      fuente, detalleFuente: detalle,
      aviso: fuente === "ia" ? DISCLAIMER : "Información general de referencia. No reemplaza al veterinario."
    };
  }

  /* ---------- Base de conocimiento local (respaldo) ---------- */
  const KB = {
    perro: {
      labrador: { energia: ["alta", "Necesita ejercicio diario y juegos de buscar"], predisposiciones: ["Displasia de cadera y codo", "Tendencia al sobrepeso", "Otitis por orejas caídas"], cuidados: ["Dieta medida y control de peso", "Paseos largos todos los días", "Revisiones articulares periódicas"], resumen: "Raza amigable, sociable y muy activa, ideal para familias." },
      "retriever/golden": { energia: ["alta", "Disfruta del ejercicio y del agua"], predisposiciones: ["Displasia de cadera", "Problemas de piel", "Algunos tipos de cáncer"], cuidados: ["Cepillado varias veces por semana", "Ejercicio diario", "Chequeos anuales completos"], resumen: "Perro dócil y familiar, muy fácil de entrenar." },
      "bulldog/english": { energia: ["baja", "Paseos cortos y tranquilos"], predisposiciones: ["Problemas respiratorios (braquicéfalo)", "Dermatitis en los pliegues", "Sensibilidad al calor"], cuidados: ["Evitar ejercicio en horas de calor", "Limpiar y secar los pliegues de la piel", "Control de peso"], resumen: "Tranquilo y cariñoso; requiere cuidado especial con el calor." },
      "bulldog/french": { energia: ["media", "Juegos cortos varias veces al día"], predisposiciones: ["Síndrome braquicéfalo", "Problemas de columna", "Alergias de piel"], cuidados: ["Evitar el calor y el ejercicio intenso", "Arnés en lugar de collar", "Limpieza de pliegues"], resumen: "Compañero alegre y adaptable a apartamentos." },
      beagle: { energia: ["alta", "Mucho olfato y energía para explorar"], predisposiciones: ["Obesidad", "Otitis", "Epilepsia"], cuidados: ["Paseos con correa (sigue rastros)", "Limpieza de orejas", "Porciones de comida controladas"], resumen: "Curioso, sociable y con gran instinto de rastreo." },
      "german/shepherd": { energia: ["alta", "Necesita ejercicio y estímulo mental"], predisposiciones: ["Displasia de cadera", "Mielopatía degenerativa", "Problemas digestivos"], cuidados: ["Entrenamiento y socialización temprana", "Ejercicio diario", "Control articular"], resumen: "Inteligente, leal y protector." },
      poodle: { energia: ["media", "Activo y juguetón"], predisposiciones: ["Luxación de rótula", "Problemas dentales", "Enfermedades oculares"], cuidados: ["Higiene dental frecuente", "Peluquería regular", "Juego y estímulo mental"], resumen: "Muy inteligente y de pelo que suelta poco." },
      chihuahua: { energia: ["media", "Paseos cortos y juego en casa"], predisposiciones: ["Problemas dentales", "Luxación de rótula", "Hipoglucemia en cachorros"], cuidados: ["Abrigo en clima frío", "Limpieza dental", "Evitar caídas desde altura"], resumen: "Pequeño, valiente y muy apegado a su familia." },
      pug: { energia: ["baja", "Ejercicio suave"], predisposiciones: ["Problemas respiratorios", "Lesiones oculares", "Obesidad"], cuidados: ["Evitar el calor", "Limpieza de pliegues faciales", "Dieta controlada"], resumen: "Cariñoso y tranquilo, sensible al calor." },
      husky: { energia: ["muy alta", "Necesita correr mucho"], predisposiciones: ["Enfermedades oculares", "Hipotiroidismo", "Golpe de calor"], cuidados: ["Ejercicio intenso diario", "Cepillado en época de muda", "Sombra y agua en clima cálido"], resumen: "Enérgico, independiente y muy sociable con otros perros." },
      _default: { energia: ["media", "Paseos diarios y juego"], predisposiciones: ["Parásitos internos y externos", "Enfermedad dental", "Sobrepeso si hay poca actividad"], cuidados: ["Vacunas y desparasitación al día", "Higiene dental", "Ejercicio acorde a su tamaño"], resumen: "Los perros criollos suelen ser resistentes; lo más importante es la prevención." }
    },
    gato: {
      siamese: { energia: ["alta", "Muy activo y comunicativo"], predisposiciones: ["Problemas respiratorios", "Enfermedad dental", "Estrabismo"], cuidados: ["Juego interactivo diario", "Compañía (no tolera la soledad)", "Higiene dental"], resumen: "Vocal, inteligente y muy apegado a las personas." },
      persian: { energia: ["baja", "Tranquilo y hogareño"], predisposiciones: ["Enfermedad renal poliquística", "Problemas respiratorios", "Lagrimeo"], cuidados: ["Cepillado diario", "Limpieza de ojos", "Controles renales"], resumen: "Calmado y afectuoso, requiere cuidado del pelaje." },
      "maine coon": { energia: ["media", "Juguetón y sociable"], predisposiciones: ["Cardiomiopatía hipertrófica", "Displasia de cadera", "Sobrepeso"], cuidados: ["Rascadores grandes", "Cepillado semanal", "Controles cardiacos"], resumen: "Gato grande, amigable y de carácter tranquilo." },
      bengal: { energia: ["muy alta", "Necesita mucho estímulo"], predisposiciones: ["Cardiomiopatía", "Problemas digestivos", "Atrofia de retina"], cuidados: ["Enriquecimiento ambiental", "Juego diario", "Espacios para trepar"], resumen: "Activo, curioso y muy inteligente." },
      _default: { energia: ["media", "Juego diario y lugares para trepar"], predisposiciones: ["Problemas urinarios por poca hidratación", "Enfermedad dental", "Sobrepeso en gatos de interior"], cuidados: ["Varias fuentes de agua", "Arenero limpio", "Vacunas y desparasitación al día"], resumen: "Los gatos criollos son resistentes y adaptables." }
    },
    otro: {
      _default: { energia: ["media", "Depende de la especie"], predisposiciones: ["Consulta con un veterinario especializado en tu especie"], cuidados: ["Ambiente adecuado a su especie", "Controles periódicos"], resumen: "Cada especie tiene necesidades muy distintas." }
    }
  };

  function localProfile(especie, raza, catalog) {
    const base = KB[especie] || KB.otro;
    const key = (catalog && catalog.key ? catalog.key : raza || "").toLowerCase();
    const entry = base[key] || base[key.split("/")[0]] || base._default;
    const p = {
      energia: { nivel: entry.energia[0], texto: entry.energia[1] },
      predisposiciones: entry.predisposiciones.slice(),
      cuidados: entry.cuidados.slice(),
      resumen: entry.resumen
    };
    if (catalog) {
      const extra = [];
      if (catalog.origin) extra.push("origen: " + catalog.origin);
      if (catalog.coat) extra.push("pelaje " + catalog.coat.toLowerCase());
      if (catalog.temperament) extra.push("temperamento: " + catalog.temperament.toLowerCase());
      if (catalog.lifeSpan) extra.push("esperanza de vida: " + catalog.lifeSpan);
      if (extra.length && base[key] == null) p.resumen = raza + " (" + extra.join(", ") + "). " + p.resumen;
    }
    return p;
  }

  return { breedProfile, DISCLAIMER };
})();
