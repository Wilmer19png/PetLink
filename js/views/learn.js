/* Aprender: contenido educativo por especie y etapa (RF-18, HU-19). */
(function () {
  const U = PL.utils;
  const { esc } = U;
  const ui = PL.ui;
  const http = PL.http;

  PL.router.add("/aprender", async (_, query) => {
    ui.loading("Aprender");
    const pets = await http.get("/pets");
    const items = await http.get("/content");
    const temas = [...new Set(items.map(c => c.tema))].sort();
    const tema = query.tema || "";

    // Lo sugerido se adapta a las mascotas del dueño (especie y etapa de vida).
    const profiles = pets.map(p => ({ especie: p.especie, etapa: U.lifeStage(p.especie, p.nacimiento), nombre: p.nombre }));
    const fits = c => profiles.filter(p => (c.especie === "todas" || c.especie === p.especie) && (c.etapa === "todas" || c.etapa === p.etapa));
    const suggested = items.filter(c => fits(c).length && c.especie !== "todas").slice(0, 4);
    const list = tema ? items.filter(c => c.tema === tema) : items;

    const card = c => {
      const forPets = fits(c).map(p => p.nombre);
      return `<a class="card" href="#/aprender/${c.id}">
        <div class="row spread"><span class="tag info">${esc(c.tema)}</span><span class="small muted">${esc(U.titleCase(c.especie === "todas" ? "Todas las especies" : c.especie + "s"))} · ${esc(c.etapa === "todas" ? "todas las edades" : c.etapa)}</span></div>
        <div class="card-title" style="margin-top:6px">${esc(c.titulo)}</div>
        <div class="card-sub">${esc(c.texto.slice(0, 90))}…</div>
        ${forPets.length && c.especie !== "todas" ? `<div class="card-meta">Para ${esc(forPets.join(" y "))}</div>` : ""}
      </a>`;
    };

    ui.screen({
      title: "Aprender",
      right: PL.app.headerActions(),
      tab: "aprender",
      body: `
        ${pets.length ? `
        <h2 class="section-title">Perfil de raza de tus mascotas</h2>
        <div class="chips">${pets.map(p => `<a class="chip" href="#/mascotas/${p.id}/raza">✨ ${esc(p.nombre)} · ${esc(p.raza)}</a>`).join("")}</div>` : ""}
        ${suggested.length && !tema ? `<h2 class="section-title">Sugerido para ti</h2>${suggested.map(card).join("")}` : ""}
        <h2 class="section-title">Explorar por tema</h2>
        <div class="chips" style="margin-bottom:12px">
          <a class="chip ${!tema ? "active" : ""}" href="#/aprender">Todos</a>
          ${temas.map(t => `<a class="chip ${t === tema ? "active" : ""}" href="#/aprender?tema=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}
        </div>
        ${list.map(card).join("") || ui.empty("No hay contenido en este tema.")}`
    });
  }, { roles: ["dueno"], tab: "aprender" });

  PL.router.add("/aprender/:id", async ({ id }) => {
    ui.loading();
    const c = await http.get("/content/" + id);
    ui.screen({
      title: c.tema,
      back: "#/aprender",
      tab: "aprender",
      body: `
        <h2 style="font-size:24px;font-weight:800;margin:4px 0 10px">${esc(c.titulo)}</h2>
        <p class="small muted">${esc(U.titleCase(c.especie === "todas" ? "Todas las especies" : c.especie + "s"))} · ${esc(c.etapa === "todas" ? "todas las edades" : "etapa " + c.etapa)} · Actualizado ${esc(U.fmtDate(c.actualizado.slice(0, 10)))}</p>
        <p style="font-size:17px;line-height:1.6">${esc(c.texto)}</p>
        <div class="notice info small" style="margin-top:18px">Contenido revisado por el equipo de PetLink. Ante cualquier síntoma, consulta a tu veterinario.</div>`
    });
  }, { roles: ["dueno"], tab: "aprender" });
})();
