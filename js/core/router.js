/* Router por hash (#/ruta/:param) con protección por rol (sección 11.2). */
PL.router = (function () {
  const routes = [];
  let started = false;

  /**
   * add("/pacientes/:id", handler, { roles: ["veterinario"], public: false, tab: "pacientes" })
   */
  function add(pattern, handler, options) {
    const keys = [];
    const regex = new RegExp(
      "^" + pattern.replace(/\//g, "\\/").replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "\\/?$"
    );
    routes.push(Object.assign({ pattern, regex, keys, handler }, options || {}));
  }

  function parse() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = raw.split("?");
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    return { path, query };
  }

  function homeFor(user) {
    if (!user) return "#/login";
    if (user.rol === "admin") return "#/admin";
    if (user.rol === "veterinario") return "#/vet";
    return "#/inicio";
  }

  async function resolve() {
    const { path, query } = parse();
    const user = PL.session.user;

    if (path === "/" || path === "") {
      location.replace(homeFor(user));
      return;
    }

    for (const r of routes) {
      const m = path.match(r.regex);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

      if (!r.public && !user) {
        // Guardamos a dónde quería ir (ej. un enlace de invitación).
        PL.utils.store.set("pl_after_login", location.hash);
        location.replace("#/login");
        return;
      }
      if (r.roles && user && !r.roles.includes(user.rol)) {
        location.replace(homeFor(user));
        return;
      }
      // Veterinario sin verificar: solo su perfil y el estado de su solicitud (RF-02).
      if (user && user.rol === "veterinario" && user.verificacion !== "verificado" && !r.allowUnverified && !r.public) {
        location.replace("#/vet/perfil");
        return;
      }

      PL.router.currentTab = r.tab;
      try {
        await r.handler(params, query);
      } catch (err) {
        console.error(err);
        PL.ui.screen({
          title: "Algo salió mal",
          back: true,
          tab: r.tab,
          body: `<div class="notice bad">${PL.utils.esc(PL.ui.errorMessage(err))}</div>`
        });
      }
      return;
    }

    PL.ui.screen({ title: "No encontrado", back: true, body: PL.ui.empty("Esta pantalla no existe.", `<a class="btn" href="${homeFor(user)}">Ir al inicio</a>`) });
  }

  function go(hash) {
    if (location.hash === hash) resolve();
    else location.hash = hash;
  }

  function start() {
    if (started) return;
    started = true;
    window.addEventListener("hashchange", resolve);
    resolve();
  }

  return { add, start, go, resolve, homeFor, currentTab: null };
})();
