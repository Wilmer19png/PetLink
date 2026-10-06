/* Mapa de veterinarios (wireframe 9; RF-21 a RF-23, F-09).
   Combina veterinarios verificados de PetLink (con filtro "a domicilio")
   y veterinarias reales de Google Places o, como respaldo, OpenStreetMap. */
(function () {
  const U = PL.utils;
  const { esc } = U;
  const ui = PL.ui;
  const maps = PL.services.maps;
  let map = null;

  const SOURCE = { google: "Google Maps", osm: "OpenStreetMap" };
  const FILTERS = [["cercanos", "Cercanos"], ["domicilio", "A domicilio"], ["abierto", "Abierto hoy"]];

  PL.router.add("/mapa", async (_, query) => {
    const filter = FILTERS.some(f => f[0] === query.filtro) ? query.filtro : "cercanos";
    ui.screen({
      title: "Mapa",
      right: PL.app.headerActions(),
      tab: "mapa",
      body: `
        <div class="chips" style="margin-bottom:12px">${FILTERS.map(([k, l]) => `<a class="chip ${k === filter ? "active" : ""}" href="#/mapa?filtro=${k}">${l}</a>`).join("")}</div>
        <div class="map-wrap"><div id="map" style="height:100%"></div></div>
        <div class="legend"><span><i style="background:var(--teal)"></i>PetLink (verificados)</span><span><i style="background:#7a8288"></i><span id="legend-ext">OpenStreetMap</span></span><span><i style="background:var(--red)"></i>Tú</span></div>
        <p class="hint" id="status" style="margin:4px 0 8px">Buscando tu ubicación…</p>
        <div id="list"><div class="skeleton" style="height:70px"></div></div>`,
      onMount: main => mount(main, filter)
    });
  }, { roles: ["dueno"], tab: "mapa" });

  async function mount(main, filter) {
    const status = main.querySelector("#status");
    const listEl = main.querySelector("#list");
    const here = await maps.getLocation();
    if (!document.body.contains(main)) return;

    if (map) { map.remove(); map = null; }
    try {
      map = await maps.createMap(main.querySelector("#map"), here, 14);
    } catch (err) {
      main.querySelector("#map").innerHTML = `<div class="notice bad" style="margin:16px">${esc(err.message)}</div>`;
    }
    if (!document.body.contains(main)) return;
    if (map) map.addMarker({ lat: here.lat, lng: here.lng, kind: "me", title: "Tú" });

    const provider = maps.providerName();
    main.querySelector("#legend-ext").textContent = provider;
    const petlinkVets = (await PL.http.get("/vets")).map(v => Object.assign(v, { fuente: "petlink" }));
    let external = { items: [], fuente: provider };
    status.textContent = (here.real ? "Usando tu ubicación actual" : "Ubicación por defecto: " + here.label + " (no compartiste tu ubicación)") + " · Consultando " + provider + "…";
    if (filter !== "domicilio") {
      try {
        external = await maps.nearbyVets(here.lat, here.lng);
      } catch (err) {
        console.warn(err);
        status.textContent = "No se pudo consultar " + provider + " (" + err.message + "). Se muestran solo veterinarios de PetLink.";
      }
    }
    if (!document.body.contains(main)) return;

    let all = maps.withDistance(petlinkVets.concat(external.items), here);
    if (filter === "domicilio") all = all.filter(v => v.domicilio);
    if (filter === "abierto") all = all.filter(maps.openToday);
    if (status.textContent.endsWith("…")) {
      status.textContent = (here.real ? "Cerca de ti" : "Cerca de " + here.label) + " · " + petlinkVets.length + " de PetLink y " + external.items.length + " de " + external.fuente;
    }

    if (map) {
      const bounds = [[here.lat, here.lng]];
      all.forEach(v => {
        map.addMarker({ lat: v.lat, lng: v.lng, kind: v.fuente === "petlink" ? "petlink" : "osm", title: v.nombre, onClick: () => vetSheet(v) });
        if (v.km < 6) bounds.push([v.lat, v.lng]);
      });
      if (bounds.length > 1) map.fitBounds(bounds);
    }

    const shown = all.slice(0, 25);
    listEl.innerHTML = shown.length ? shown.map((v, i) => `
      <button class="card list-item" data-i="${i}">
        <div class="avatar" style="${v.fuente !== "petlink" ? "background:#eef0f1;color:#5f6368" : ""}">${esc(U.initials(v.nombre))}</div>
        <div class="body">
          <div class="card-title">${esc(v.nombre)}</div>
          <div class="card-sub">${esc(U.fmtKm(v.km))} · ${v.fuente === "petlink" ? (v.domicilio ? "Atiende a domicilio" : "Consultorio") : SOURCE[v.fuente]}${maps.openToday(v) ? " · Abierto hoy" : ""}</div>
          ${v.fuente === "petlink" ? `<div class="card-meta">${esc(v.clinica || "")}</div>` : ""}
        </div>
        ${v.fuente === "petlink" ? '<span class="tag ok">Verificado</span>' : ""}
      </button>`).join("")
      : ui.empty(filter === "domicilio" ? "No hay veterinarios con atención a domicilio cerca." : "No se encontraron veterinarios cerca.");
    listEl.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => {
      const v = shown[Number(b.dataset.i)];
      if (map) map.setView(v.lat, v.lng, 16);
      vetSheet(v);
    }));
  }

  /* ---------- Perfil de un veterinario (RF-23) ---------- */
  function vetSheet(v) {
    const msg = "Hola, te encontré en PetLink y quisiera información sobre tus servicios.";
    const isPL = v.fuente === "petlink";
    ui.sheet(`
      <div class="list-item" style="margin-bottom:12px">
        <div class="avatar lg">${esc(U.initials(v.nombre))}</div>
        <div class="body"><div class="card-title" style="font-size:20px">${esc(v.nombre)}</div>
        <div class="card-sub">${esc(isPL ? v.clinica || "" : v.direccion || "Veterinaria registrada en " + SOURCE[v.fuente])}</div>
        <div class="card-meta">${esc(U.fmtKm(v.km))} de distancia ${isPL ? '· <span class="tag ok">Verificado en PetLink</span>' : ""}</div></div>
      </div>
      ${isPL && v.domicilio ? '<div class="notice info small" style="margin-bottom:12px">🏠 Atiende a domicilio</div>' : ""}
      <dl class="small" style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0 0 16px">
        ${isPL ? `<dt class="muted">Servicios</dt><dd style="margin:0">${esc(v.servicios.join(", ") || "—")}</dd>
        <dt class="muted">Zona</dt><dd style="margin:0">${esc(v.zona || "—")}</dd>` : ""}
        <dt class="muted">Horario</dt><dd style="margin:0">${esc(v.horario || "No informado")}</dd>
        <dt class="muted">Contacto</dt><dd style="margin:0">${esc(v.telefono || "No informado")}${v.web ? ` · <a href="${esc(v.web)}" target="_blank" rel="noopener">sitio web</a>` : ""}</dd>
      </dl>
      <div class="stack">
        ${v.telefono ? `<a class="btn block" target="_blank" rel="noopener" href="${esc(PL.services.messaging.whatsappUrl(v.telefono, msg))}">Escribir por WhatsApp</a>
        <a class="btn block outline" href="tel:${esc(v.telefono)}">Llamar</a>` : ""}
        <a class="btn block ghost" target="_blank" rel="noopener" href="${esc(maps.directionsUrl(v))}">Cómo llegar</a>
        ${isPL ? '<p class="hint center">Para que vea el historial de tu mascota, comparte con él tu código desde Mascotas → Accesos.</p>' : (v.externalUrl ? `<p class="hint center"><a href="${esc(v.externalUrl)}" target="_blank" rel="noopener">Ver en ${SOURCE[v.fuente]}</a></p>` : "")}
      </div>`);
  }
})();
