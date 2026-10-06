/* =========================================================
   Servicio externo: MAPAS Y GEOLOCALIZACIÓN (RF-21 a RF-23)
   ---------------------------------------------------------
   Proveedor principal (si hay clave en config.maps.googleMapsKey):
   - Google Maps JavaScript API: mapa
   - Google Places API (New): veterinarias cercanas
   Respaldo (sin clave o si Google falla):
   - Leaflet + mapas base de OpenStreetMap
   - Overpass API: veterinarias registradas en OpenStreetMap
   Siempre:
   - Geolocation API del navegador: la ubicación solo se usa en
     memoria para ordenar resultados y NO se guarda (sección 15.1)
   ========================================================= */
PL.services = PL.services || {};

PL.services.maps = (function () {
  const U = PL.utils;
  const cache = {};
  let lastLocation = null; // solo en memoria
  let googlePromise = null;
  let googleFailed = false;

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

  /* =======================================================
     Google Maps
     ======================================================= */
  function useGoogle() {
    return !!PL.config.maps.googleMapsKey && !googleFailed;
  }

  function loadGoogle() {
    if (googlePromise) return googlePromise;
    googlePromise = new Promise((resolve, reject) => {
      // Google llama a esta función si la clave es inválida o no está autorizada.
      window.gm_authFailure = () => {
        googleFailed = true;
        PL.ui.toast("La clave de Google Maps no es válida para este sitio. Se usa OpenStreetMap.", 5000);
        if (location.hash.startsWith("#/mapa")) PL.router.resolve();
      };
      window.__plGoogleReady = () => resolve(window.google);
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(PL.config.maps.googleMapsKey) +
        "&v=weekly&language=es&region=CO&loading=async&callback=__plGoogleReady";
      s.async = true;
      s.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
      document.head.appendChild(s);
    }).catch(err => {
      googleFailed = true;
      googlePromise = null;
      throw err;
    });
    return googlePromise;
  }

  async function createGoogleMap(el, center, zoom) {
    await loadGoogle();
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    const map = new Map(el, {
      center: { lat: center.lat, lng: center.lng },
      zoom: zoom || 14,
      mapId: PL.config.maps.googleMapId,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false
    });
    const markers = [];
    return {
      provider: "google",
      addMarker({ lat, lng, kind, title, onClick }) {
        const content = document.createElement("div");
        content.className = "pin " + kind;
        const m = new AdvancedMarkerElement({ map, position: { lat, lng }, content, title });
        if (onClick) m.addListener("click", onClick);
        markers.push(m);
      },
      fitBounds(points) {
        const b = new google.maps.LatLngBounds();
        points.forEach(([lat, lng]) => b.extend({ lat, lng }));
        map.fitBounds(b, 40);
        google.maps.event.addListenerOnce(map, "idle", () => map.getZoom() > 15 && map.setZoom(15));
      },
      setView(lat, lng, z) {
        map.panTo({ lat, lng });
        map.setZoom(z);
      },
      remove() {
        markers.forEach(m => (m.map = null));
        el.innerHTML = "";
      }
    };
  }

  /** Veterinarias cercanas con Google Places API (New). */
  async function googleVets(lat, lng, radiusM) {
    await loadGoogle();
    const { Place, SearchNearbyRankPreference } = await google.maps.importLibrary("places");
    const { places } = await Place.searchNearby({
      fields: ["id", "displayName", "location", "formattedAddress", "nationalPhoneNumber", "websiteURI", "regularOpeningHours", "googleMapsURI"],
      locationRestriction: { center: { lat, lng }, radius: Math.min(radiusM, 50000) },
      includedPrimaryTypes: ["veterinary_care"],
      maxResultCount: 20,
      rankPreference: SearchNearbyRankPreference.DISTANCE,
      language: "es",
      region: "co"
    });
    const todayIdx = (new Date().getDay() + 6) % 7; // weekdayDescriptions empieza el lunes
    return (places || []).map(p => {
      const hours = p.regularOpeningHours;
      const periods = (hours && hours.periods) || [];
      return {
        id: "g_" + p.id,
        fuente: "google",
        nombre: p.displayName || "Veterinaria",
        lat: p.location.lat(),
        lng: p.location.lng(),
        telefono: p.nationalPhoneNumber || "",
        web: p.websiteURI || "",
        horario: hours && hours.weekdayDescriptions ? hours.weekdayDescriptions[todayIdx] : "",
        dias: [...new Set(periods.map(x => x.open && x.open.day).filter(d => d != null))],
        direccion: p.formattedAddress || "",
        domicilio: false,
        servicios: [],
        externalUrl: p.googleMapsURI || ""
      };
    });
  }

  /* =======================================================
     OpenStreetMap (respaldo)
     ======================================================= */
  function createLeafletMap(el, center, zoom) {
    if (!window.L) throw new Error("No se pudo cargar la librería de mapas (Leaflet)");
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom || 14);
    L.tileLayer(PL.config.maps.tileUrl, { maxZoom: 19, attribution: PL.config.maps.attribution }).addTo(map);
    // Leaflet calcula el tamaño al crearse; se recalcula cuando la pantalla ya está pintada.
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 300);
    const pin = kind => {
      const size = kind === "me" ? 16 : 22;
      return L.divIcon({ className: "", html: `<div class="pin ${kind}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    };
    return {
      provider: "osm",
      addMarker({ lat, lng, kind, title, onClick }) {
        const m = L.marker([lat, lng], { icon: pin(kind), title }).addTo(map);
        if (onClick) m.on("click", onClick);
      },
      fitBounds(points) {
        setTimeout(() => { map.invalidateSize(); map.fitBounds(points, { padding: [30, 30], maxZoom: 15, animate: false }); }, 350);
      },
      setView(lat, lng, z) {
        map.setView([lat, lng], z);
      },
      remove() {
        map.remove();
      }
    };
  }

  /** Veterinarias de OpenStreetMap cercanas a un punto (Overpass API). */
  async function osmVets(lat, lng, radiusM) {
    const query = `[out:json][timeout:20];nwr["amenity"="veterinary"](around:${radiusM},${lat},${lng});out center 60;`;
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
    return (json.elements || []).map(el => {
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
        externalUrl: "https://www.openstreetmap.org/" + el.type + "/" + el.id
      };
    }).filter(v => v.lat != null && v.lng != null);
  }

  /* =======================================================
     API pública del servicio
     ======================================================= */
  async function createMap(el, center, zoom) {
    if (useGoogle()) {
      try {
        return await createGoogleMap(el, center, zoom);
      } catch (err) {
        console.warn("Google Maps no disponible, se usa OpenStreetMap:", err.message);
        el.innerHTML = "";
      }
    }
    return createLeafletMap(el, center, zoom);
  }

  /** Veterinarias externas cercanas: Google Places o, como respaldo, OpenStreetMap. */
  async function nearbyVets(lat, lng) {
    const r = PL.config.maps.searchRadiusM;
    const key = lat.toFixed(3) + "," + lng.toFixed(3) + "," + r + "," + (useGoogle() ? "g" : "o");
    if (cache[key]) return cache[key];
    let result;
    if (useGoogle()) {
      try {
        result = { items: await googleVets(lat, lng, r), fuente: "Google Places" };
      } catch (err) {
        console.warn("Google Places no disponible, se usa OpenStreetMap:", err.message);
      }
    }
    if (!result) result = { items: await osmVets(lat, lng, r), fuente: "OpenStreetMap" };
    cache[key] = result;
    return result;
  }

  /* ---------- "Abierto hoy" ---------- */
  const OSM_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  function openTodayOsm(hours) {
    if (!hours) return false;
    if (/24\/7/.test(hours)) return true;
    const today = new Date().getDay();
    return hours.split(";").some(seg => {
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

  function withDistance(list, from) {
    return list.map(v => Object.assign(v, { km: U.distanceKm(from, v) })).sort((a, b) => a.km - b.km);
  }

  function directionsUrl(v) {
    return useGoogle()
      ? "https://www.google.com/maps/dir/?api=1&destination=" + v.lat + "," + v.lng
      : "https://www.openstreetmap.org/directions?route=%3B" + v.lat + "%2C" + v.lng;
  }

  function providerName() {
    return useGoogle() ? "Google" : "OpenStreetMap";
  }

  return { getLocation, createMap, nearbyVets, openToday, withDistance, directionsUrl, providerName };
})();
