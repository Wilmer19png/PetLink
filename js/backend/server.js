/* =========================================================
   Capa de SERVICIOS · Backend (sección 16)
   ---------------------------------------------------------
   API REST simulada que se ejecuta en el navegador. Recibe
   peticiones (método + ruta + cuerpo + token) y responde JSON,
   igual que lo haría un servidor real. Aquí viven TODAS las
   reglas de negocio y de acceso (decisión 16.2: el dispositivo
   nunca decide quién ve un historial).

   Módulos: autenticación, mascotas e historial, control de
   accesos, calendario y recordatorios, veterinarios y mapa,
   contenido y gamificación, IA y verificación.
   ========================================================= */
PL.server = (function () {
  const U = PL.utils;
  const db = PL.db;
  const routes = [];

  class HttpError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  const fail = (status, message) => { throw new HttpError(status, message); };

  function route(method, pattern, handler, opts) {
    const keys = [];
    const regex = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
    routes.push(Object.assign({ method, regex, keys, handler, auth: true }, opts));
  }

  /* =======================================================
     Helpers de dominio
     ======================================================= */
  function publicUser(u) {
    if (!u) return null;
    const out = { id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol, estado: u.estado, prefs: u.prefs || {}, racha: u.racha || 0 };
    if (u.rol === "veterinario") {
      const vp = db.find("vetProfiles", v => v.userId === u.id);
      out.verificacion = vp ? vp.verificacion : "pendiente";
      out.perfil = vp ? U.clone(vp) : null;
    }
    return out;
  }

  function vetCard(userId) {
    const u = db.byId("users", userId);
    const vp = db.find("vetProfiles", v => v.userId === userId);
    if (!u) return null;
    return {
      id: u.id, nombre: u.nombre, telefono: u.telefono, email: u.email,
      clinica: vp && vp.clinica, zona: vp && vp.zona, servicios: (vp && vp.servicios) || [],
      horario: vp && vp.horario, dias: (vp && vp.dias) || [], domicilio: !!(vp && vp.domicilio),
      lat: vp && vp.lat, lng: vp && vp.lng, verificacion: vp && vp.verificacion
    };
  }

  function isVerifiedVet(user) {
    if (!user || user.rol !== "veterinario") return false;
    const vp = db.find("vetProfiles", v => v.userId === user.id);
    return !!vp && vp.verificacion === "verificado";
  }

  function activeAccess(petId, vetId) {
    return db.find("accesses", a => a.mascotaId === petId && a.veterinarioId === vetId && a.estado === "vigente");
  }

  function isOwner(user, pet) {
    return user && pet && pet.duenoId === user.id;
  }

  // Regla central (RF-09, RNF-01): ¿puede este usuario ver el historial de la mascota?
  function canView(user, pet) {
    if (!user || !pet) return false;
    if (isOwner(user, pet)) return true;
    if (user.rol === "veterinario") return isVerifiedVet(user) && !!activeAccess(pet.id, user.id);
    return false;
  }

  // Solo veterinarios verificados con acceso vigente escriben datos clínicos (RF-10, decisión B).
  function canWriteClinical(user, pet) {
    return user && user.rol === "veterinario" && isVerifiedVet(user) && !!activeAccess(pet.id, user.id);
  }

  function getPetOr404(id) {
    return db.byId("pets", id) || fail(404, "Mascota no encontrada");
  }

  function petSummary(pet, user) {
    const out = U.clone(pet);
    const owner = pet.duenoId ? db.byId("users", pet.duenoId) : null;
    out.dueno = owner ? { id: owner.id, nombre: owner.nombre, telefono: owner.telefono, email: owner.email } : null;
    const creator = db.byId("users", pet.creadaPor);
    out.creadaPorNombre = creator ? creator.nombre : "";
    const records = db.filter("records", r => r.mascotaId === pet.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    out.ultimaConsulta = records[0] ? records[0].fecha : null;
    const next = careDatesFor([pet.id]).filter(c => c.estado !== "cumplida").sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    out.proximaFecha = next || null;
    if (user && user.rol === "veterinario") {
      const acc = db.find("accesses", a => a.mascotaId === pet.id && a.veterinarioId === user.id && a.estado !== "retirado");
      out.miAcceso = acc ? acc.estado : null;
    }
    if (!user || !canView(user, pet)) {
      // Sin acceso: solo datos mínimos de identificación.
      return { id: out.id, nombre: out.nombre, especie: out.especie, raza: out.raza, codigo: out.codigo, estado: out.estado, foto: out.foto, miAcceso: out.miAcceso || null, dueno: out.dueno ? { nombre: out.dueno.nombre } : null };
    }
    return out;
  }

  /* ---------- Calendario y gamificación ---------- */
  function careDatesFor(petIds) {
    const t = U.today();
    return db.filter("careDates", c => petIds.includes(c.mascotaId)).map(c => {
      const out = U.clone(c);
      if (out.estado === "pendiente" && out.fecha < t) out.estado = "vencida";
      return out;
    });
  }

  const ACHIEVEMENTS = {
    primera_mascota: { titulo: "Primer registro", desc: "Tu primera mascota en PetLink", ico: "🐾" },
    a_tiempo_1: { titulo: "Al día", desc: "Cumpliste una fecha de cuidado a tiempo", ico: "⏰" },
    racha_3: { titulo: "Racha de 3", desc: "3 cuidados seguidos a tiempo", ico: "🔥" },
    racha_5: { titulo: "Racha de 5", desc: "5 cuidados seguidos a tiempo", ico: "🏅" },
    racha_10: { titulo: "Imparable", desc: "10 cuidados seguidos a tiempo", ico: "🏆" },
    notas_5: { titulo: "Diario de cuidado", desc: "Escribiste 5 notas de tus mascotas", ico: "📝" },
    comparte_1: { titulo: "Trabajo en equipo", desc: "Autorizaste a un veterinario", ico: "🤝" }
  };

  function grant(ownerId, tipo) {
    if (!ownerId || !ACHIEVEMENTS[tipo]) return null;
    if (db.find("achievements", a => a.duenoId === ownerId && a.tipo === tipo)) return null;
    const a = db.insert("achievements", { duenoId: ownerId, tipo, fecha: U.today() });
    notify(ownerId, "logro", "¡Nuevo logro: " + ACHIEVEMENTS[tipo].titulo + "!", ACHIEVEMENTS[tipo].desc, "#/perfil");
    return a;
  }

  function onCareDone(ownerId, onTime) {
    if (!ownerId) return;
    const owner = db.byId("users", ownerId);
    owner.racha = onTime ? (owner.racha || 0) + 1 : 0;
    db.save();
    if (onTime) {
      grant(ownerId, "a_tiempo_1");
      if (owner.racha >= 3) grant(ownerId, "racha_3");
      if (owner.racha >= 5) grant(ownerId, "racha_5");
      if (owner.racha >= 10) grant(ownerId, "racha_10");
    }
  }

  // Al leer el calendario, las fechas vencidas reinician la racha (una sola vez por fecha).
  function applyOverduePenalty(ownerId, dates) {
    let changed = false;
    dates.forEach(c => {
      if (c.estado === "vencida") {
        const stored = db.byId("careDates", c.id);
        if (!stored.penalizada) {
          stored.penalizada = true;
          changed = true;
        }
      }
    });
    if (changed) {
      const owner = db.byId("users", ownerId);
      if (owner) owner.racha = 0;
      db.save();
    }
  }

  /* ---------- Bandeja de notificaciones y mensajería ---------- */
  function notify(userId, tipo, titulo, texto, link) {
    if (!userId) return;
    db.insert("inbox", { userId, tipo, titulo, texto, link: link || "", leida: false, creado: new Date().toISOString() });
  }

  /* =======================================================
     AUTENTICACIÓN (RF-01, RF-02)
     ======================================================= */
  route("POST", "/auth/register", async ({ body }) => {
    const nombre = (body.nombre || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const rol = body.rol === "veterinario" ? "veterinario" : "dueno";
    if (!nombre) fail(400, "Escribe tu nombre");
    if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, "Escribe un correo válido");
    if (!body.password || body.password.length < 6) fail(400, "La contraseña debe tener al menos 6 caracteres");
    if (db.find("users", u => u.email === email)) fail(409, "Ya existe una cuenta con ese correo");
    if (rol === "veterinario" && !(body.tarjeta || "").trim()) fail(400, "La tarjeta profesional es obligatoria para veterinarios");

    const user = db.insert("users", {
      nombre, email, telefono: (body.telefono || "").replace(/\D/g, ""), rol, estado: "activo",
      passwordHash: await U.sha256(body.password), creado: new Date().toISOString(), prefs: { recordatorios: true }, racha: 0
    });
    if (rol === "veterinario") {
      db.insert("vetProfiles", {
        userId: user.id, tarjeta: body.tarjeta.trim(), verificacion: "pendiente", verificadoEl: null,
        clinica: body.clinica || "", zona: "", servicios: ["Consulta general"], horario: "", dias: [1, 2, 3, 4, 5], domicilio: false, lat: null, lng: null
      });
      const admin = db.find("users", u => u.rol === "admin");
      if (admin) notify(admin.id, "verificacion", "Nueva solicitud de verificación", user.nombre + " · " + body.tarjeta, "#/admin/veterinarios");
    }
    return createSession(user);
  }, { auth: false });

  route("POST", "/auth/login", async ({ body }) => {
    const email = (body.email || "").trim().toLowerCase();
    const user = db.find("users", u => u.email === email);
    if (!user || user.passwordHash !== (await U.sha256(body.password || ""))) fail(401, "Correo o contraseña incorrectos");
    if (user.estado !== "activo") fail(403, "Tu cuenta está suspendida");
    return createSession(user);
  }, { auth: false });

  route("POST", "/auth/logout", ({ token }) => {
    db.remove("sessions", s => s.token === token);
    return { ok: true };
  });

  function createSession(user) {
    const token = U.token(24);
    db.insert("sessions", { token, userId: user.id, creado: new Date().toISOString() });
    return { token, user: publicUser(user) };
  }

  route("GET", "/me", ({ user }) => publicUser(user));

  route("PATCH", "/me", ({ user, body }) => {
    if (body.nombre != null) user.nombre = String(body.nombre).trim() || user.nombre;
    if (body.telefono != null) user.telefono = String(body.telefono).replace(/\D/g, "");
    if (body.prefs) user.prefs = Object.assign({}, user.prefs, body.prefs);
    db.save();
    return publicUser(user);
  });

  route("PATCH", "/me/vet-profile", ({ user, body }) => {
    if (user.rol !== "veterinario") fail(403, "Solo para veterinarios");
    const vp = db.find("vetProfiles", v => v.userId === user.id);
    ["clinica", "zona", "horario"].forEach(k => body[k] != null && (vp[k] = String(body[k]).trim()));
    if (Array.isArray(body.servicios)) vp.servicios = body.servicios.filter(Boolean);
    if (Array.isArray(body.dias)) vp.dias = body.dias.map(Number);
    if (body.domicilio != null) vp.domicilio = !!body.domicilio;
    if (body.lat != null && body.lng != null) { vp.lat = Number(body.lat); vp.lng = Number(body.lng); }
    db.save();
    return publicUser(user);
  });

  /* =======================================================
     MASCOTAS Y TITULARIDAD (RF-04 a RF-07)
     ======================================================= */
  route("GET", "/pets", ({ user }) => {
    let pets = [];
    if (user.rol === "dueno") pets = db.filter("pets", p => p.duenoId === user.id);
    else if (user.rol === "veterinario") {
      const mine = db.filter("accesses", a => a.veterinarioId === user.id && a.estado !== "retirado").map(a => a.mascotaId);
      pets = db.filter("pets", p => mine.includes(p.id));
    }
    return pets.map(p => petSummary(p, user)).sort((a, b) => (b.ultimaConsulta || "").localeCompare(a.ultimaConsulta || ""));
  });

  route("POST", "/pets", ({ user, body }) => {
    if (user.rol === "admin") fail(403, "El administrador no registra mascotas");
    if (user.rol === "veterinario" && !isVerifiedVet(user)) fail(403, "Tu perfil aún no está verificado");
    const nombre = (body.nombre || "").trim();
    if (!nombre) fail(400, "El nombre es obligatorio");
    if (!["perro", "gato", "otro"].includes(body.especie)) fail(400, "Selecciona la especie");
    const pet = db.insert("pets", {
      nombre, especie: body.especie, raza: body.raza || "Criollo / Mestizo", razaKey: body.razaKey || "",
      nacimiento: body.nacimiento || "", sexo: body.sexo || "", peso: body.peso ? Number(String(body.peso).replace(",", ".")) : null,
      codigo: uniqueCode(nombre), foto: body.foto || "",
      estado: user.rol === "dueno" ? "activa" : "pendiente_reclamo",
      duenoId: user.rol === "dueno" ? user.id : null, creadaPor: user.id, creado: new Date().toISOString()
    });
    let invite = null;
    if (user.rol === "veterinario") {
      // El veterinario que crea la mascota queda con acceso vigente.
      db.insert("accesses", { mascotaId: pet.id, veterinarioId: user.id, estado: "vigente", solicitado: U.today(), concedido: U.today(), retirado: null });
      const contacto = (body.duenoContacto || "").trim();
      if (!contacto) fail(400, "Escribe el teléfono o correo del dueño para invitarlo");
      invite = db.insert("invites", {
        token: U.token(12), mascotaId: pet.id, veterinarioId: user.id,
        nombre: (body.duenoNombre || "").trim(), contacto, estado: "pendiente", creado: new Date().toISOString()
      });
      // Si el dueño ya tiene cuenta, le llega la invitación a su bandeja (flujo alterno 12.2).
      const existing = findUserByContact(contacto);
      if (existing) notify(existing.id, "invitacion", user.nombre + " creó el registro de " + pet.nombre, "Acepta la invitación para ser titular", "#/invitacion/" + invite.token);
    } else {
      grant(user.id, "primera_mascota");
    }
    return { pet: petSummary(pet, user), invite };
  });

  function uniqueCode(nombre) {
    let code;
    do code = U.petCode(nombre); while (db.find("pets", p => p.codigo === code));
    return code;
  }

  function findUserByContact(contacto) {
    const c = String(contacto || "").trim().toLowerCase();
    const digits = c.replace(/\D/g, "");
    return db.find("users", u => u.rol === "dueno" && (u.email === c || (digits.length >= 7 && u.telefono && u.telefono.endsWith(digits.slice(-10)))));
  }

  route("GET", "/pets/:id", ({ user, params }) => {
    const pet = getPetOr404(params.id);
    if (!canView(user, pet)) fail(403, "No tienes acceso a esta mascota. Pide al dueño que te autorice.");
    return petSummary(pet, user);
  });

  route("PATCH", "/pets/:id", ({ user, params, body }) => {
    const pet = getPetOr404(params.id);
    if (!isOwner(user, pet) && !canWriteClinical(user, pet)) fail(403, "No puedes modificar esta mascota");
    ["nombre", "raza", "razaKey", "nacimiento", "sexo", "foto"].forEach(k => body[k] != null && (pet[k] = body[k]));
    if (body.peso != null && body.peso !== "") pet.peso = Number(String(body.peso).replace(",", "."));
    db.save();
    return petSummary(pet, user);
  });

  // El veterinario busca una mascota por su código (RF-08).
  route("GET", "/pets/by-code/:code", ({ user, params }) => {
    if (user.rol !== "veterinario") fail(403, "Solo para veterinarios");
    const code = params.code.trim().toUpperCase();
    const pet = db.find("pets", p => p.codigo === code) || fail(404, "No existe una mascota con el código " + code);
    return petSummary(pet, user);
  });

  /* ---------- Invitaciones (RF-05, RF-06) ---------- */
  route("GET", "/invites/:token", ({ params }) => {
    const inv = db.find("invites", i => i.token === params.token) || fail(404, "La invitación no existe o ya no es válida");
    const pet = db.byId("pets", inv.mascotaId);
    const vet = vetCard(inv.veterinarioId);
    return {
      token: inv.token, estado: inv.estado, nombre: inv.nombre, contacto: inv.contacto,
      mascota: { nombre: pet.nombre, especie: pet.especie, raza: pet.raza, foto: pet.foto },
      veterinario: { nombre: vet.nombre, clinica: vet.clinica }
    };
  }, { auth: false });

  route("POST", "/invites/:token/accept", ({ user, params }) => {
    if (user.rol !== "dueno") fail(403, "Ingresa con una cuenta de dueño para aceptar");
    const inv = db.find("invites", i => i.token === params.token) || fail(404, "La invitación no existe");
    if (inv.estado !== "pendiente") fail(409, "Esta invitación ya fue usada");
    const pet = db.byId("pets", inv.mascotaId);
    if (pet.duenoId && pet.duenoId !== user.id) fail(409, "Esta mascota ya tiene titular");
    pet.duenoId = user.id;
    pet.estado = "activa";
    inv.estado = "aceptada";
    inv.aceptadaPor = user.id;
    inv.aceptadaEl = new Date().toISOString();
    db.save();
    grant(user.id, "primera_mascota");
    notify(inv.veterinarioId, "invitacion", user.nombre + " aceptó la invitación", "Ahora es titular de " + pet.nombre, "#/pacientes/" + pet.id);
    return petSummary(pet, user);
  });

  route("GET", "/me/invites", ({ user }) => {
    if (user.rol !== "dueno") return [];
    return db.filter("invites", i => i.estado === "pendiente" && findUserByContact(i.contacto) === user).map(i => {
      const pet = db.byId("pets", i.mascotaId);
      return { token: i.token, mascota: pet.nombre, veterinario: (db.byId("users", i.veterinarioId) || {}).nombre };
    });
  });

  /* =======================================================
     CONTROL DE ACCESO (RF-08, RF-09)
     ======================================================= */
  route("POST", "/access/request", ({ user, body }) => {
    if (!isVerifiedVet(user)) fail(403, "Solo veterinarios verificados pueden vincular mascotas");
    const code = String(body.codigo || "").trim().toUpperCase();
    const pet = db.find("pets", p => p.codigo === code) || fail(404, "No existe una mascota con el código " + code);
    let acc = db.find("accesses", a => a.mascotaId === pet.id && a.veterinarioId === user.id && a.estado !== "retirado");
    if (acc) return { access: acc, pet: petSummary(pet, user) };
    acc = db.insert("accesses", { mascotaId: pet.id, veterinarioId: user.id, estado: "pendiente", solicitado: U.today(), concedido: null, retirado: null });
    notify(pet.duenoId, "acceso", user.nombre + " pide acceso al historial de " + pet.nombre, "Revisa y autoriza desde Accesos", "#/mascotas/" + pet.id + "/accesos");
    return { access: acc, pet: petSummary(pet, user) };
  });

  route("GET", "/pets/:id/access", ({ user, params }) => {
    const pet = getPetOr404(params.id);
    if (!isOwner(user, pet)) fail(403, "Solo el titular gestiona los accesos");
    return db.filter("accesses", a => a.mascotaId === pet.id && a.estado !== "retirado")
      .map(a => Object.assign(U.clone(a), { veterinario: vetCard(a.veterinarioId) }))
      .sort((a, b) => (a.estado === "pendiente" ? -1 : 1) - (b.estado === "pendiente" ? -1 : 1));
  });

  route("POST", "/pets/:id/access/:accessId/approve", ({ user, params }) => {
    const pet = getPetOr404(params.id);
    if (!isOwner(user, pet)) fail(403, "Solo el titular autoriza accesos");
    const acc = db.byId("accesses", params.accessId);
    if (!acc || acc.mascotaId !== pet.id) fail(404, "Solicitud no encontrada");
    acc.estado = "vigente";
    acc.concedido = U.today();
    db.save();
    grant(user.id, "comparte_1");
    notify(acc.veterinarioId, "acceso", user.nombre + " autorizó tu acceso", "Ya puedes ver el historial de " + pet.nombre, "#/pacientes/" + pet.id);
    return acc;
  });

  route("POST", "/pets/:id/access/:accessId/revoke", ({ user, params }) => {
    const pet = getPetOr404(params.id);
    if (!isOwner(user, pet)) fail(403, "Solo el titular retira accesos");
    const acc = db.byId("accesses", params.accessId);
    if (!acc || acc.mascotaId !== pet.id) fail(404, "Acceso no encontrado");
    // Efecto inmediato (HU-10): el servidor deja de entregar el historial.
    acc.estado = "retirado";
    acc.retirado = U.today();
    db.save();
    notify(acc.veterinarioId, "acceso", "Acceso retirado", "Ya no tienes acceso al historial de " + pet.nombre, "#/pacientes");
    return acc;
  });

  /* =======================================================
     HISTORIAL CLÍNICO (RF-10 a RF-13)
     ======================================================= */
  const CLINICAL_FIELDS = ["tipo", "fecha", "motivo", "diagnostico", "tratamiento", "observaciones", "producto", "proximaFecha"];

  function recordOut(r) {
    const out = U.clone(r);
    const vet = db.byId("users", r.veterinarioId);
    out.autor = vet ? vet.nombre : "—";
    const versions = db.filter("recordVersions", v => v.registroId === r.id);
    out.versiones = versions.length;
    if (versions.length) {
      const last = versions[versions.length - 1];
      const editor = db.byId("users", last.autorId);
      out.editadoPor = editor ? editor.nombre : "";
    }
    return out;
  }

  route("GET", "/pets/:id/records", ({ user, params }) => {
    const pet = getPetOr404(params.id);
    if (!canView(user, pet)) fail(403, "No tienes acceso a este historial");
    return db.filter("records", r => r.mascotaId === pet.id)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || "").localeCompare(a.creado || ""))
      .map(recordOut);
  });

  route("POST", "/pets/:id/records", ({ user, params, body }) => {
    const pet = getPetOr404(params.id);
    if (!canWriteClinical(user, pet)) fail(403, "Solo un veterinario verificado con acceso vigente puede registrar datos clínicos");
    if (!["consulta", "vacuna", "desparasitacion"].includes(body.tipo)) fail(400, "Tipo de registro inválido");
    if (!body.fecha) fail(400, "La fecha es obligatoria");
    if (body.tipo === "consulta" && !(body.motivo || "").trim()) fail(400, "Escribe el motivo de la consulta");
    if (body.tipo !== "consulta" && !(body.producto || "").trim()) fail(400, "Escribe el producto o vacuna aplicada");
    if (body.proximaFecha && body.proximaFecha <= body.fecha) fail(400, "La próxima fecha debe ser posterior a la fecha del registro");

    const rec = { mascotaId: pet.id, veterinarioId: user.id, creado: new Date().toISOString(), actualizado: null, version: 1 };
    CLINICAL_FIELDS.forEach(k => (rec[k] = (body[k] || "").toString().trim()));
    const saved = db.insert("records", rec);
    if (body.clientId) saved.clientId = body.clientId;

    // 1) ¿Este registro cumple una fecha de cuidado pendiente? (gamificación, RF-20)
    const careTipo = saved.tipo === "consulta" ? "control" : saved.tipo;
    const pending = db.filter("careDates", c =>
      c.mascotaId === pet.id && c.tipo === careTipo && c.estado === "pendiente" &&
      U.daysBetween(saved.fecha, c.fecha) <= 30 &&
      (!c.producto || !saved.producto || c.producto.toLowerCase() === saved.producto.toLowerCase())
    );
    pending.forEach(c => {
      c.estado = "cumplida";
      c.cumplidaEl = saved.fecha;
      c.cumplidaCon = saved.id;
      onCareDone(pet.duenoId, saved.fecha <= U.addDays(c.fecha, 7));
    });

    // 2) Si trae próxima fecha, se genera una nueva fecha de cuidado (RF-16).
    if (saved.proximaFecha) createCareDate(saved);

    db.save();
    if (pet.duenoId) notify(pet.duenoId, "registro", "Nuevo registro en el historial de " + pet.nombre, (PL.ui.TYPE_LABEL[saved.tipo] || "") + " · " + user.nombre, "#/mascotas/" + pet.id);
    return recordOut(saved);
  });

  function createCareDate(r) {
    return db.insert("careDates", {
      mascotaId: r.mascotaId, registroId: r.id,
      tipo: r.tipo === "consulta" ? "control" : r.tipo,
      titulo: r.tipo === "vacuna" ? "Vacuna " + (r.producto || "").toLowerCase() : r.tipo === "desparasitacion" ? "Desparasitación" : "Control",
      producto: r.producto || "", fecha: r.proximaFecha, estado: "pendiente", cumplidaEl: null, avisos: []
    });
  }

  // Modificar un registro conserva la versión anterior (RF-13, RNF-04).
  route("PATCH", "/records/:id", ({ user, params, body }) => {
    const rec = db.byId("records", params.id) || fail(404, "Registro no encontrado");
    const pet = getPetOr404(rec.mascotaId);
    if (!canWriteClinical(user, pet)) fail(403, "No puedes modificar este registro");
    if (body.baseVersion && Number(body.baseVersion) !== rec.version) {
      // Otro veterinario lo modificó antes: no se sobrescribe en silencio.
      fail(409, "Este registro fue modificado por otra persona. Recarga para ver la última versión.");
    }
    const previous = {};
    CLINICAL_FIELDS.forEach(k => (previous[k] = rec[k]));
    db.insert("recordVersions", { registroId: rec.id, autorId: user.id, fecha: new Date().toISOString(), version: rec.version, contenidoAnterior: previous, autorAnteriorId: rec.ultimoEditor || rec.veterinarioId });
    CLINICAL_FIELDS.filter(k => k !== "tipo").forEach(k => body[k] != null && (rec[k] = String(body[k]).trim()));
    rec.version += 1;
    rec.actualizado = new Date().toISOString();
    rec.ultimoEditor = user.id;
    // Mantiene sincronizada la fecha de cuidado que generó este registro.
    const cd = db.find("careDates", c => c.registroId === rec.id);
    if (cd && cd.estado === "pendiente") {
      if (rec.proximaFecha) cd.fecha = rec.proximaFecha;
      else db.remove("careDates", c => c.id === cd.id);
    } else if (!cd && rec.proximaFecha) createCareDate(rec);
    db.save();
    return recordOut(rec);
  });

  route("GET", "/records/:id/versions", ({ user, params }) => {
    const rec = db.byId("records", params.id) || fail(404, "Registro no encontrado");
    const pet = getPetOr404(rec.mascotaId);
    if (!canView(user, pet)) fail(403, "No tienes acceso a este historial");
    return db.filter("recordVersions", v => v.registroId === rec.id).reverse().map(v => {
      const editor = db.byId("users", v.autorId);
      return Object.assign(U.clone(v), { editor: editor ? editor.nombre : "—" });
    });
  });

  /* =======================================================
     NOTAS DEL DUEÑO (RF-14)
     ======================================================= */
  route("GET", "/pets/:id/notes", ({ user, params }) => {
    const pet = getPetOr404(params.id);
    if (!canView(user, pet)) fail(403, "No tienes acceso a esta mascota");
    return db.filter("notes", n => n.mascotaId === pet.id).sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado));
  });

  route("POST", "/pets/:id/notes", ({ user, params, body }) => {
    const pet = getPetOr404(params.id);
    if (!isOwner(user, pet)) fail(403, "Solo el dueño puede escribir notas");
    const texto = (body.texto || "").trim();
    const peso = body.peso ? Number(String(body.peso).replace(",", ".")) : null;
    if (!texto && !peso) fail(400, "Escribe una nota o registra el peso");
    if (peso != null && (isNaN(peso) || peso <= 0 || peso > 150)) fail(400, "Peso no válido");
    const note = db.insert("notes", { mascotaId: pet.id, duenoId: user.id, texto, peso, fecha: body.fecha || U.today(), creado: new Date().toISOString() });
    if (db.filter("notes", n => n.duenoId === user.id).length >= 5) grant(user.id, "notas_5");
    return note;
  });

  /* =======================================================
     CALENDARIO Y RECORDATORIOS (RF-16, RF-17)
     ======================================================= */
  route("GET", "/calendar", ({ user, query }) => {
    let pets;
    if (user.rol === "dueno") pets = db.filter("pets", p => p.duenoId === user.id);
    else if (user.rol === "veterinario") pets = db.filter("pets", p => canView(user, p));
    else pets = [];
    if (query.petId) pets = pets.filter(p => p.id === query.petId);
    const ids = pets.map(p => p.id);
    const dates = careDatesFor(ids).map(c => Object.assign(c, { mascota: (pets.find(p => p.id === c.mascotaId) || {}).nombre }));
    if (user.rol === "dueno") applyOverduePenalty(user.id, dates);
    return dates.sort((a, b) => a.fecha.localeCompare(b.fecha));
  });

  // Marca que ya se envió un aviso de una fecha (para no repetirlo).
  route("POST", "/care-dates/:id/notified", ({ user, params, body }) => {
    const c = db.byId("careDates", params.id) || fail(404, "Fecha no encontrada");
    const pet = getPetOr404(c.mascotaId);
    if (!isOwner(user, pet)) fail(403, "Sin permiso");
    c.avisos = c.avisos || [];
    if (!c.avisos.includes(body.clave)) c.avisos.push(body.clave);
    db.save();
    return { ok: true };
  });

  /* =======================================================
     GAMIFICACIÓN (RF-20)
     ======================================================= */
  route("GET", "/me/achievements", ({ user }) => {
    const got = db.filter("achievements", a => a.duenoId === user.id);
    return {
      racha: user.racha || 0,
      logros: Object.entries(ACHIEVEMENTS).map(([tipo, def]) => {
        const g = got.find(a => a.tipo === tipo);
        return Object.assign({ tipo, obtenido: !!g, fecha: g ? g.fecha : null }, def);
      })
    };
  });

  /* =======================================================
     VETERINARIOS Y MAPA (RF-21 a RF-23)
     ======================================================= */
  route("GET", "/vets", () =>
    db.filter("vetProfiles", v => v.verificacion === "verificado" && v.lat != null).map(v => vetCard(v.userId))
  );
  route("GET", "/vets/:id", ({ params }) => {
    const card = vetCard(params.id);
    if (!card || card.verificacion !== "verificado") fail(404, "Veterinario no encontrado");
    return card;
  });

  /* =======================================================
     CONTENIDO EDUCATIVO E IA (RF-18, RF-19, RF-29)
     ======================================================= */
  route("GET", "/content", ({ user, query }) => {
    let items = db.filter("content", c => user.rol === "admin" || c.estado === "publicado");
    if (query.especie) items = items.filter(c => c.especie === query.especie || c.especie === "todas");
    if (query.etapa) items = items.filter(c => c.etapa === query.etapa || c.etapa === "todas");
    return items;
  });
  route("GET", "/content/:id", ({ params }) => db.byId("content", params.id) || fail(404, "Contenido no encontrado"));

  // El backend orquesta el servicio externo de IA y guarda el resultado (sección 15.1).
  route("GET", "/breed-profile", async ({ query }) => {
    const especie = query.especie || "perro";
    const raza = (query.raza || "").trim() || "Criollo / Mestizo";
    const key = (especie + "|" + raza).toLowerCase();
    const cached = db.find("breedProfiles", b => b.key === key);
    if (cached && !query.refresh) return cached;
    const generated = await PL.services.ai.breedProfile({ especie, raza, razaKey: query.razaKey || "" });
    if (cached) db.remove("breedProfiles", b => b.key === key);
    return db.insert("breedProfiles", Object.assign({ key, especie, raza, generado: new Date().toISOString() }, generated));
  });

  /* =======================================================
     BANDEJA DE NOTIFICACIONES
     ======================================================= */
  route("GET", "/me/inbox", ({ user }) =>
    db.filter("inbox", n => n.userId === user.id).sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, 50)
  );
  route("POST", "/me/inbox/read-all", ({ user }) => {
    db.filter("inbox", n => n.userId === user.id).forEach(n => (n.leida = true));
    db.save();
    return { ok: true };
  });

  // Registro de mensajes enviados por el servicio de correo/SMS (para la demo).
  route("POST", "/outbox", ({ user, body }) => db.insert("outbox", { de: user.id, canal: body.canal, para: body.para, asunto: body.asunto, texto: body.texto, enviado: new Date().toISOString() }));

  /* =======================================================
     PANEL DEL ADMINISTRADOR (RF-02, RF-29, HU-02, HU-25)
     ======================================================= */
  function requireAdmin(user) {
    if (!user || user.rol !== "admin") fail(403, "Solo el administrador");
  }

  route("GET", "/admin/stats", ({ user }) => {
    requireAdmin(user);
    const vps = db.table("vetProfiles");
    return {
      duenos: db.filter("users", u => u.rol === "dueno").length,
      veterinarios: vps.filter(v => v.verificacion === "verificado").length,
      pendientes: vps.filter(v => v.verificacion === "pendiente").length,
      mascotas: db.table("pets").length,
      registros: db.table("records").length,
      accesos: db.filter("accesses", a => a.estado === "vigente").length,
      contenido: db.filter("content", c => c.estado === "publicado").length,
      perfilesRaza: db.table("breedProfiles").length
    };
  });

  route("GET", "/admin/vets", ({ user }) => {
    requireAdmin(user);
    return db.table("vetProfiles").map(v => Object.assign(vetCard(v.userId), { tarjeta: v.tarjeta, verificadoEl: v.verificadoEl, motivoRechazo: v.motivoRechazo || "" }));
  });

  route("POST", "/admin/vets/:id/verify", ({ user, params, body }) => {
    requireAdmin(user);
    const vp = db.find("vetProfiles", v => v.userId === params.id) || fail(404, "Veterinario no encontrado");
    const ok = body.decision === "aprobar";
    vp.verificacion = ok ? "verificado" : "rechazado";
    vp.verificadoEl = new Date().toISOString();
    vp.motivoRechazo = ok ? "" : body.motivo || "Datos profesionales no válidos";
    db.save();
    notify(vp.userId, "verificacion", ok ? "¡Tu perfil fue verificado!" : "Tu verificación fue rechazada", ok ? "Ya puedes usar las funciones clínicas" : vp.motivoRechazo, "#/vet/perfil");
    return vp;
  });

  route("POST", "/admin/content", ({ user, body }) => {
    requireAdmin(user);
    if (!(body.titulo || "").trim() || !(body.texto || "").trim()) fail(400, "Título y texto son obligatorios");
    return db.insert("content", {
      titulo: body.titulo.trim(), tema: body.tema || "General", especie: body.especie || "todas", etapa: body.etapa || "todas",
      texto: body.texto.trim(), estado: "publicado", autorId: user.id, actualizado: new Date().toISOString()
    });
  });

  route("PATCH", "/admin/content/:id", ({ user, params, body }) => {
    requireAdmin(user);
    const c = db.byId("content", params.id) || fail(404, "Contenido no encontrado");
    ["titulo", "tema", "especie", "etapa", "texto", "estado"].forEach(k => body[k] != null && (c[k] = body[k]));
    c.actualizado = new Date().toISOString();
    db.save();
    return c;
  });

  route("GET", "/admin/outbox", ({ user }) => {
    requireAdmin(user);
    return db.table("outbox").slice().reverse();
  });

  /* =======================================================
     Despachador de peticiones
     ======================================================= */
  async function handle(method, path, body, token) {
    const [pathname, qs] = path.split("?");
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.regex);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      let user = null;
      if (token) {
        const s = db.find("sessions", x => x.token === token);
        user = s ? db.byId("users", s.userId) : null;
      }
      if (r.auth && !user) fail(401, "Tu sesión expiró. Inicia sesión de nuevo.");
      const result = await r.handler({ user, params, query, body: body || {}, token });
      return U.clone(result);
    }
    fail(404, "Ruta no encontrada: " + method + " " + pathname);
  }

  return { handle, HttpError, ACHIEVEMENTS };
})();
