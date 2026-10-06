/* Utilidades generales */
PL.utils = (function () {
  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MONTHS_LONG = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function uid(prefix) {
    const rnd = Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + "_" : "") + Date.now().toString(36) + rnd;
  }

  // Código legible de mascota, ej. LUNA-7K2-QX9 (sin caracteres confusos).
  function petCode(name) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const pick = n => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    const base = (name || "PET").normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 5) || "PET";
    return base + "-" + pick(3) + "-" + pick(3);
  }

  function token(len) {
    const bytes = new Uint8Array(len || 16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => (bytes[i] = Math.random() * 256));
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  async function sha256(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
    }
    // Respaldo si el navegador no expone crypto.subtle (contexto no seguro).
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    return "fallback_" + (h >>> 0).toString(16);
  }

  /* ---------- Fechas ---------- */
  function today() {
    const d = new Date();
    return toISODate(d);
  }
  function toISODate(d) {
    const z = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  function parseDate(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function addDays(iso, days) {
    const d = parseDate(iso);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }
  function daysBetween(fromIso, toIso) {
    return Math.round((parseDate(toIso) - parseDate(fromIso)) / 86400000);
  }
  function fmtDate(iso, withYear) {
    const d = parseDate(iso);
    if (!d) return "—";
    const base = d.getDate() + " " + MONTHS[d.getMonth()];
    return withYear === false ? base : base + " " + d.getFullYear();
  }
  function fmtMonth(iso) {
    const d = parseDate(iso);
    return d ? MONTHS[d.getMonth()] + " " + d.getFullYear() : "—";
  }
  function fmtDateTime(isoDateTime) {
    const d = new Date(isoDateTime);
    if (isNaN(d)) return "—";
    return fmtDate(toISODate(d)) + " · " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }
  function relDays(iso) {
    const n = daysBetween(today(), iso);
    if (n === 0) return "Hoy";
    if (n === 1) return "Mañana";
    if (n === -1) return "Ayer";
    if (n > 1 && n < 14) return "En " + n + " días";
    if (n >= 14 && n < 60) return "En " + Math.round(n / 7) + " semanas";
    if (n >= 60) return "En " + Math.round(n / 30) + " meses";
    if (n < -1 && n > -14) return "Hace " + -n + " días";
    return "Hace " + Math.round(-n / 7) + " semanas";
  }
  function age(nacimiento) {
    if (!nacimiento) return "";
    const d = parseDate(nacimiento.length === 7 ? nacimiento + "-01" : nacimiento);
    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
    if (months < 0) months = 0;
    if (months < 12) return months + (months === 1 ? " mes" : " meses");
    const years = Math.floor(months / 12);
    return years + (years === 1 ? " año" : " años");
  }
  function lifeStage(especie, nacimiento) {
    if (!nacimiento) return "adulto";
    const d = parseDate(nacimiento.length === 7 ? nacimiento + "-01" : nacimiento);
    const years = (Date.now() - d) / (365.25 * 86400000);
    if (years < 1) return "cachorro";
    if (years >= (especie === "gato" ? 10 : 8)) return "senior";
    return "adulto";
  }

  /* ---------- Geografía ---------- */
  function distanceKm(a, b) {
    const R = 6371, rad = x => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtKm(km) {
    return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1).replace(".", ",") + " km";
  }

  /* ---------- Varios ---------- */
  function initials(name) {
    return (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  }
  function titleCase(s) {
    return String(s || "").replace(/\b\w/g, c => c.toUpperCase());
  }
  function clone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
  function formToObject(form) {
    const out = {};
    new FormData(form).forEach((v, k) => {
      out[k] = typeof v === "string" ? v.trim() : v;
    });
    form.querySelectorAll('input[type="checkbox"][name]').forEach(cb => (out[cb.name] = cb.checked));
    return out;
  }
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin almacenamiento */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* sin almacenamiento */ }
    }
  };
  async function fetchJson(url, options, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
    try {
      const res = await fetch(url, Object.assign({ signal: ctrl.signal }, options));
      if (!res.ok) throw new Error("HTTP " + res.status + " en " + url);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    esc, uid, petCode, token, sha256,
    today, toISODate, parseDate, addDays, daysBetween, fmtDate, fmtMonth, fmtDateTime, relDays, age, lifeStage,
    MONTHS, MONTHS_LONG,
    distanceKm, fmtKm, initials, titleCase, clone, debounce, sleep, formToObject, store, fetchJson
  };
})();
