/* Pantallas del DUEÑO: inicio (wireframe 5), mis mascotas y perfil con logros (F-06, F-08). */
(function () {
  const U = PL.utils;
  const { esc } = U;
  const ui = PL.ui;
  const http = PL.http;
  const OWNER = { roles: ["dueno"] };

  function dateCard(d, highlight) {
    const cls = d.estado === "vencida" ? "danger" : d.estado === "cumplida" ? "" : highlight ? "hl" : "";
    const when = d.estado === "vencida" ? "Vencida · " + U.fmtDate(d.fecha, false) : d.estado === "cumplida" ? "Cumplida · " + U.fmtDate(d.cumplidaEl || d.fecha, false) : U.relDays(d.fecha) + " · " + U.fmtDate(d.fecha, false);
    return `
      <a class="card ${cls}" href="#/calendario?fecha=${d.fecha}">
        <div class="card-title">${esc(d.titulo)} · ${esc(d.mascota)}</div>
        <div class="card-sub">${esc(when)}</div>
      </a>`;
  }
  PL.views = PL.views || {};
  PL.views.dateCard = dateCard;

  /* ---------- Inicio (wireframe 5) ---------- */
  PL.router.add("/inicio", async () => {
    ui.loading("Inicio");
    const [pets, dates, ach, invites] = await Promise.all([http.get("/pets"), http.get("/calendar"), http.get("/me/achievements"), http.get("/me/invites")]);
    const user = PL.session.user;
    const next = dates.filter(d => d.estado !== "cumplida").slice(0, 3);
    const logros = ach.logros.filter(l => l.obtenido).length;

    ui.screen({
      title: "Hola, " + user.nombre.split(" ")[0],
      right: `<a class="badge-link" href="#/perfil" title="Mis logros">🏆 ${logros}</a>` + PL.app.headerActions(),
      tab: "inicio",
      body: `
        ${invites.map(i => `<a class="card warn" href="#/invitacion/${encodeURIComponent(i.token)}" style="margin-bottom:10px"><div class="card-title">📩 ${esc(i.veterinario)} creó el registro de ${esc(i.mascota)}</div><div class="card-sub">Acepta la invitación para ser titular</div></a>`).join("")}
        <h2 class="section-title">Próximas fechas</h2>
        ${next.length ? next.map((d, i) => dateCard(d, i === 0)).join("") : ui.empty("No tienes fechas pendientes. 🎉")}
        <h2 class="section-title">Mis mascotas</h2>
        <div class="grid-3">
          ${pets.map(p => `<a class="pet-tile" href="#/mascotas/${p.id}">${ui.avatar(p)}<span>${esc(p.nombre)}</span></a>`).join("")}
          <a class="pet-tile" href="#/mascotas/nueva"><div class="avatar">${ui.icons.plus}</div><span>Agregar</span></a>
        </div>
        <h2 class="section-title">Tu racha</h2>
        <a class="card warn streak" href="#/perfil" style="text-decoration:none;color:inherit">
          <div class="num">${ach.racha}</div>
          <div><strong>${ach.racha === 1 ? "cuidado al día seguido" : "cuidados al día seguidos"}</strong>
          <div class="small muted">${ach.racha ? "¡Sigue así! Cumple tu próxima fecha a tiempo." : "Cumple tu próxima fecha a tiempo para empezar una racha."}</div></div>
        </a>`
    });
  }, Object.assign({ tab: "inicio" }, OWNER));

  /* ---------- Mis mascotas ---------- */
  PL.router.add("/mascotas", async () => {
    ui.loading("Mis mascotas");
    const pets = await http.get("/pets");
    ui.screen({
      title: "Mis mascotas",
      right: `<a class="badge-link" href="#/mascotas/nueva">+ Agregar</a>`,
      tab: "mascotas",
      body: pets.length
        ? pets.map(p => `
          <a class="card list-item" href="#/mascotas/${p.id}">
            ${ui.avatar(p)}
            <div class="body">
              <div class="card-title">${esc(p.nombre)} · ${esc(ui.ESPECIE_LABEL[p.especie])} · ${esc(p.raza)}</div>
              <div class="card-sub">${p.nacimiento ? esc(U.age(p.nacimiento)) + " · " : ""}${p.peso ? esc(String(p.peso).replace(".", ",")) + " kg" : ""}</div>
              ${p.proximaFecha ? `<div class="card-meta">${esc(p.proximaFecha.titulo)}: ${esc(U.relDays(p.proximaFecha.fecha))}</div>` : ""}
            </div>
          </a>`).join("")
        : ui.empty("Aún no tienes mascotas registradas.", '<a class="btn" href="#/mascotas/nueva">Registrar mascota</a>')
    });
  }, Object.assign({ tab: "mascotas" }, OWNER));

  /* ---------- Mi perfil: logros, racha y preferencias ---------- */
  PL.router.add("/perfil", async () => {
    ui.loading("Mi perfil");
    const [me, ach] = await Promise.all([http.get("/me"), http.get("/me/achievements")]);
    const perm = PL.services.notifications.permission();
    const permText = { granted: "Activadas en este dispositivo", denied: "Bloqueadas en el navegador", default: "Sin activar", unsupported: "No disponibles en este navegador" }[perm];
    ui.screen({
      title: "Mi perfil",
      back: true,
      tab: "inicio",
      body: `
        <div class="list-item" style="margin-bottom:18px">
          <div class="avatar lg">${esc(U.initials(me.nombre))}</div>
          <div class="body"><div class="card-title" style="font-size:20px">${esc(me.nombre)}</div><div class="card-sub">${esc(me.email)}</div></div>
        </div>
        <div class="card warn streak"><div class="num">${ach.racha}</div><div><strong>Racha actual</strong><div class="small muted">Cuidados cumplidos a tiempo, seguidos</div></div></div>
        <h2 class="section-title">Logros</h2>
        <div class="badge-grid">
          ${ach.logros.map(l => `<div class="badge-item ${l.obtenido ? "" : "locked"}" title="${esc(l.desc)}"><div class="ico">${l.ico}</div>${esc(l.titulo)}<div class="small muted" style="font-weight:400">${l.obtenido ? esc(U.fmtDate(l.fecha)) : esc(l.desc)}</div></div>`).join("")}
        </div>
        <h2 class="section-title">Mis datos</h2>
        <form id="f" novalidate>
          <label class="field"><span>Nombre</span><input class="input" name="nombre" value="${esc(me.nombre)}"></label>
          <label class="field"><span>Celular</span><input class="input" name="telefono" type="tel" value="${esc(me.telefono || "")}"></label>
          <label class="check"><input type="checkbox" name="recordatorios" ${me.prefs.recordatorios !== false ? "checked" : ""}>Recibir recordatorios de vacunas y controles</label>
          <div class="row spread card" style="margin-bottom:14px"><div><div class="small muted">Notificaciones del navegador</div><strong>${permText}</strong></div>${perm === "default" ? '<button type="button" class="btn sm" id="perm">Activar</button>' : ""}</div>
          <p class="form-error"></p>
          <button class="btn block" type="submit">Guardar</button>
        </form>
        <hr class="sep">
        <button class="btn block danger" id="logout">Cerrar sesión</button>`,
      onMount(main) {
        ui.bindForm(main.querySelector("#f"), async data => {
          const me2 = await http.patch("/me", { nombre: data.nombre, telefono: data.telefono, prefs: { recordatorios: data.recordatorios } });
          http.saveSession(PL.session.token, me2);
          ui.toast("Datos guardados");
        });
        const p = main.querySelector("#perm");
        if (p) p.addEventListener("click", async () => {
          const r = await PL.services.notifications.requestPermission();
          if (r === "granted") {
            PL.services.notifications.show("PetLink", "¡Listo! Te avisaremos antes de cada vacuna y control.");
          }
          PL.router.resolve();
        });
        main.querySelector("#logout").addEventListener("click", PL.app.logout);
      }
    });
  }, OWNER);
})();
