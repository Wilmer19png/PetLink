/* Arranque de PetLink: configuración local, datos, sesión, sincronización y router. */
PL.app = (function () {
  let unread = 0;

  function loadLocalConfig() {
    // js/config.local.js es opcional (claves que no se suben a GitHub).
    return new Promise(resolve => {
      const s = document.createElement("script");
      s.src = "js/config.local.js";
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  function headerActions() {
    const user = PL.session.user;
    if (!user) return "";
    const bell = `<a class="icon-btn" href="#/notificaciones" aria-label="Notificaciones" style="position:relative">${PL.ui.icons.bell}<span class="bell-count" ${unread ? "" : "hidden"}>${unread}</span></a>`;
    const profile = user.rol === "dueno" ? `<a class="icon-btn" href="#/perfil" aria-label="Mi perfil">${PL.ui.icons.user}</a>` : "";
    return bell + profile;
  }

  async function refreshBadge() {
    if (!PL.session.user || !navigator.onLine) return;
    try {
      const items = await PL.http.get("/me/inbox");
      unread = items.filter(n => !n.leida).length;
      document.querySelectorAll(".bell-count").forEach(el => {
        el.textContent = unread;
        el.hidden = !unread;
      });
    } catch (e) { /* sesión expirada u offline */ }
  }

  // Se llama al iniciar sesión o al abrir la app con sesión guardada.
  function onSession() {
    refreshBadge();
    if (PL.session.user && PL.session.user.rol === "dueno") PL.services.notifications.start();
    else PL.services.notifications.stop();
  }

  async function logout() {
    try { await PL.http.post("/auth/logout"); } catch (e) { /* ignorar */ }
    PL.services.notifications.stop();
    PL.http.clearSession();
    location.hash = "#/login";
  }

  async function resetDemo() {
    PL.db.reset();
    await PL.seed.run();
    PL.http.clearSession();
    try { Object.keys(localStorage).filter(k => k.startsWith("pl_")).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignorar */ }
    location.hash = "#/login";
    location.reload();
  }

  async function syncQueue() {
    const n = await PL.http.flush();
    if (n) {
      PL.ui.toast(n === 1 ? "Se sincronizó 1 registro guardado sin conexión" : "Se sincronizaron " + n + " registros guardados sin conexión", 4000);
      PL.router.resolve();
    }
  }

  async function start() {
    await loadLocalConfig();
    PL.db.load();
    await PL.seed.run();
    PL.http.restoreSession();

    if (PL.session.token) {
      try {
        const me = await PL.http.get("/me");
        PL.http.saveSession(PL.session.token, me);
      } catch (e) {
        if (e.status === 401) PL.http.clearSession();
      }
    }

    window.addEventListener("online", () => { PL.ui.toast("Conexión recuperada"); syncQueue(); PL.router.resolve(); });
    window.addEventListener("offline", () => { PL.ui.toast("Sin conexión: puedes seguir consultando lo ya cargado"); PL.router.resolve(); });

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service worker no registrado:", err.message));
      navigator.serviceWorker.addEventListener("message", e => {
        if (e.data && e.data.type === "open" && e.data.link) location.hash = e.data.link;
      });
    }

    PL.router.start();
    onSession();
    syncQueue();
    setInterval(refreshBadge, 60000);
  }

  return { start, headerActions, refreshBadge, onSession, logout, resetDemo };
})();

PL.app.start();
