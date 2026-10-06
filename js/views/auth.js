/* Pantallas de cuenta: inicio de sesión, registro por rol e invitación (F-01, F-02). */
(function () {
  const { esc } = PL.utils;
  const ui = PL.ui;
  const http = PL.http;

  const DEMO = [
    ["Dueña · Camila", "camila@petlink.co", "dueno123"],
    ["Veterinaria · Dra. Ana", "ana@petlink.co", "vet123"],
    ["Veterinario · Dr. Luis", "luis@petlink.co", "vet123"],
    ["Vet. sin verificar", "andres@petlink.co", "vet123"],
    ["Administrador", "admin@petlink.co", "admin123"]
  ];

  function afterLogin(res) {
    http.saveSession(res.token, res.user);
    PL.app.onSession();
    const next = PL.utils.store.get("pl_after_login", null);
    PL.utils.store.remove("pl_after_login");
    location.hash = next && next !== "#/login" ? next : PL.router.homeFor(res.user);
  }

  /* ---------- Iniciar sesión ---------- */
  PL.router.add("/login", () => {
    if (PL.session.user) return (location.hash = PL.router.homeFor(PL.session.user));
    ui.screen({
      noTabs: true,
      body: `
        <div class="auth-hero">
          <img class="logo" src="assets/icon.svg" alt="">
          <h1>PetLink</h1>
          <p class="muted">El historial de salud de tu mascota, siempre contigo.</p>
        </div>
        <form id="f" novalidate>
          <label class="field"><span>Correo</span><input class="input" name="email" type="email" autocomplete="email" required></label>
          <label class="field"><span>Contraseña</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
          <p class="form-error"></p>
          <button class="btn block" type="submit">Iniciar sesión</button>
        </form>
        <p class="center" style="margin:18px 0">¿No tienes cuenta? <a href="#/registro">Regístrate</a></p>
        <div class="card dashed demo-users">
          <strong>Usuarios de prueba</strong>
          <div class="stack" style="margin-top:6px">
            ${DEMO.map(([label, email, pass]) => `<div>${esc(label)}: <button type="button" data-email="${esc(email)}" data-pass="${esc(pass)}">${esc(email)}</button></div>`).join("")}
          </div>
        </div>`,
      onMount(main) {
        const form = main.querySelector("#f");
        ui.bindForm(form, async data => afterLogin(await http.post("/auth/login", data)));
        main.querySelectorAll("[data-email]").forEach(b =>
          b.addEventListener("click", () => {
            form.email.value = b.dataset.email;
            form.password.value = b.dataset.pass;
            form.requestSubmit();
          })
        );
      }
    });
  }, { public: true });

  /* ---------- Registro por rol (RF-01) ---------- */
  function registerForm(prefill) {
    const p = prefill || {};
    return `
      <form id="f" novalidate>
        ${p.lockRole ? `<input type="hidden" name="rol" value="dueno">` : `
        <div class="role-pick" role="radiogroup" aria-label="Tipo de cuenta">
          <div><input type="radio" id="r-d" name="rol" value="dueno" checked><label for="r-d">🐶 Soy dueño</label></div>
          <div><input type="radio" id="r-v" name="rol" value="veterinario"><label for="r-v">🩺 Soy veterinario</label></div>
        </div>`}
        <label class="field"><span>Nombre completo</span><input class="input" name="nombre" value="${esc(p.nombre || "")}" autocomplete="name" required></label>
        <label class="field"><span>Correo</span><input class="input" name="email" type="email" value="${esc(p.email || "")}" autocomplete="email" required></label>
        <label class="field"><span>Celular</span><input class="input" name="telefono" type="tel" value="${esc(p.telefono || "")}" autocomplete="tel" placeholder="300 000 0000"></label>
        <div class="vet-only" hidden>
          <label class="field"><span>Tarjeta profesional</span><input class="input" name="tarjeta" placeholder="MV-00000"></label>
          <label class="field"><span>Clínica o consultorio (opcional)</span><input class="input" name="clinica"></label>
          <div class="notice info small" style="margin-bottom:14px">Un administrador verificará tu tarjeta profesional antes de habilitar las funciones clínicas.</div>
        </div>
        <label class="field"><span>${p.lockRole ? "Crea tu contraseña" : "Contraseña"}</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="6" required></label>
        <p class="form-error"></p>
        <button class="btn block" type="submit">${esc(p.submit || "Crear cuenta")}</button>
      </form>`;
  }

  function wireRolePick(main) {
    const vetOnly = main.querySelector(".vet-only");
    main.querySelectorAll('input[name="rol"]').forEach(r =>
      r.addEventListener("change", () => (vetOnly.hidden = main.querySelector('input[name="rol"]:checked').value !== "veterinario"))
    );
  }

  PL.router.add("/registro", () => {
    ui.screen({
      title: "Crear cuenta",
      back: "#/login",
      noTabs: true,
      body: registerForm(),
      onMount(main) {
        wireRolePick(main);
        ui.bindForm(main.querySelector("#f"), async data => afterLogin(await http.post("/auth/register", data)));
      }
    });
  }, { public: true });

  /* ---------- Invitación (pantalla 4 del wireframe, RF-06) ---------- */
  PL.router.add("/invitacion/:token", async ({ token }) => {
    ui.loading("Invitación");
    const inv = await http.get("/invites/" + encodeURIComponent(token));
    const user = PL.session.user;
    const used = inv.estado !== "pendiente";
    const petImg = inv.mascota.foto ? `<img src="${esc(inv.mascota.foto)}" alt="" style="width:120px;height:120px;object-fit:cover;border-radius:16px;margin:0 auto">` : `<div class="avatar lg" style="margin:0 auto;width:120px;height:120px;font-size:44px">${esc(PL.utils.initials(inv.mascota.nombre))}</div>`;

    let action;
    if (used) action = `<div class="notice info">Esta invitación ya fue aceptada.</div><a class="btn block" style="margin-top:14px" href="${PL.router.homeFor(user)}">Ir a PetLink</a>`;
    else if (user && user.rol === "dueno") action = `<button class="btn block" id="accept">Aceptar y ser titular</button>`;
    else if (user) action = `<div class="notice warn">Estás conectado como ${esc(user.nombre)}. Cierra sesión e ingresa con la cuenta del dueño.</div>`;
    else action = `
      <div id="new-acc">${registerForm({ nombre: inv.nombre, email: PL.services.messaging.isEmail(inv.contacto) ? inv.contacto : "", telefono: PL.services.messaging.isEmail(inv.contacto) ? "" : inv.contacto, lockRole: true, submit: "Aceptar y ser titular" })}</div>
      <p class="center small" style="margin-top:12px">¿Ya tienes cuenta? <a href="#/login" id="have">Inicia sesión</a></p>`;

    ui.screen({
      title: "Invitación",
      noTabs: !user,
      body: `
        <div class="center" style="margin:8px 0 18px">
          ${petImg}
          <p style="margin:14px 0 0">Tu veterinario creó el</p>
          <h2 style="font-size:24px;font-weight:800">registro de ${esc(inv.mascota.nombre)}</h2>
        </div>
        <div class="card" style="margin-bottom:18px">
          <div class="card-title">${esc(inv.mascota.nombre)} · ${esc(ui.ESPECIE_LABEL[inv.mascota.especie] || "")} · ${esc(inv.mascota.raza)}</div>
          <div class="card-sub">Creado por: ${esc(inv.veterinario.nombre)}</div>
          <div class="card-sub">${esc(inv.veterinario.clinica || "")}</div>
        </div>
        ${action}
        <p class="center muted small" style="margin-top:16px">Podrás retirar accesos cuando quieras</p>`,
      onMount(main) {
        const acceptBtn = main.querySelector("#accept");
        if (acceptBtn) acceptBtn.addEventListener("click", async () => {
          acceptBtn.disabled = true;
          try {
            const pet = await http.post("/invites/" + encodeURIComponent(token) + "/accept");
            ui.toast("¡Ahora eres titular de " + pet.nombre + "!");
            location.hash = "#/mascotas/" + pet.id;
          } catch (err) {
            ui.toast(ui.errorMessage(err));
            acceptBtn.disabled = false;
          }
        });
        const form = main.querySelector("#new-acc form");
        if (form) {
          ui.bindForm(form, async data => {
            const res = await http.post("/auth/register", Object.assign(data, { rol: "dueno" }));
            http.saveSession(res.token, res.user);
            PL.app.onSession();
            const pet = await http.post("/invites/" + encodeURIComponent(token) + "/accept");
            ui.toast("¡Bienvenido! Ahora eres titular de " + pet.nombre);
            location.hash = "#/mascotas/" + pet.id;
          });
          main.querySelector("#have").addEventListener("click", () => PL.utils.store.set("pl_after_login", "#/invitacion/" + token));
        }
      }
    });
  }, { public: true });

  /* ---------- Bandeja de notificaciones (ambos roles) ---------- */
  PL.router.add("/notificaciones", async () => {
    ui.loading("Notificaciones");
    const items = await http.get("/me/inbox");
    const role = PL.session.user.rol;
    const perm = PL.services.notifications.permission();
    ui.screen({
      title: "Notificaciones",
      back: true,
      tab: role === "veterinario" ? "inicio" : "inicio",
      body: `
        ${perm === "default" ? `<div class="notice info" style="margin-bottom:14px"><span>Activa las notificaciones del navegador para recibir recordatorios.</span><button class="btn sm" id="perm">Activar</button></div>` : ""}
        ${items.length ? items.map(n => `
          <a class="card ${n.leida ? "" : "hl"}" href="${esc(n.link || "#/")}">
            <div class="card-title">${esc(n.titulo)}</div>
            <div class="card-sub">${esc(n.texto)}</div>
            <div class="card-meta">${esc(PL.utils.fmtDateTime(n.creado))}</div>
          </a>`).join("") : ui.empty("No tienes notificaciones.")}`,
      onMount(main) {
        http.post("/me/inbox/read-all").then(() => PL.app.refreshBadge());
        const p = main.querySelector("#perm");
        if (p) p.addEventListener("click", async () => {
          await PL.services.notifications.requestPermission();
          PL.router.resolve();
        });
      }
    });
  }, { allowUnverified: true });
})();
