/* Pantallas del VETERINARIO (wireframe 1, 2 y 3; F-02, F-03, F-04). */
(function () {
  const U = PL.utils;
  const { esc } = U;
  const ui = PL.ui;
  const http = PL.http;
  const VET = { roles: ["veterinario"] };

  /* ---------- Componentes compartidos ---------- */
  function patientStatus(p) {
    if (p.miAcceso === "pendiente") return '<span class="tag warn">Acceso pendiente</span>';
    if (p.estado === "pendiente_reclamo") return '<span class="tag info">Invitación enviada</span>';
    if (p.proximaFecha) {
      const c = p.proximaFecha;
      return c.estado === "vencida"
        ? `<span class="tag bad">${esc(c.titulo)} vencida</span>`
        : `${esc(ui.TYPE_LABEL[c.tipo] || c.titulo)} próxima: ${esc(U.fmtDate(c.fecha, false))}`;
    }
    return p.ultimaConsulta ? "Última consulta: " + esc(U.fmtDate(p.ultimaConsulta, false)) : "Sin registros";
  }

  function patientCard(p, href) {
    return `
      <a class="card list-item" href="${href || (p.miAcceso === "pendiente" ? "#/vincular?codigo=" + encodeURIComponent(p.codigo) : "#/mascotas/" + p.id)}">
        ${ui.avatar(p)}
        <div class="body">
          <div class="card-title">${esc(p.nombre)} · ${esc(ui.ESPECIE_LABEL[p.especie] || "")} · ${esc(p.raza)}</div>
          <div class="card-sub">${patientStatus(p)}</div>
        </div>
      </a>`;
  }
  PL.views = PL.views || {};
  PL.views.patientCard = patientCard;

  /* ---------- Inicio del veterinario ---------- */
  PL.router.add("/vet", async () => {
    ui.loading("Inicio");
    const [pets, dates] = await Promise.all([http.get("/pets"), http.get("/calendar")]);
    const user = PL.session.user;
    const pendientes = pets.filter(p => p.miAcceso === "pendiente");
    const upcoming = dates.filter(d => d.estado !== "cumplida" && U.daysBetween(U.today(), d.fecha) <= 30).slice(0, 5);
    ui.screen({
      title: "Hola, " + user.nombre.split(" ").slice(0, 2).join(" "),
      right: PL.app.headerActions(),
      tab: "inicio",
      body: `
        <div class="grid-2">
          <a class="card" href="#/pacientes"><div class="muted small">Pacientes</div><div style="font-size:28px;font-weight:800;color:var(--teal)">${pets.filter(p => p.miAcceso === "vigente").length}</div></a>
          <a class="card ${pendientes.length ? "warn" : ""}" href="#/pacientes"><div class="muted small">Esperando autorización</div><div style="font-size:28px;font-weight:800;color:var(--amber)">${pendientes.length}</div></a>
        </div>
        <h2 class="section-title">Próximas fechas de tus pacientes</h2>
        ${upcoming.length ? upcoming.map(d => `
          <a class="card ${d.estado === "vencida" ? "danger" : ""}" href="#/mascotas/${d.mascotaId}">
            <div class="card-title">${esc(d.titulo)} · ${esc(d.mascota)}</div>
            <div class="card-sub">${esc(U.relDays(d.fecha))} · ${esc(U.fmtDate(d.fecha))}</div>
          </a>`).join("") : ui.empty("No hay fechas en los próximos 30 días.")}
        <h2 class="section-title">Acciones rápidas</h2>
        <div class="grid-2">
          <a class="btn" href="#/consulta/nueva">Nueva consulta</a>
          <a class="btn outline" href="#/vincular">Vincular código</a>
        </div>`
    });
  }, VET);

  /* ---------- Pacientes (wireframe 1) ---------- */
  PL.router.add("/pacientes", async () => {
    ui.loading("Pacientes");
    const pets = await http.get("/pets");
    ui.screen({
      title: "Pacientes",
      right: `<a class="badge-link" href="#/pacientes/nueva">+ Nueva</a>`,
      tab: "pacientes",
      body: `
        <input class="input" id="q" type="search" placeholder="Buscar paciente o código" aria-label="Buscar paciente o código">
        <div class="row" style="margin:12px 0 4px">
          <a class="btn sm" href="#/pacientes/nueva">Crear mascota</a>
          <a class="btn sm outline" href="#/vincular">Vincular código</a>
        </div>
        <h2 class="section-title">Pacientes recientes</h2>
        <div id="list"></div>
        <a class="btn fab" href="#/consulta/nueva">+ Nueva consulta</a>`,
      onMount(main) {
        const list = main.querySelector("#list");
        const render = q => {
          const term = q.trim().toLowerCase();
          const found = pets.filter(p => !term || p.nombre.toLowerCase().includes(term) || (p.codigo || "").toLowerCase().includes(term) || (p.raza || "").toLowerCase().includes(term));
          const codeLike = /^[a-z]{2,5}-[a-z0-9]{3}-[a-z0-9]{3}$/i.test(q.trim());
          list.innerHTML = (found.length ? found.map(p => patientCard(p)).join("") : ui.empty(term ? "Ningún paciente coincide." : "Aún no tienes pacientes. Crea una mascota o vincúlala con su código."))
            + (codeLike && !found.length ? `<a class="btn block outline" style="margin-top:12px" href="#/vincular?codigo=${encodeURIComponent(q.trim().toUpperCase())}">Vincular con el código ${esc(q.trim().toUpperCase())}</a>` : "");
        };
        render("");
        main.querySelector("#q").addEventListener("input", U.debounce(e => render(e.target.value), 150));
      }
    });
  }, Object.assign({ tab: "pacientes" }, VET));

  /* ---------- Crear mascota (wireframe 2; también la usa el dueño) ---------- */
  async function petFormScreen(asVet) {
    ui.screen({
      title: "Crear mascota",
      back: true,
      tab: asVet ? "pacientes" : "mascotas",
      body: `
        <form id="f" novalidate>
          <label class="field"><span>Nombre</span><input class="input" name="nombre" required></label>
          <div class="grid-2">
            <label class="field"><span>Especie</span>
              <select class="input" name="especie"><option value="perro">Perro</option><option value="gato">Gato</option><option value="otro">Otro</option></select></label>
            <label class="field"><span>Raza</span>
              <select class="input" name="razaKey" id="raza"><option value="">Cargando…</option></select></label>
          </div>
          <div class="grid-2">
            <label class="field"><span>Nacimiento</span><input class="input" name="nacimiento" type="month" max="${U.today().slice(0, 7)}"></label>
            <label class="field"><span>Sexo</span>
              <select class="input" name="sexo"><option value="hembra">Hembra</option><option value="macho">Macho</option></select></label>
          </div>
          <div class="grid-2">
            <label class="field"><span>Peso (kg)</span><input class="input" name="peso" inputmode="decimal" placeholder="0,0"></label>
          </div>
          <p class="hint" id="breed-src" style="margin-top:-6px"></p>
          ${asVet ? `
          <h2 class="section-title">Datos del dueño (invitación)</h2>
          <label class="field"><span>Nombre del dueño</span><input class="input" name="duenoNombre" required></label>
          <label class="field"><span>Teléfono o correo</span><input class="input" name="duenoContacto" required placeholder="300 000 0000 o correo@ejemplo.com"></label>` : ""}
          <p class="form-error"></p>
          <button class="btn block" type="submit">${asVet ? "Crear e invitar al dueño" : "Guardar mascota"}</button>
        </form>`,
      onMount(main) {
        const form = main.querySelector("#f");
        const sel = main.querySelector("#raza");
        const src = main.querySelector("#breed-src");
        let breeds = [];
        const loadBreeds = async () => {
          sel.innerHTML = '<option value="">Cargando…</option>';
          breeds = await PL.services.breeds.list(form.especie.value);
          sel.innerHTML = breeds.map(b => `<option value="${esc(b.key)}">${esc(b.label)}</option>`).join("");
          src.textContent = breeds.length > 1
            ? breeds.length - 1 + " razas desde " + (form.especie.value === "perro" ? "Dog CEO API" : "catfact.ninja")
            : form.especie.value === "otro" ? "" : "Catálogo de razas sin conexión";
        };
        form.especie.addEventListener("change", loadBreeds);
        loadBreeds();

        ui.bindForm(form, async data => {
          const breed = breeds.find(b => b.key === data.razaKey) || PL.services.breeds.MIXED;
          data.raza = breed.label;
          if (data.especie !== "otro") data.foto = await PL.services.breeds.image(data.especie, data.razaKey);
          const res = await http.post("/pets", data);
          if (asVet && res.invite) showInvite(res.invite, res.pet);
          else {
            ui.toast(res.pet.nombre + " fue registrada");
            location.hash = "#/mascotas/" + res.pet.id;
          }
        });
      }
    });
  }

  function showInvite(invite, pet) {
    const user = PL.session.user;
    const msg = PL.services.messaging.inviteChannels(invite, pet.nombre, user.nombre);
    ui.sheet(`
      <h2 style="font-size:20px;margin-bottom:6px">✅ ${esc(pet.nombre)} fue creada</h2>
      <p class="muted" style="margin-top:0">Envía la invitación a ${esc(invite.nombre || invite.contacto)} para que quede como titular.</p>
      <div class="card dashed small" style="margin-bottom:14px">${esc(msg.text)}</div>
      <div class="stack">
        ${msg.channels.map(c => `<a class="btn block" target="_blank" rel="noopener" data-canal="${c.canal}" href="${esc(c.url)}">${esc(c.label)}</a>`).join("")}
        <button class="btn block outline" id="copy">Copiar enlace</button>
        <a class="btn block ghost" href="#/mascotas/${pet.id}" data-close>Ver ficha del paciente</a>
      </div>`, (el, s) => {
      el.querySelectorAll("[data-canal]").forEach(a =>
        a.addEventListener("click", () => PL.services.messaging.logSent(a.dataset.canal, invite.contacto, msg.subject, msg.text))
      );
      el.querySelector("#copy").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(msg.link);
          ui.toast("Enlace copiado");
        } catch (e) {
          prompt("Copia el enlace:", msg.link);
        }
      });
      el.querySelector("[data-close]").addEventListener("click", s.close);
    });
    location.hash = "#/mascotas/" + pet.id;
  }

  PL.router.add("/pacientes/nueva", () => petFormScreen(true), Object.assign({ tab: "pacientes" }, VET));
  PL.router.add("/mascotas/nueva", () => petFormScreen(false), { roles: ["dueno"], tab: "mascotas" });

  /* ---------- Nueva consulta / editar registro (wireframe 3) ---------- */
  function recordForm(pet, rec) {
    const r = rec || { tipo: "consulta", fecha: U.today() };
    const quick = [["+1 mes", 30], ["+3 meses", 91], ["+6 meses", 182], ["+1 año", 365]];
    return `
      <div class="chips" id="tipos" role="tablist" ${rec ? 'aria-disabled="true"' : ""}>
        ${["consulta", "vacuna", "desparasitacion"].map(t => `<button type="button" class="chip ${r.tipo === t ? "active" : ""}" data-tipo="${t}" ${rec && r.tipo !== t ? "disabled" : ""}>${ui.TYPE_LABEL[t]}</button>`).join("")}
      </div>
      <form id="f" novalidate style="margin-top:16px">
        <input type="hidden" name="tipo" value="${esc(r.tipo)}">
        ${rec ? `<input type="hidden" name="baseVersion" value="${rec.version}">` : ""}
        <label class="field"><span>Fecha</span><input class="input" name="fecha" type="date" max="${U.today()}" value="${esc(r.fecha)}" required></label>
        <label class="field t-consulta"><span>Motivo de consulta</span><input class="input" name="motivo" value="${esc(r.motivo || "")}" placeholder="Control general"></label>
        <label class="field t-dosis"><span id="prod-label">Vacuna aplicada</span><input class="input" name="producto" value="${esc(r.producto || "")}" list="productos"></label>
        <datalist id="productos"></datalist>
        <label class="field t-consulta"><span>Diagnóstico</span><textarea class="input" name="diagnostico">${esc(r.diagnostico || "")}</textarea></label>
        <label class="field t-consulta"><span>Tratamiento</span><textarea class="input" name="tratamiento">${esc(r.tratamiento || "")}</textarea></label>
        <label class="field"><span>Observaciones</span><textarea class="input" name="observaciones" style="min-height:60px">${esc(r.observaciones || "")}</textarea></label>
        <label class="field"><span id="next-label">Próxima fecha (opcional)</span><input class="input" name="proximaFecha" type="date" value="${esc(r.proximaFecha || "")}"></label>
        <div class="chips" style="margin:-6px 0 14px">${quick.map(([l, d]) => `<button type="button" class="chip" data-add="${d}">${l}</button>`).join("")}</div>
        <p class="hint" style="margin-top:-6px">La próxima fecha crea un recordatorio automático para el dueño.</p>
        <p class="form-error"></p>
        <button class="btn block" type="submit">${rec ? "Guardar cambios" : "Guardar registro"}</button>
      </form>`;
  }

  const PRODUCTS = {
    perro: { vacuna: ["Antirrábica", "Múltiple (parvovirus, moquillo, hepatitis)", "Tos de las perreras", "Leptospirosis"], desparasitacion: ["Antiparasitario interno", "Antipulgas y garrapatas", "Interno y externo"] },
    gato: { vacuna: ["Triple felina", "Antirrábica", "Leucemia felina"], desparasitacion: ["Antiparasitario interno", "Pipeta antipulgas", "Interno y externo"] }
  };

  function wireRecordForm(main, pet, onSubmit) {
    const form = main.querySelector("#f");
    const setTipo = tipo => {
      form.tipo.value = tipo;
      main.querySelectorAll("[data-tipo]").forEach(b => b.classList.toggle("active", b.dataset.tipo === tipo));
      main.querySelectorAll(".t-consulta").forEach(el => (el.hidden = tipo !== "consulta"));
      main.querySelectorAll(".t-dosis").forEach(el => (el.hidden = tipo === "consulta"));
      main.querySelector("#prod-label").textContent = tipo === "vacuna" ? "Vacuna aplicada" : "Producto aplicado";
      main.querySelector("#next-label").textContent = tipo === "consulta" ? "Próximo control (opcional)" : "Próxima dosis (opcional)";
      const list = (PRODUCTS[pet.especie] || PRODUCTS.perro)[tipo] || [];
      main.querySelector("#productos").innerHTML = list.map(p => `<option value="${esc(p)}">`).join("");
    };
    main.querySelectorAll("[data-tipo]").forEach(b => b.addEventListener("click", () => !b.disabled && setTipo(b.dataset.tipo)));
    main.querySelectorAll("[data-add]").forEach(b =>
      b.addEventListener("click", () => (form.proximaFecha.value = U.addDays(form.fecha.value || U.today(), Number(b.dataset.add))))
    );
    setTipo(form.tipo.value);
    ui.bindForm(form, onSubmit);
  }

  PL.router.add("/consulta/nueva", async (_, query) => {
    if (!query.mascota) {
      // Botón rápido → elegir paciente (ruta 11.3: 3 toques).
      ui.loading("Nueva consulta");
      const pets = (await http.get("/pets")).filter(p => p.miAcceso === "vigente");
      return ui.screen({
        title: "Nueva consulta",
        back: true,
        tab: "pacientes",
        body: `<p class="muted" style="margin-top:0">Elige el paciente</p>` +
          (pets.length ? pets.map(p => patientCard(p, "#/consulta/nueva?mascota=" + p.id)).join("") : ui.empty("No tienes pacientes con acceso vigente.", '<a class="btn" href="#/pacientes/nueva">Crear mascota</a>'))
      });
    }
    ui.loading("Nueva consulta");
    const pet = await http.get("/pets/" + query.mascota);
    ui.screen({
      title: "Nueva consulta · " + pet.nombre,
      back: "#/mascotas/" + pet.id,
      tab: "pacientes",
      body: recordForm(pet),
      onMount(main) {
        wireRecordForm(main, pet, async data => {
          const saved = await http.post("/pets/" + pet.id + "/records", data);
          ui.toast(saved.queued ? "Sin conexión: el registro quedó en cola y se enviará al reconectar" : "Registro guardado");
          location.hash = "#/mascotas/" + pet.id;
        });
      }
    });
  }, Object.assign({ tab: "pacientes" }, VET));

  PL.router.add("/registro/:id/editar", async ({ id }, query) => {
    ui.loading("Editar registro");
    const pet = await http.get("/pets/" + query.mascota);
    const records = await http.get("/pets/" + pet.id + "/records");
    const rec = records.find(r => r.id === id);
    if (!rec) throw new Error("Registro no encontrado");
    ui.screen({
      title: "Editar · " + pet.nombre,
      back: "#/mascotas/" + pet.id,
      tab: "pacientes",
      body: `<div class="notice info small" style="margin-bottom:14px">La versión actual se conservará en el historial de cambios con tu nombre y la fecha.</div>` + recordForm(pet, rec),
      onMount(main) {
        wireRecordForm(main, pet, async data => {
          await http.patch("/records/" + rec.id, data);
          ui.toast("Registro actualizado (versión " + (rec.version + 1) + ")");
          location.hash = "#/mascotas/" + pet.id;
        });
      }
    });
  }, Object.assign({ tab: "pacientes" }, VET));

  /* ---------- Vincular con código o QR (RF-08) ---------- */
  PL.router.add("/vincular", (_, query) => {
    ui.screen({
      title: "Vincular mascota",
      back: true,
      tab: "pacientes",
      body: `
        <p class="muted" style="margin-top:0">Pide al dueño el código de su mascota o escanea su QR. El dueño debe autorizarte para que veas el historial.</p>
        <form id="f" novalidate>
          <label class="field"><span>Código de la mascota</span>
            <input class="input code-box" name="codigo" value="${esc(query.codigo || "")}" placeholder="LUNA-7K2-QX9" autocapitalize="characters" required style="font-size:18px"></label>
          <p class="form-error"></p>
          <button class="btn block" type="submit">Solicitar acceso</button>
        </form>
        <div class="row" style="margin:16px 0"><hr class="sep" style="flex:1;margin:0"><span class="muted small">o</span><hr class="sep" style="flex:1;margin:0"></div>
        <label class="btn block outline" style="cursor:pointer">📷 Leer QR desde una foto
          <input type="file" accept="image/*" capture="environment" id="qrfile" hidden></label>
        <p class="hint center">El QR se decodifica con QR Server API.</p>
        <div id="result" style="margin-top:16px"></div>`,
      onMount(main) {
        const form = main.querySelector("#f");
        const result = main.querySelector("#result");
        const submit = async data => {
          const res = await http.post("/access/request", data);
          const p = res.pet;
          if (res.access.estado === "vigente") {
            ui.toast("Ya tienes acceso a " + p.nombre);
            location.hash = "#/mascotas/" + p.id;
            return;
          }
          result.innerHTML = `
            <div class="card warn list-item">
              ${ui.avatar(p)}
              <div class="body">
                <div class="card-title">${esc(p.nombre)} · ${esc(p.raza)}</div>
                <div class="card-sub">Solicitud enviada a ${esc(p.dueno ? p.dueno.nombre : "el dueño")}. Verás el historial cuando te autorice.</div>
              </div>
            </div>`;
        };
        ui.bindForm(form, submit);
        main.querySelector("#qrfile").addEventListener("change", async e => {
          const file = e.target.files[0];
          if (!file) return;
          ui.toast("Leyendo QR…");
          try {
            form.codigo.value = await PL.services.qr.read(file);
            form.requestSubmit();
          } catch (err) {
            ui.toast(ui.errorMessage(err), 4000);
          }
        });
        if (query.codigo) form.requestSubmit();
      }
    });
  }, Object.assign({ tab: "pacientes" }, VET));

  /* ---------- Perfil del veterinario (RF-02, RF-03) ---------- */
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const SERVICIOS = ["Consulta general", "Vacunación", "Desparasitación", "Atención a domicilio", "Cirugía menor", "Dermatología", "Gatos", "Urgencias"];

  PL.router.add("/vet/perfil", async () => {
    ui.loading("Perfil");
    const me = await http.get("/me");
    http.saveSession(PL.session.token, me);
    const p = me.perfil || {};
    const status = {
      verificado: '<div class="notice info">✅ Perfil verificado. Tienes acceso a las funciones clínicas.</div>',
      pendiente: '<div class="notice warn">⏳ Tu tarjeta profesional <strong>' + esc(p.tarjeta || "") + "</strong> está en revisión. Mientras tanto no puedes ver ni registrar datos clínicos.</div>",
      rechazado: '<div class="notice bad">❌ Tu verificación fue rechazada: ' + esc(p.motivoRechazo || "") + "</div>"
    }[me.verificacion];

    ui.screen({
      title: "Perfil",
      right: PL.app.headerActions(),
      tab: "perfil",
      body: `
        ${status}
        <div class="list-item" style="margin:18px 0">
          <div class="avatar lg">${esc(U.initials(me.nombre))}</div>
          <div class="body"><div class="card-title" style="font-size:20px">${esc(me.nombre)}</div><div class="card-sub">${esc(me.email)} · ${esc(me.telefono || "sin celular")}</div></div>
        </div>
        <form id="f" novalidate>
          <h2 class="section-title">Perfil público (aparece en el mapa)</h2>
          <label class="field"><span>Clínica o consultorio</span><input class="input" name="clinica" value="${esc(p.clinica || "")}"></label>
          <label class="field"><span>Zona de atención</span><input class="input" name="zona" value="${esc(p.zona || "")}" placeholder="Barrios o municipios"></label>
          <label class="field"><span>Horario</span><input class="input" name="horario" value="${esc(p.horario || "")}" placeholder="Lun a Vie · 8:00 a 17:00"></label>
          <div class="field"><span>Días de atención</span>
            <div class="chips">${DIAS.map((d, i) => `<label class="chip ${(p.dias || []).includes(i) ? "active" : ""}"><input type="checkbox" hidden data-dia="${i}" ${(p.dias || []).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div></div>
          <div class="field"><span>Servicios</span>
            ${SERVICIOS.map(s => `<label class="check"><input type="checkbox" data-serv="${esc(s)}" ${(p.servicios || []).includes(s) ? "checked" : ""}>${esc(s)}</label>`).join("")}</div>
          <label class="check"><input type="checkbox" name="domicilio" ${p.domicilio ? "checked" : ""}><strong>Atiendo a domicilio</strong></label>
          <div class="field"><span>Ubicación del consultorio</span>
            <div class="row"><span class="muted small" id="loc">${p.lat != null ? p.lat.toFixed(5) + ", " + p.lng.toFixed(5) : "Sin ubicación (no apareces en el mapa)"}</span>
            <button type="button" class="btn sm outline" id="geo">Usar mi ubicación</button></div></div>
          <p class="form-error"></p>
          <button class="btn block" type="submit">Guardar perfil</button>
        </form>
        <hr class="sep">
        <button class="btn block danger" id="logout">Cerrar sesión</button>`,
      onMount(main) {
        const form = main.querySelector("#f");
        let coords = p.lat != null ? { lat: p.lat, lng: p.lng } : null;
        main.querySelectorAll("[data-dia]").forEach(cb => cb.addEventListener("change", () => cb.parentElement.classList.toggle("active", cb.checked)));
        main.querySelector("#geo").addEventListener("click", async () => {
          const loc = await PL.services.maps.getLocation();
          coords = { lat: loc.lat, lng: loc.lng };
          main.querySelector("#loc").textContent = loc.lat.toFixed(5) + ", " + loc.lng.toFixed(5) + (loc.real ? "" : " (ubicación por defecto)");
        });
        ui.bindForm(form, async data => {
          const body = {
            clinica: data.clinica, zona: data.zona, horario: data.horario, domicilio: data.domicilio,
            dias: [...main.querySelectorAll("[data-dia]:checked")].map(cb => Number(cb.dataset.dia)),
            servicios: [...main.querySelectorAll("[data-serv]:checked")].map(cb => cb.dataset.serv)
          };
          if (coords) Object.assign(body, coords);
          const me2 = await http.patch("/me/vet-profile", body);
          http.saveSession(PL.session.token, me2);
          ui.toast("Perfil guardado");
        });
        main.querySelector("#logout").addEventListener("click", PL.app.logout);
      }
    });
  }, Object.assign({ tab: "perfil", allowUnverified: true }, VET));
})();
