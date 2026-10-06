/* Panel web del ADMINISTRADOR (figura 3): verificación de veterinarios (RF-02)
   y gestión del contenido educativo (RF-29, HU-25). */
(function () {
  const U = PL.utils;
  const { esc } = U;
  const ui = PL.ui;
  const http = PL.http;
  const ADMIN = { roles: ["admin"] };

  const NAV = [["#/admin", "Resumen"], ["#/admin/veterinarios", "Veterinarios"], ["#/admin/contenido", "Contenido"], ["#/admin/mensajes", "Mensajes enviados"]];

  function layout(active, title, body, onMount) {
    ui.screen({
      wide: true,
      noTabs: true,
      body: `
        <div class="admin-layout" style="margin:-16px -16px -24px">
          <nav class="admin-nav">
            <h2>PetLink · Admin</h2>
            ${NAV.map(([h, l]) => `<a href="${h}" class="${h === active ? "active" : ""}">${l}</a>`).join("")}
            <a href="#" id="logout">Cerrar sesión</a>
          </nav>
          <section class="admin-main">
            <h1 style="font-size:26px;margin-bottom:18px">${esc(title)}</h1>
            ${body}
          </section>
        </div>`,
      onMount(main) {
        main.querySelector("#logout").addEventListener("click", e => { e.preventDefault(); PL.app.logout(); });
        if (onMount) onMount(main);
      }
    });
  }

  /* ---------- Resumen ---------- */
  PL.router.add("/admin", async () => {
    ui.loading();
    const s = await http.get("/admin/stats");
    const items = [["Dueños", s.duenos], ["Veterinarios verificados", s.veterinarios], ["Verificaciones pendientes", s.pendientes], ["Mascotas", s.mascotas], ["Registros clínicos", s.registros], ["Accesos vigentes", s.accesos], ["Contenidos publicados", s.contenido], ["Perfiles de raza (IA)", s.perfilesRaza]];
    layout("#/admin", "Resumen", `
      <div class="stats">${items.map(([l, v]) => `<div class="stat"><b>${v}</b>${esc(l)}</div>`).join("")}</div>
      ${s.pendientes ? `<div class="notice warn" style="margin-bottom:20px">Hay ${s.pendientes} veterinario(s) esperando verificación. <a href="#/admin/veterinarios">Revisar</a></div>` : ""}
      <div class="card dashed">
        <div class="card-title">Datos de demostración</div>
        <p class="card-sub">Los datos se guardan en este navegador (backend simulado). Puedes restaurar el estado inicial del caso del wireframe.</p>
        <button class="btn danger sm" id="reset">Restaurar datos de demostración</button>
      </div>`, main => {
      main.querySelector("#reset").addEventListener("click", async () => {
        if (!(await ui.confirm("Se borrarán todos los cambios y se cargará de nuevo el caso de demostración.", "Restaurar"))) return;
        await PL.app.resetDemo();
      });
    });
  }, ADMIN);

  /* ---------- Verificación de veterinarios ---------- */
  PL.router.add("/admin/veterinarios", async () => {
    ui.loading();
    const vets = await http.get("/admin/vets");
    const order = { pendiente: 0, rechazado: 1, verificado: 2 };
    vets.sort((a, b) => order[a.verificacion] - order[b.verificacion]);
    const tag = v => ({ pendiente: '<span class="tag warn">Pendiente</span>', verificado: '<span class="tag ok">Verificado</span>', rechazado: '<span class="tag bad">Rechazado</span>' })[v];
    layout("#/admin/veterinarios", "Verificación de veterinarios", `
      <p class="muted" style="margin-top:0">Sin verificación cualquier persona podría escribir en un historial clínico (Anexo B). Revisa la tarjeta profesional antes de aprobar.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Veterinario</th><th>Tarjeta profesional</th><th>Clínica / zona</th><th>Estado</th><th></th></tr></thead>
        <tbody>${vets.map(v => `
          <tr>
            <td><strong>${esc(v.nombre)}</strong><div class="small muted">${esc(v.email)}</div></td>
            <td>${esc(v.tarjeta)}</td>
            <td>${esc(v.clinica || "—")}<div class="small muted">${esc(v.zona || "")}</div></td>
            <td>${tag(v.verificacion)}${v.motivoRechazo ? `<div class="small muted">${esc(v.motivoRechazo)}</div>` : ""}</td>
            <td><div class="row">
              ${v.verificacion !== "verificado" ? `<button class="btn sm" data-ok="${v.id}">Aprobar</button>` : ""}
              ${v.verificacion !== "rechazado" ? `<button class="btn sm danger" data-no="${v.id}">${v.verificacion === "verificado" ? "Revocar" : "Rechazar"}</button>` : ""}
            </div></td>
          </tr>`).join("")}</tbody>
      </table></div>`, main => {
      main.querySelectorAll("[data-ok]").forEach(b => b.addEventListener("click", async () => {
        await http.post("/admin/vets/" + b.dataset.ok + "/verify", { decision: "aprobar" });
        ui.toast("Veterinario verificado");
        PL.router.resolve();
      }));
      main.querySelectorAll("[data-no]").forEach(b => b.addEventListener("click", async () => {
        const motivo = prompt("Motivo (lo verá el veterinario):", "La tarjeta profesional no pudo validarse");
        if (motivo == null) return;
        await http.post("/admin/vets/" + b.dataset.no + "/verify", { decision: "rechazar", motivo });
        ui.toast("Verificación rechazada");
        PL.router.resolve();
      }));
    });
  }, ADMIN);

  /* ---------- Contenido educativo ---------- */
  PL.router.add("/admin/contenido", async () => {
    ui.loading();
    const items = await http.get("/content");
    layout("#/admin/contenido", "Contenido educativo", `
      <button class="btn" id="new" style="margin-bottom:16px">+ Nuevo contenido</button>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Título</th><th>Tema</th><th>Especie · etapa</th><th>Estado</th><th></th></tr></thead>
        <tbody>${items.map(c => `
          <tr>
            <td><strong>${esc(c.titulo)}</strong><div class="small muted">Actualizado ${esc(U.fmtDate(c.actualizado.slice(0, 10)))}</div></td>
            <td>${esc(c.tema)}</td>
            <td>${esc(c.especie)} · ${esc(c.etapa)}</td>
            <td>${c.estado === "publicado" ? '<span class="tag ok">Publicado</span>' : '<span class="tag">Retirado</span>'}</td>
            <td><div class="row"><button class="btn sm outline" data-edit="${c.id}">Editar</button>
              <button class="btn sm ${c.estado === "publicado" ? "danger" : ""}" data-toggle="${c.id}">${c.estado === "publicado" ? "Retirar" : "Publicar"}</button></div></td>
          </tr>`).join("")}</tbody>
      </table></div>`, main => {
      main.querySelector("#new").addEventListener("click", () => contentSheet());
      main.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => contentSheet(items.find(c => c.id === b.dataset.edit))));
      main.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", async () => {
        const c = items.find(x => x.id === b.dataset.toggle);
        await http.patch("/admin/content/" + c.id, { estado: c.estado === "publicado" ? "retirado" : "publicado" });
        PL.router.resolve();
      }));
    });
  }, ADMIN);

  function contentSheet(c) {
    const item = c || { titulo: "", tema: "", especie: "todas", etapa: "todas", texto: "" };
    const opt = (list, val) => list.map(([v, l]) => `<option value="${v}" ${v === val ? "selected" : ""}>${l}</option>`).join("");
    ui.sheet(`
      <h2 style="font-size:20px;margin-bottom:14px">${c ? "Editar contenido" : "Nuevo contenido"}</h2>
      <form id="cf" novalidate>
        <label class="field"><span>Título</span><input class="input" name="titulo" value="${esc(item.titulo)}" required></label>
        <label class="field"><span>Tema</span><input class="input" name="tema" value="${esc(item.tema)}" placeholder="Vacunación, Nutrición…"></label>
        <div class="grid-2">
          <label class="field"><span>Especie</span><select class="input" name="especie">${opt([["todas", "Todas"], ["perro", "Perro"], ["gato", "Gato"]], item.especie)}</select></label>
          <label class="field"><span>Etapa de vida</span><select class="input" name="etapa">${opt([["todas", "Todas"], ["cachorro", "Cachorro"], ["adulto", "Adulto"], ["senior", "Senior"]], item.etapa)}</select></label>
        </div>
        <label class="field"><span>Texto</span><textarea class="input" name="texto" style="min-height:160px">${esc(item.texto)}</textarea></label>
        <p class="form-error"></p>
        <button class="btn block" type="submit">Guardar y publicar</button>
      </form>`, (el, s) => {
      ui.bindForm(el.querySelector("#cf"), async data => {
        if (c) await http.patch("/admin/content/" + c.id, Object.assign(data, { estado: "publicado" }));
        else await http.post("/admin/content", data);
        s.close();
        ui.toast("Contenido publicado");
        PL.router.resolve();
      });
    });
  }

  /* ---------- Mensajes enviados (correo / SMS / WhatsApp) ---------- */
  PL.router.add("/admin/mensajes", async () => {
    ui.loading();
    const msgs = await http.get("/admin/outbox");
    layout("#/admin/mensajes", "Mensajes enviados", `
      <p class="muted" style="margin-top:0">Invitaciones enviadas por los veterinarios a través del servicio de mensajería.</p>
      ${msgs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Canal</th><th>Para</th><th>Mensaje</th></tr></thead>
      <tbody>${msgs.map(m => `<tr><td>${esc(U.fmtDateTime(m.enviado))}</td><td>${esc(m.canal)}</td><td>${esc(m.para)}</td><td class="small">${esc(m.texto)}</td></tr>`).join("")}</tbody></table></div>`
        : ui.empty("Todavía no se han enviado invitaciones.")}`);
  }, ADMIN);
})();
