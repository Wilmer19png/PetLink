/* =========================================================
   Cliente HTTP de la app
   ---------------------------------------------------------
   Las pantallas solo hablan con el backend a través de este
   cliente (GET/POST/PATCH + token de sesión). Si config.apiBaseUrl
   tiene una URL, usa fetch() contra un servidor real; si no, envía
   la petición a la API simulada (PL.server).

   También implementa la cola de sincronización sin conexión
   (sección 14 y RNF-08): si no hay internet, los registros y notas
   nuevos se guardan en cola y se envían al volver la conexión.
   ========================================================= */
PL.session = { token: null, user: null };

PL.http = (function () {
  const U = PL.utils;
  const SESSION_KEY = "pl_session";
  const QUEUE_KEY = "pl_sync_queue";
  const CACHE_KEY = "pl_read_cache";
  // Rutas que se pueden encolar sin conexión.
  const QUEUEABLE = [/^\/pets\/[^/]+\/records$/, /^\/pets\/[^/]+\/notes$/];

  function restoreSession() {
    const s = U.store.get(SESSION_KEY, null);
    if (s && s.token) Object.assign(PL.session, s);
  }
  function saveSession(token, user) {
    PL.session.token = token;
    PL.session.user = user;
    U.store.set(SESSION_KEY, { token, user });
  }
  function clearSession() {
    PL.session.token = null;
    PL.session.user = null;
    U.store.remove(SESSION_KEY);
    U.store.remove(CACHE_KEY);
  }

  async function request(method, path, body) {
    const offline = !navigator.onLine;

    if (offline && method !== "GET") {
      if (method === "POST" && QUEUEABLE.some(rx => rx.test(path))) return enqueue(path, body);
      throw new Error("Sin conexión. Esta acción necesita internet.");
    }
    if (offline && method === "GET") {
      // Caché de lectura: lo último que se cargó con conexión.
      const cache = U.store.get(CACHE_KEY, {});
      if (cache[path]) return cache[path];
      throw new Error("Sin conexión y sin datos guardados para esta pantalla.");
    }

    let result;
    if (PL.config.apiBaseUrl) {
      const res = await fetch(PL.config.apiBaseUrl + path, {
        method,
        headers: Object.assign({ "Content-Type": "application/json" }, PL.session.token ? { Authorization: "Bearer " + PL.session.token } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw httpError(res.status, json.message || json.error || "Error " + res.status);
      result = json;
    } else {
      const [min, max] = PL.config.simulatedLatencyMs;
      await U.sleep(min + Math.random() * (max - min));
      try {
        result = await PL.server.handle(method, path, body, PL.session.token);
      } catch (err) {
        throw err instanceof PL.server.HttpError ? err : httpError(500, err.message);
      }
    }

    if (method === "GET") {
      const cache = U.store.get(CACHE_KEY, {});
      cache[path] = result;
      U.store.set(CACHE_KEY, cache);
    }
    return result;
  }

  function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
  }

  /* ---------- Cola de sincronización ---------- */
  function enqueue(path, body) {
    const queue = U.store.get(QUEUE_KEY, []);
    const item = { id: U.uid("q"), path, body: Object.assign({ clientId: U.uid("c") }, body), creado: new Date().toISOString() };
    queue.push(item);
    U.store.set(QUEUE_KEY, queue);
    return Object.assign({ queued: true, id: item.id }, body);
  }

  function pending() {
    return U.store.get(QUEUE_KEY, []);
  }

  async function flush() {
    const queue = pending();
    if (!queue.length || !navigator.onLine) return 0;
    let sent = 0;
    const rest = [];
    for (const item of queue) {
      try {
        await request("POST", item.path, item.body);
        sent++;
      } catch (err) {
        // Si el servidor lo rechaza (p. ej. el acceso fue retirado) se descarta con aviso.
        if (err.status && err.status < 500) PL.ui.toast("Un registro en cola fue rechazado: " + err.message, 5000);
        else rest.push(item);
      }
    }
    U.store.set(QUEUE_KEY, rest);
    return sent;
  }

  return {
    get: path => request("GET", path),
    post: (path, body) => request("POST", path, body || {}),
    patch: (path, body) => request("PATCH", path, body || {}),
    restoreSession, saveSession, clearSession, flush, pending
  };
})();
