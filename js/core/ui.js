/* Componentes de interfaz: marco de pantalla, barra de pestañas, toasts y hojas. */
PL.ui = (function () {
  const { esc } = PL.utils;

  const icons = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    paw: '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="6" cy="10" rx="2.2" ry="2.8"/><ellipse cx="10" cy="6" rx="2.2" ry="2.8"/><ellipse cx="14" cy="6" rx="2.2" ry="2.8"/><ellipse cx="18" cy="10" rx="2.2" ry="2.8"/><path d="M12 12c-3.5 0-6 3.4-6 6 0 1.7 1.3 2.6 3 2.6 1.4 0 2-.7 3-.7s1.6.7 3 .7c1.7 0 3-.9 3-2.6 0-2.6-2.5-6-6-6z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20c0-2.6-1.7-4.4-4-5.1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>'
  };

  const TABS = {
    dueno: [
      { id: "inicio", label: "Inicio", href: "#/inicio", icon: "home" },
      { id: "mascotas", label: "Mascotas", href: "#/mascotas", icon: "paw" },
      { id: "calendario", label: "Calendario", href: "#/calendario", icon: "calendar" },
      { id: "mapa", label: "Mapa", href: "#/mapa", icon: "map" },
      { id: "aprender", label: "Aprender", href: "#/aprender", icon: "book" }
    ],
    veterinario: [
      { id: "inicio", label: "Inicio", href: "#/vet", icon: "home" },
      { id: "pacientes", label: "Pacientes", href: "#/pacientes", icon: "paw" },
      { id: "perfil", label: "Perfil", href: "#/vet/perfil", icon: "user" }
    ]
  };

  function appEl() {
    return document.getElementById("app");
  }

  /**
   * Pinta una pantalla completa.
   * opts: { title, back, right, tab, body, noTabs, wide, onMount }
   */
  function screen(opts) {
    const session = PL.session && PL.session.user;
    const role = session ? session.rol : null;
    const tabs = !opts.noTabs && role && TABS[role] ? TABS[role] : null;
    const app = appEl();
    app.className = "app" + (tabs ? " has-tabbar" : "") + (opts.wide ? " wide" : "");

    const backBtn = opts.back
      ? `<button class="icon-btn" data-back="${esc(opts.back === true ? "" : opts.back)}" aria-label="Volver">${icons.back}</button>`
      : "";
    const offline = navigator.onLine ? "" : '<div class="offline-bar">Sin conexión · los cambios se guardarán en cola</div>';
    const header = opts.title != null
      ? `<header class="header">${backBtn}<h1>${esc(opts.title)}</h1><div class="right">${opts.right || ""}</div></header>`
      : "";
    const tabbar = tabs
      ? `<nav class="tabbar" aria-label="Navegación principal">${tabs
          .map(t => `<a href="${t.href}" class="${t.id === opts.tab ? "active" : ""}" ${t.id === opts.tab ? 'aria-current="page"' : ""}>${icons[t.icon]}<span>${t.label}</span></a>`)
          .join("")}</nav>`
      : "";

    app.innerHTML = offline + header + `<main class="main">${opts.body || ""}</main>` + tabbar;
    app.querySelectorAll("[data-back]").forEach(b =>
      b.addEventListener("click", () => {
        const target = b.getAttribute("data-back");
        if (target) location.hash = target;
        else history.length > 1 ? history.back() : (location.hash = "#/");
      })
    );
    window.scrollTo(0, 0);
    if (opts.onMount) opts.onMount(app.querySelector(".main"), app);
    return app;
  }

  function loading(title) {
    screen({ title: title || "", body: '<div class="stack"><div class="skeleton" style="height:70px"></div><div class="skeleton" style="height:70px"></div><div class="skeleton" style="height:70px"></div></div>', tab: PL.router && PL.router.currentTab });
  }

  let toastTimer;
  function toast(message, ms) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), ms || 2800);
  }

  /** Hoja inferior (modal). Devuelve { el, close }. */
  function sheet(html, onMount) {
    const root = document.getElementById("sheet-root");
    root.innerHTML = `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
    const backdrop = root.firstElementChild;
    const close = () => (root.innerHTML = "");
    backdrop.addEventListener("click", e => {
      if (e.target === backdrop || e.target.closest("[data-close]")) close();
    });
    const api = { el: backdrop.querySelector(".sheet"), close };
    if (onMount) onMount(api.el, api);
    return api;
  }

  function confirm(message, okLabel) {
    return new Promise(resolve => {
      const s = sheet(
        `<p style="font-size:17px;font-weight:700;margin:0 0 18px">${esc(message)}</p>
         <div class="grid-2"><button class="btn outline" data-r="0">Cancelar</button><button class="btn" data-r="1">${esc(okLabel || "Confirmar")}</button></div>`,
        el => el.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => { s.close(); resolve(b.dataset.r === "1"); }))
      );
    });
  }

  function errorMessage(err) {
    return (err && (err.message || err.error)) || "Ocurrió un error inesperado";
  }

  function avatar(pet, cls) {
    const content = pet && pet.foto ? `<img src="${esc(pet.foto)}" alt="" loading="lazy">` : esc(PL.utils.initials(pet && (pet.nombre || pet.name)));
    return `<div class="avatar ${cls || ""}">${content}</div>`;
  }

  function empty(text, actionHtml) {
    return `<div class="empty"><p style="margin:0 0 10px">${esc(text)}</p>${actionHtml || ""}</div>`;
  }

  /** Conecta un formulario: valida, deshabilita el botón y muestra errores. */
  function bindForm(form, handler) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      const errBox = form.querySelector(".form-error");
      if (errBox) errBox.textContent = "";
      if (btn) btn.disabled = true;
      try {
        await handler(PL.utils.formToObject(form), form);
      } catch (err) {
        if (errBox) errBox.textContent = errorMessage(err);
        else toast(errorMessage(err));
      } finally {
        if (btn && document.body.contains(btn)) btn.disabled = false;
      }
    });
  }

  const TYPE_LABEL = { consulta: "Consulta", vacuna: "Vacuna", desparasitacion: "Desparasitación", control: "Control" };
  const ESPECIE_LABEL = { perro: "Perro", gato: "Gato", otro: "Otro" };

  return { icons, screen, loading, toast, sheet, confirm, errorMessage, avatar, empty, bindForm, TYPE_LABEL, ESPECIE_LABEL, TABS };
})();
