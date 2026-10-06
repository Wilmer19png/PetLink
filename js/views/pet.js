/* Ficha de la mascota, compartida por dueño y veterinario.
   Pestañas: Historial (wireframe 6), Notas (11), Agenda, Raza (10) y Accesos (7). */
(function () {
  const U = PL.utils;
  const { esc } = U;
  const ui = PL.ui;
  const http = PL.http;

  const TABS_OWNER = [["historial", "Historial"], ["notas", "Notas"], ["agenda", "Agenda"], ["raza", "Raza"], ["accesos", "Accesos"]];
  const TABS_VET = [["historial", "Historial"], ["notas", "Notas del dueño"], ["agenda", "Agenda"], ["raza", "Raza"]];

  async function petScreen({ id, tab }) {
    const role = PL.session.user.rol;
    const isVet = role === "veterinario";
    const tabs = isVet ? TABS_VET : TABS_OWNER;
    const current = tabs.some(t => t[0] === tab) ? tab : "historial";
    ui.loading();
    const pet = await http.get("/pets/" + id);
    const canWrite = isVet && pet.miAcceso === "vigente";

    const tabsHtml = `<div class="chips" style="margin:-4px -16px 14px;padding:0 16px">${tabs
      .map(([k, l]) => `<a class="chip ${k === current ? "active" : ""}" href="#/mascotas/${pet.id}/${k}">${l}</a>`).join("")}</div>`;

    const content = await TAB_RENDERERS[current](pet, { isVet, canWrite });
    ui.screen({
      title: pet.nombre,
      back: isVet ? "#/pacientes" : "#/mascotas",
      right: `<button class="icon-btn" id="more" aria-label="Datos de la mascota">${ui.icons.more}</button>`,
      tab: isVet ? "pacientes" : "mascotas",
      body: tabsHtml + content.html + (canWrite ? `<a class="btn fab" href="#/consulta/nueva?mascota=${pet.id}">+ Nueva consulta</a>` : ""),
      onMount(main) {
        main.parentElement.querySelector("#more").addEventListener("click", () => petInfoSheet(pet, { isVet, canWrite }));
        if (content.mount) content.mount(main);
      }
    });
  }

  PL.router.add("/mascotas/:id", params => petScreen(params), { roles: ["dueno", "veterinario"] });
  PL.router.add("/mascotas/:id/:tab", params => petScreen(params), { roles: ["dueno", "veterinario"] });

  /* ---------- Hoja con los datos de la mascota ---------- */
  function petInfoSheet(pet, ctx) {
    const isOwner = !ctx.isVet;
    ui.sheet(`
      <div class="list-item" style="margin-bottom:14px">${ui.avatar(pet, "lg")}<div class="body"><div class="card-title" style="font-size:20px">${esc(pet.nombre)}</div><div class="card-sub">${esc(ui.ESPECIE_LABEL[pet.especie])} · ${esc(pet.raza)}</div></div></div>
      <form id="pf" novalidate>
        <div class="grid-2">
          <label class="field"><span>Nacimiento</span><input class="input" name="nacimiento" type="month" value="${esc(pet.nacimiento || "")}"></label>
          <label class="field"><span>Peso (kg)</span><input class="input" name="peso" inputmode="decimal" value="${esc(pet.peso != null ? String(pet.peso).replace(".", ",") : "")}"></label>
        </div>
        <dl class="small" style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0 0 14px">
          <dt class="muted">Edad</dt><dd style="margin:0">${esc(U.age(pet.nacimiento) || "—")}</dd>
          <dt class="muted">Sexo</dt><dd style="margin:0">${esc(U.titleCase(pet.sexo || "—"))}</dd>
          <dt class="muted">Código</dt><dd style="margin:0"><strong>${esc(pet.codigo)}</strong></dd>
          <dt class="muted">Titular</dt><dd style="margin:0">${esc(pet.dueno ? pet.dueno.nombre : "Pendiente de reclamo")}</dd>
          ${ctx.isVet && pet.dueno ? `<dt class="muted">Contacto</dt><dd style="margin:0">${esc(pet.dueno.telefono || pet.dueno.email || "")}</dd>` : ""}
          <dt class="muted">Creada por</dt><dd style="margin:0">${esc(pet.creadaPorNombre || "")}</dd>
        </dl>
        <p class="form-error"></p>
        ${isOwner || ctx.canWrite ? '<button class="btn block" type="submit">Guardar cambios</button>' : ""}
      </form>
      ${pet.estado === "pendiente_reclamo" ? '<div class="notice warn small" style="margin-top:12px">El dueño aún no ha aceptado la invitación.</div>' : ""}`, (el, s) => {
      ui.bindForm(el.querySelector("#pf"), async data => {
        await http.patch("/pets/" + pet.id, data);
        s.close();
        ui.toast("Datos actualizados");
        PL.router.resolve();
      });
    });
  }

  /* =======================================================
     Pestañas
     ======================================================= */
  const TAB_RENDERERS = {
    /* ---------- Historial clínico (RF-12, RF-13) ---------- */
    async historial(pet, ctx) {
      const records = await http.get("/pets/" + pet.id + "/records");
      const queued = http.pending().filter(q => q.path === "/pets/" + pet.id + "/records");
      const summary = r => {
        if (r.tipo === "consulta") return [r.motivo, r.diagnostico].filter(Boolean).join(". ");
        return (r.producto || "") + (r.proximaFecha ? ". Próxima: " + U.fmtDate(r.proximaFecha, false) : "");
      };
      const html = `
        ${pet.estado === "pendiente_reclamo" ? '<div class="notice warn small" style="margin-bottom:12px">Invitación pendiente: el dueño aún no ha reclamado este registro.</div>' : ""}
        ${ctx.isVet && pet.miAcceso !== "vigente" ? '<div class="notice bad small" style="margin-bottom:12px">No tienes acceso vigente a este historial.</div>' : ""}
        <h2 class="section-title">Historial clínico</h2>
        ${queued.map(q => `<div class="card dashed"><div class="card-title">${esc(U.fmtDate(q.body.fecha))} · ${esc(ui.TYPE_LABEL[q.body.tipo])}</div><div class="card-sub">${esc(q.body.motivo || q.body.producto || "")}</div><div class="card-meta">⏳ En cola · se enviará al recuperar la conexión</div></div>`).join("")}
        ${records.length ? records.map(r => `
          <button class="card record" data-rec="${r.id}">
            <div class="card-title">${esc(U.fmtDate(r.fecha))} · ${esc(ui.TYPE_LABEL[r.tipo])}</div>
            <div class="card-sub">${esc(summary(r))}</div>
            <div class="card-meta">Registrado por: ${esc(r.autor)}${r.versiones ? " · Editado por " + esc(r.editadoPor) + " (" + r.versiones + (r.versiones === 1 ? " cambio)" : " cambios)") : ""}</div>
          </button>`).join("") : ui.empty("Todavía no hay registros clínicos.")}`;
      return {
        html,
        mount(main) {
          main.querySelectorAll("[data-rec]").forEach(btn =>
            btn.addEventListener("click", () => recordSheet(records.find(r => r.id === btn.dataset.rec), pet, ctx))
          );
        }
      };
    },

    /* ---------- Notas del dueño (RF-14) ---------- */
    async notas(pet, ctx) {
      const notes = await http.get("/pets/" + pet.id + "/notes");
      const weights = notes.filter(n => n.peso).slice(0, 6);
      const html = `
        ${notes.length ? notes.map((n, i) => `
          <div class="card ${i === 0 ? "hl" : ""}">
            <div class="card-title">Nota del dueño · ${esc(U.fmtDate(n.fecha, false))}</div>
            ${n.texto ? `<div class="card-sub" style="color:var(--ink)">${esc(n.texto)}</div>` : ""}
            ${n.peso ? `<div class="card-meta">Peso: ${esc(String(n.peso).replace(".", ","))} kg</div>` : ""}
          </div>`).join("") : ui.empty(ctx.isVet ? "El dueño no ha escrito notas." : "Aún no tienes notas. Registra síntomas o cambios de peso.")}
        ${weights.length > 1 ? `<p class="small muted">Evolución del peso: ${weights.slice().reverse().map(n => String(n.peso).replace(".", ",") + " kg").join(" → ")}</p>` : ""}
        ${ctx.isVet ? "" : `
        <form id="nf" novalidate style="margin-top:18px">
          <label class="field"><span>Nueva nota</span><textarea class="input" name="texto" placeholder="Ej. Estornudó varias veces hoy"></textarea></label>
          <div class="grid-2"><label class="field"><span>Peso (kg)</span><input class="input" name="peso" inputmode="decimal" placeholder="${esc(pet.peso ? String(pet.peso).replace(".", ",") : "0,0")}"></label></div>
          <p class="form-error"></p>
          <button class="btn block" type="submit">Guardar nota</button>
        </form>`}
        <div class="card dashed small muted" style="margin-top:16px">Las notas son visibles para tus veterinarios autorizados y se muestran separadas del historial clínico.</div>`;
      return {
        html,
        mount(main) {
          const f = main.querySelector("#nf");
          if (f) ui.bindForm(f, async data => {
            const res = await http.post("/pets/" + pet.id + "/notes", data);
            ui.toast(res.queued ? "Sin conexión: la nota se guardará al reconectar" : "Nota guardada");
            PL.router.resolve();
          });
        }
      };
    },

    /* ---------- Agenda de cuidados de la mascota (RF-16) ---------- */
    async agenda(pet) {
      const dates = await http.get("/calendar?petId=" + pet.id);
      const pending = dates.filter(d => d.estado !== "cumplida");
      const done = dates.filter(d => d.estado === "cumplida").reverse().slice(0, 5);
      return {
        html: `
          <h2 class="section-title">Calendario de cuidados</h2>
          ${pending.length ? pending.map((d, i) => PL.views.dateCard(d, i === 0)).join("") : ui.empty("No hay fechas pendientes.")}
          ${done.length ? `<h2 class="section-title">Cumplidas</h2>${done.map(d => PL.views.dateCard(d)).join("")}` : ""}
          <p class="hint">Las fechas se generan automáticamente a partir de las vacunas, desparasitaciones y controles que registra el veterinario.</p>`
      };
    },

    /* ---------- Perfil de raza con IA (RF-19, wireframe 10) ---------- */
    async raza(pet) {
      const qs = "especie=" + encodeURIComponent(pet.especie) + "&raza=" + encodeURIComponent(pet.raza) + "&razaKey=" + encodeURIComponent(pet.razaKey || "");
      const profile = await http.get("/breed-profile?" + qs);
      const nivel = { baja: 1, media: 2, alta: 3, "muy alta": 4 }[profile.energia.nivel] || 2;
      const list = items => `<ul style="margin:6px 0 0;padding-left:20px">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
      return {
        html: `
          <h2 class="section-title">Perfil de raza · ${esc(pet.raza)}</h2>
          <div class="breed-hero" id="hero"><span class="small">Cargando foto…</span></div>
          <div class="notice warn small" style="margin:12px 0">ℹ️ ${esc(profile.aviso)}</div>
          ${profile.resumen ? `<p style="margin:0 0 12px">${esc(profile.resumen)}</p>` : ""}
          <div class="card"><div class="card-title">Energía</div><div class="card-sub">${"⚡".repeat(nivel)}${"·".repeat(4 - nivel)} ${esc(U.titleCase(profile.energia.nivel))}: ${esc(profile.energia.texto)}</div></div>
          <div class="card"><div class="card-title">Predisposiciones</div><div class="card-sub">${list(profile.predisposiciones)}</div></div>
          <div class="card"><div class="card-title">Cuidados</div><div class="card-sub">${list(profile.cuidados)}</div></div>
          <p class="hint">Fuente: ${esc(profile.detalleFuente || profile.fuente)} · ${esc(U.fmtDateTime(profile.generado))}</p>
          ${PL.session.user.rol === "dueno" ? '<button class="btn block outline" id="talk" style="margin-top:8px">Hablar con mi veterinario</button>' : ""}`,
        async mount(main) {
          const hero = main.querySelector("#hero");
          const src = pet.foto || (await PL.services.breeds.image(pet.especie, pet.razaKey));
          hero.innerHTML = src ? `<img src="${esc(src)}" alt="Foto de referencia de la raza ${esc(pet.raza)}">` : '<span class="small">Sin foto disponible</span>';
          const talk = main.querySelector("#talk");
          if (talk) talk.addEventListener("click", () => talkToVetSheet(pet));
        }
      };
    },

    /* ---------- Accesos (RF-07, RF-09, wireframe 7) ---------- */
    async accesos(pet) {
      const list = await http.get("/pets/" + pet.id + "/access");
      const row = a => {
        const v = a.veterinario;
        const actions = a.estado === "pendiente"
          ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-approve="${a.id}">Autorizar</button><button class="btn sm danger" data-revoke="${a.id}">Rechazar</button></div>`
          : `<button class="btn sm outline" data-revoke="${a.id}">Retirar</button>`;
        return `
          <div class="card ${a.estado === "pendiente" ? "warn" : ""}">
            <div class="list-item">
              <div class="avatar">${esc(U.initials(v.nombre))}</div>
              <div class="body"><div class="card-title">${esc(v.nombre)}</div>
                <div class="card-sub">${a.estado === "pendiente" ? "Pide acceso desde " + esc(U.fmtDate(a.solicitado, false)) : "Vigente desde " + esc(U.fmtDate(a.concedido, false))}</div>
                <div class="card-meta">${esc(v.clinica || "")}</div></div>
              ${a.estado === "vigente" ? actions : ""}
            </div>
            ${a.estado === "pendiente" ? actions : ""}
          </div>`;
      };
      return {
        html: `
          <h2 class="section-title">Código de la mascota</h2>
          <div class="card center">
            <img class="qr" src="${esc(PL.services.qr.imageUrl(pet.codigo))}" alt="Código QR de ${esc(pet.nombre)}" width="180" height="180">
            <div class="code-box" style="margin-top:8px">${esc(pet.codigo)}</div>
          </div>
          <button class="btn block outline" id="share" style="margin-top:10px">Compartir código</button>
          <h2 class="section-title">Veterinarios con acceso</h2>
          ${list.length ? list.map(row).join("") : ui.empty("Ningún veterinario tiene acceso. Comparte el código para autorizar a uno.")}
          <p class="center muted small" style="margin-top:16px">Solo tú decides quién ve este historial</p>`,
        mount(main) {
          main.querySelector("#share").addEventListener("click", async () => {
            const text = "Código PetLink de " + pet.nombre + ": " + pet.codigo;
            const url = PL.services.qr.linkFor(pet.codigo);
            if (navigator.share) {
              try { await navigator.share({ title: "PetLink · " + pet.nombre, text, url }); } catch (e) { /* cancelado */ }
            } else {
              try {
                await navigator.clipboard.writeText(text + "\n" + url);
                ui.toast("Código copiado. Compártelo con tu veterinario.");
              } catch (e) {
                prompt("Copia el código:", pet.codigo);
              }
            }
          });
          main.querySelectorAll("[data-approve]").forEach(b => b.addEventListener("click", async () => {
            b.disabled = true;
            await http.post("/pets/" + pet.id + "/access/" + b.dataset.approve + "/approve");
            ui.toast("Acceso autorizado");
            PL.router.resolve();
          }));
          main.querySelectorAll("[data-revoke]").forEach(b => b.addEventListener("click", async () => {
            const a = list.find(x => x.id === b.dataset.revoke);
            const ok = await ui.confirm((a.estado === "pendiente" ? "¿Rechazar la solicitud de " : "¿Retirar el acceso de ") + a.veterinario.nombre + "? Dejará de ver el historial de inmediato.", a.estado === "pendiente" ? "Rechazar" : "Retirar");
            if (!ok) return;
            await http.post("/pets/" + pet.id + "/access/" + a.id + "/revoke");
            ui.toast("Acceso retirado");
            PL.router.resolve();
          }));
        }
      };
    }
  };

  /* ---------- Detalle de un registro + versiones ---------- */
  function recordSheet(r, pet, ctx) {
    const rows = [
      ["Fecha", U.fmtDate(r.fecha)],
      ["Motivo", r.motivo], ["Producto", r.producto], ["Diagnóstico", r.diagnostico],
      ["Tratamiento", r.tratamiento], ["Observaciones", r.observaciones],
      [r.tipo === "consulta" ? "Próximo control" : "Próxima dosis", r.proximaFecha ? U.fmtDate(r.proximaFecha) : ""],
      ["Registrado por", r.autor + " · " + U.fmtDateTime(r.creado)],
      ["Versión", String(r.version) + (r.actualizado ? " · editado " + U.fmtDateTime(r.actualizado) : "")]
    ].filter(x => x[1]);
    ui.sheet(`
      <div class="record">
        <div class="type ${r.tipo}">${esc(ui.TYPE_LABEL[r.tipo])}</div>
        <h2 style="font-size:20px">${esc(pet.nombre)} · ${esc(U.fmtDate(r.fecha))}</h2>
        <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      </div>
      <div id="versions" style="margin-top:14px"></div>
      <div class="stack" style="margin-top:16px">
        ${r.versiones ? '<button class="btn block outline" id="vers">Ver historial de cambios</button>' : ""}
        ${ctx.canWrite ? `<a class="btn block" href="#/registro/${r.id}/editar?mascota=${pet.id}" data-close>Modificar registro</a>` : ""}
      </div>`, el => {
      const b = el.querySelector("#vers");
      if (b) b.addEventListener("click", async () => {
        b.disabled = true;
        const versions = await http.get("/records/" + r.id + "/versions");
        el.querySelector("#versions").innerHTML = `<h3 style="font-size:16px;margin-bottom:8px">Versiones anteriores</h3>` + versions.map(v => `
          <div class="card dashed small">
            <strong>Versión ${v.version}</strong> · reemplazada por ${esc(v.editor)} el ${esc(U.fmtDateTime(v.fecha))}
            <div class="muted" style="margin-top:4px">${esc([v.contenidoAnterior.motivo, v.contenidoAnterior.producto, v.contenidoAnterior.diagnostico, v.contenidoAnterior.tratamiento].filter(Boolean).join(" · "))}</div>
          </div>`).join("");
        b.remove();
      });
    });
  }

  /* ---------- Contactar a un veterinario autorizado ---------- */
  async function talkToVetSheet(pet) {
    const list = (await http.get("/pets/" + pet.id + "/access")).filter(a => a.estado === "vigente");
    ui.sheet(`
      <h2 style="font-size:20px;margin-bottom:12px">Hablar con mi veterinario</h2>
      ${list.length ? list.map(a => {
        const v = a.veterinario;
        const text = "Hola " + v.nombre + ", tengo una pregunta sobre " + pet.nombre + " (código PetLink " + pet.codigo + ").";
        return `<div class="card"><div class="card-title">${esc(v.nombre)}</div><div class="card-sub">${esc(v.clinica || "")}</div>
          <div class="row" style="margin-top:10px">
            ${v.telefono ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(PL.services.messaging.whatsappUrl(v.telefono, text))}">WhatsApp</a><a class="btn sm outline" href="tel:${esc(v.telefono)}">Llamar</a>` : ""}
          </div></div>`;
      }).join("") : ui.empty("No tienes veterinarios autorizados.", `<a class="btn" href="#/mapa" data-close>Buscar en el mapa</a>`)}`);
  }
})();
