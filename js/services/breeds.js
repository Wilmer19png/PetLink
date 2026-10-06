/* =========================================================
   Servicio externo: CATÁLOGO DE RAZAS (RF-04, RF-19)
   ---------------------------------------------------------
   - Perros: Dog CEO API (https://dog.ceo) · sin clave · con fotos
   - Gatos: catfact.ninja (/breeds) · sin clave
   - Opcional: The Dog API / The Cat API si se configura la clave
   Se guarda en caché local para no pedirlo cada vez (sección 14).
   ========================================================= */
PL.services = PL.services || {};

PL.services.breeds = (function () {
  const U = PL.utils;
  const cfg = () => PL.config.breeds;
  const MIXED = { label: "Criollo / Mestizo", key: "" };

  function cached(name, loader) {
    const key = "pl_breeds_" + name;
    const hit = U.store.get(key, null);
    const maxAge = cfg().cacheDays * 86400000;
    if (hit && Date.now() - hit.at < maxAge && hit.items.length) return Promise.resolve(hit.items);
    return loader().then(items => {
      U.store.set(key, { at: Date.now(), items });
      return items;
    }).catch(err => {
      console.warn("Catálogo de razas no disponible:", err.message);
      return hit ? hit.items : [];
    });
  }

  async function dogs() {
    return cached("dogs", async () => {
      if (cfg().theDogApiKey) {
        const list = await U.fetchJson("https://api.thedogapi.com/v1/breeds", { headers: { "x-api-key": cfg().theDogApiKey } });
        return list.map(b => ({ label: b.name, key: b.name.toLowerCase(), temperament: b.temperament, lifeSpan: b.life_span, group: b.breed_group, weight: b.weight && b.weight.metric }));
      }
      const json = await U.fetchJson(cfg().dogCeoUrl + "/breeds/list/all");
      const out = [];
      Object.entries(json.message).forEach(([breed, subs]) => {
        if (!subs.length) out.push({ label: U.titleCase(breed), key: breed });
        subs.forEach(sub => out.push({ label: U.titleCase(sub + " " + breed), key: breed + "/" + sub }));
      });
      return out.sort((a, b) => a.label.localeCompare(b.label));
    });
  }

  async function cats() {
    return cached("cats", async () => {
      if (cfg().theCatApiKey) {
        const list = await U.fetchJson("https://api.thecatapi.com/v1/breeds", { headers: { "x-api-key": cfg().theCatApiKey } });
        return list.map(b => ({ label: b.name, key: b.name, id: b.id, temperament: b.temperament, lifeSpan: b.life_span, origin: b.origin, energy: b.energy_level }));
      }
      const json = await U.fetchJson(cfg().catBreedsUrl);
      return json.data.map(b => ({ label: b.breed, key: b.breed, origin: b.country, coat: b.coat, pattern: b.pattern }))
        .sort((a, b) => a.label.localeCompare(b.label));
    });
  }

  async function list(especie) {
    if (especie === "perro") return [MIXED].concat(await dogs());
    if (especie === "gato") return [MIXED].concat(await cats());
    return [MIXED];
  }

  async function info(especie, key) {
    if (!key) return null;
    const items = especie === "perro" ? await dogs() : especie === "gato" ? await cats() : [];
    return items.find(b => b.key === key) || null;
  }

  /** URL de una foto de la raza (o de la especie si no hay raza). */
  async function image(especie, key) {
    try {
      if (especie === "perro") {
        const url = key ? cfg().dogCeoUrl + "/breed/" + key + "/images/random" : cfg().dogCeoUrl + "/breeds/image/random";
        const json = await U.fetchJson(url);
        return json.message;
      }
      if (especie === "gato") {
        const json = await U.fetchJson("https://api.thecatapi.com/v1/images/search?limit=1");
        return json[0] && json[0].url;
      }
    } catch (e) {
      console.warn("Imagen de raza no disponible:", e.message);
    }
    return "";
  }

  return { list, info, image, MIXED };
})();
