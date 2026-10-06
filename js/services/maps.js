/* =========================================================
   Servicio externo: MAPAS Y GEOLOCALIZACIÓN (RF-21 a RF-23)
   ---------------------------------------------------------
   - Leaflet + mapas base de OpenStreetMap (sin clave)
   - Overpass API: veterinarias reales registradas en OSM
   - Geolocation API del navegador: la ubicación solo se usa en
     memoria para ordenar resultados y NO se guarda (sección 15.1)
   ========================================================= */
PL.services = PL.services || {};

PL.services.maps = (function () {
  const U = PL.utils;
  const osmCache = {};
  let lastLocation = null; // solo en memoria

  function getLocation() {
    return new Promise(resolve => {
      const fallback = Object.assign({ real: false }, PL.config.defaultLocation);
      if (!navigator.geolocation) return resolve(fallback);
      navigator.geolocation.getCurrentPosition(
        pos => resolve((lastLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, real: true, label: "Tu ubicación" })),
        () => resolve(lastLocation || fallback),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    });
  }

  /** Veterinarias de OpenStreetMap cercanas a un punto. */
  async function osmVets(lat, lng, radiusM) {
    const r = radiusM || PL.config.maps.searchRadiusM;
    const key = lat.toFixed(3) + "," + lng.toFixed(3) + "," + r;
    if (osmCache[key]) return osmCache[key];
    const query = `[out:json][timeout:20];nwr["amenity"="veterinary"](around:${r},${lat},${lng});out center 60;`;
    let json = null;
    let lastError = null;
    // Si el servidor principal falla o está saturado, se intenta con el espejo.
    for (const url of PL.config.maps.overpassUrls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query)
        });
        if (!res.ok) throw new Error("Overpass respondió " + res.status);
        json = await res.json();
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!json) throw lastError || new Error("Overpass no disponible");
    const items = (json.elements || []).map(el => {
      const t = el.tags || {};
      const plat = el.lat != null ? el.lat : el.center && el.center.lat;
      const plng = el.lon != null ? el.lon : el.center && el.center.lon;
      const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" # ");
      return {
        id: "osm_" + el.type + "_" + el.id,
        fuente: "osm",
        nombre: t.name || "Veterinaria",
        lat: plat, lng: plng,
        telefono: t.phone || t["contact:phone"] || "",
        web: t.website || t["contact:website"] || "",
        horario: t.opening_hours || "",
        direccion: street || t["addr:full"] || "",
        domicilio: false,
        servicios: [],
        osmUrl: "https://www.openstreetmap.org/" + el.type + "/" + el.id
      };
    }).filter(v => v.lat != null && v.lng != null);
    osmCache[key] = items;
    return items;
  }

  /* ---------- "Abierto hoy" ---------- */
  const OSM_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  function openTodayOsm(hours) {
    if (!hours) return false;
    if (/24\/7/.test(hours)) return true;
    const today = new Date().getDay();
    const segments = hours.split(";");
    return segments.some(seg => {
      const m = seg.trim().match(/^([A-Za-z,\- ]+)\s+\d/);
      if (!m) return false;
      return m[1].split(",").some(part => {
        const [a, b] = part.trim().split("-").map(s => OSM_DAYS.indexOf(s.trim()));
        if (a < 0) return false;
        if (b == null || b < 0) return a === today;
        return a <= b ? today >= a && today <= b : today >= a || today <= b;
      });
    });
  }
  function openToday(vet) {
    if (vet.fuente === "osm") return openTodayOsm(vet.horario);
    return (vet.dias || []).includes(new Date().getDay());
  }

  /* ---------- Leaflet ---------- */
  function createMap(el, center, zoom) {
    if (!window.L) throw new Error("No se pudo cargar la librería de mapas (Leaflet)");
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom || 14);
    L.tileLayer(PL.config.maps.tileUrl, { maxZoom: 19, attribution: PL.config.maps.attribution }).addTo(map);
    // Leaflet calcula el tamaño al crearse; se recalcula cuando la pantalla ya está pintada.
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 300);
    return map;
  }
  function pin(kind) {
    const size = kind === "me" ? 16 : 22;
    return L.divIcon({ className: "", html: `<div class="pin ${kind}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  function withDistance(list, from) {
    return list.map(v => Object.assign(v, { km: U.distanceKm(from, v) })).sort((a, b) => a.km - b.km);
  }

  function directionsUrl(v) {
    return "https://www.openstreetmap.org/directions?route=%3B" + v.lat + "%2C" + v.lng;
  }

  return { getLocation, osmVets, openToday, createMap, pin, withDistance, directionsUrl };
})();
