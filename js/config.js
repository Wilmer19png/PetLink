/* =========================================================
   Configuración de PetLink
   ---------------------------------------------------------
   Aquí se definen los servicios externos que consume la app
   (sección 15 del documento). Las APIs que no requieren clave
   funcionan de inmediato. Las que sí requieren clave quedan
   vacías y la app usa una alternativa hasta que se configuren.

   Para poner claves SIN subirlas a GitHub, cree el archivo
   js/config.local.js (está en .gitignore) con, por ejemplo:
     PL.config.ai.proxyUrl = "https://petlink-ia.<usuario>.workers.dev";
   ========================================================= */
window.PL = window.PL || {};

PL.config = {
  appName: "PetLink",
  version: "1.0.0",

  /* Backend. Vacío = API REST simulada en el navegador (js/backend).
     Si en el futuro existe un backend real, se pone su URL aquí y
     js/core/http.js enviará las peticiones con fetch(). */
  apiBaseUrl: "",
  simulatedLatencyMs: [120, 380],

  /* Ubicación por defecto si el usuario no comparte su ubicación (Medellín). */
  defaultLocation: { lat: 6.2442, lng: -75.5812, label: "Medellín" },

  maps: {
    // Mapas base de OpenStreetMap mostrados con Leaflet (sin clave).
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    // Overpass API: veterinarias reales registradas en OpenStreetMap.
    overpassUrl: "https://overpass-api.de/api/interpreter",
    searchRadiusM: 4000
  },

  breeds: {
    // Catálogo de razas de perro (Dog CEO, sin clave, incluye fotos).
    dogCeoUrl: "https://dog.ceo/api",
    // Catálogo de razas de gato (catfact.ninja, sin clave).
    catBreedsUrl: "https://catfact.ninja/breeds?limit=100",
    // Opcional: The Dog API / The Cat API ahora piden clave.
    theDogApiKey: "",
    theCatApiKey: "",
    cacheDays: 7
  },

  qr: {
    // QR Server API: genera y lee códigos QR (sin clave).
    createUrl: "https://api.qrserver.com/v1/create-qr-code/",
    readUrl: "https://api.qrserver.com/v1/read-qr-code/"
  },

  ai: {
    // URL del proxy (server/claude-proxy) que llama a la API de Claude.
    // La clave de Anthropic vive SOLO en el proxy, nunca en el navegador.
    proxyUrl: "",
    timeoutMs: 45000
  },

  notifications: {
    // Días de anticipación para recordar una fecha de cuidado.
    remindDaysBefore: [7, 1, 0],
    checkEveryMinutes: 30
  }
};
