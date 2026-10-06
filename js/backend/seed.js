/* =========================================================
   Datos de demostración
   ---------------------------------------------------------
   Recrean el caso del wireframe: la Dra. Ana Gómez crea a Luna,
   Camila es la titular, el Dr. Luis Mora continúa el caso, etc.
   Las fechas se calculan desde HOY para que el calendario y los
   recordatorios siempre tengan algo que mostrar.
   ========================================================= */
PL.seed = (function () {
  const U = PL.utils;

  async function run() {
    const db = PL.db;
    const meta = db.meta();
    if (meta.seeded) return;

    const t = U.today();
    const d = n => U.addDays(t, n);
    const now = new Date().toISOString();
    const loc = PL.config.defaultLocation;

    const pass = {
      admin: await U.sha256("admin123"),
      vet: await U.sha256("vet123"),
      dueno: await U.sha256("dueno123")
    };

    /* ---------- Usuarios ---------- */
    const users = [
      { id: "u_admin", nombre: "Administrador PetLink", email: "admin@petlink.co", telefono: "", rol: "admin", passwordHash: pass.admin },
      { id: "u_ana", nombre: "Dra. Ana Gómez", email: "ana@petlink.co", telefono: "3001112233", rol: "veterinario", passwordHash: pass.vet },
      { id: "u_luis", nombre: "Dr. Luis Mora", email: "luis@petlink.co", telefono: "3004445566", rol: "veterinario", passwordHash: pass.vet },
      { id: "u_sofia", nombre: "Dra. Sofía Restrepo", email: "sofia@petlink.co", telefono: "3007778899", rol: "veterinario", passwordHash: pass.vet },
      { id: "u_andres", nombre: "Dr. Andrés Pérez", email: "andres@petlink.co", telefono: "3012223344", rol: "veterinario", passwordHash: pass.vet },
      { id: "u_camila", nombre: "Camila Ríos", email: "camila@petlink.co", telefono: "3000000000", rol: "dueno", passwordHash: pass.dueno, racha: 3 },
      { id: "u_laura", nombre: "Laura Cano", email: "laura@petlink.co", telefono: "3105556677", rol: "dueno", passwordHash: pass.dueno, racha: 0 }
    ];
    users.forEach(u => db.insert("users", Object.assign({ estado: "activo", creado: now, prefs: { recordatorios: true } }, u)));

    /* ---------- Perfiles de veterinario ---------- */
    const vet = (userId, extra) =>
      db.insert("vetProfiles", Object.assign({ userId, verificacion: "verificado", verificadoEl: now, servicios: [], domicilio: false }, extra));
    vet("u_ana", {
      tarjeta: "MV-10234", clinica: "Veterinaria Amigos Peludos", zona: "Laureles",
      servicios: ["Consulta general", "Vacunación", "Desparasitación", "Atención a domicilio"],
      horario: "Lun a Sáb · 8:00 a 18:00", dias: [1, 2, 3, 4, 5, 6], domicilio: true,
      lat: loc.lat + 0.006, lng: loc.lng - 0.009
    });
    vet("u_luis", {
      tarjeta: "MV-20871", clinica: "Clínica VetCentro", zona: "Centro",
      servicios: ["Consulta general", "Dermatología", "Cirugía menor"],
      horario: "Lun a Vie · 9:00 a 17:00", dias: [1, 2, 3, 4, 5], domicilio: false,
      lat: loc.lat + 0.012, lng: loc.lng + 0.006
    });
    vet("u_sofia", {
      tarjeta: "MV-31555", clinica: "Atención independiente", zona: "El Poblado y Envigado",
      servicios: ["Atención a domicilio", "Vacunación", "Gatos"],
      horario: "Todos los días · 7:00 a 20:00", dias: [0, 1, 2, 3, 4, 5, 6], domicilio: true,
      lat: loc.lat - 0.02, lng: loc.lng + 0.012
    });
    vet("u_andres", {
      tarjeta: "MV-55821", clinica: "Consultorio San Juan", zona: "Belén",
      servicios: ["Consulta general"], horario: "Lun a Vie · 8:00 a 16:00", dias: [1, 2, 3, 4, 5],
      verificacion: "pendiente", verificadoEl: null, lat: loc.lat - 0.01, lng: loc.lng - 0.015
    });

    /* ---------- Mascotas ---------- */
    const pet = row => db.insert("pets", Object.assign({ creado: now, foto: "" }, row));
    pet({ id: "p_luna", nombre: "Luna", especie: "perro", raza: "Labrador", razaKey: "labrador", nacimiento: "2021-05", sexo: "hembra", peso: 28, codigo: "LUNA-7K2-QX9", estado: "activa", duenoId: "u_camila", creadaPor: "u_ana" });
    pet({ id: "p_milo", nombre: "Milo", especie: "gato", raza: "Criollo / Mestizo", razaKey: "", nacimiento: "2023-02", sexo: "macho", peso: 4.2, codigo: "MILO-9PD-2RA", estado: "activa", duenoId: "u_camila", creadaPor: "u_camila" });
    pet({ id: "p_rocky", nombre: "Rocky", especie: "perro", raza: "Bulldog English", razaKey: "bulldog/english", nacimiento: "2024-08", sexo: "macho", peso: 18, codigo: "ROCKY-H4T-8MZ", estado: "pendiente_reclamo", duenoId: null, creadaPor: "u_ana" });
    pet({ id: "p_nala", nombre: "Nala", especie: "gato", raza: "Siamese", razaKey: "Siamese", nacimiento: "2020-11", sexo: "hembra", peso: 3.8, codigo: "NALA-5WX-K7C", estado: "activa", duenoId: "u_laura", creadaPor: "u_ana" });
    pet({ id: "p_max", nombre: "Max", especie: "perro", raza: "Beagle", razaKey: "beagle", nacimiento: "2019-03", sexo: "macho", peso: 12.5, codigo: "MAX-3QJ-6VN", estado: "activa", duenoId: "u_laura", creadaPor: "u_laura" });

    db.insert("invites", { id: "i_rocky", token: "rocky-demo-invite", mascotaId: "p_rocky", veterinarioId: "u_ana", nombre: "Mateo Gil", contacto: "mateo@correo.com", estado: "pendiente", creado: now });

    /* ---------- Accesos ---------- */
    const access = (mascotaId, veterinarioId, estado, extra) =>
      db.insert("accesses", Object.assign({ mascotaId, veterinarioId, estado, solicitado: d(-200), concedido: estado === "vigente" ? d(-200) : null, retirado: null }, extra));
    access("p_luna", "u_ana", "vigente");
    access("p_luna", "u_luis", "vigente", { concedido: d(-420) });
    access("p_milo", "u_ana", "vigente", { concedido: d(-90) });
    access("p_rocky", "u_ana", "vigente");
    access("p_nala", "u_ana", "vigente");
    access("p_max", "u_luis", "pendiente", { solicitado: d(-1), concedido: null });

    /* ---------- Registros clínicos ---------- */
    const rec = row => {
      const r = db.insert("records", Object.assign({ creado: now, actualizado: null, version: 1, observaciones: "", producto: "", proximaFecha: "" }, row));
      if (r.proximaFecha) {
        db.insert("careDates", {
          mascotaId: r.mascotaId, registroId: r.id,
          tipo: r.tipo === "consulta" ? "control" : r.tipo,
          titulo: r.tipo === "vacuna" ? "Vacuna " + r.producto.toLowerCase() : r.tipo === "desparasitacion" ? "Desparasitación" : "Control",
          producto: r.producto, fecha: r.proximaFecha, estado: "pendiente", cumplidaEl: null, avisos: []
        });
      }
      return r;
    };
    rec({ mascotaId: "p_luna", veterinarioId: "u_luis", tipo: "consulta", fecha: d(-400), motivo: "Rascado constante", diagnostico: "Dermatitis leve", tratamiento: "Champú medicado y antihistamínico por 7 días" });
    rec({ mascotaId: "p_luna", veterinarioId: "u_luis", tipo: "desparasitacion", fecha: d(-320), motivo: "Desparasitación de rutina", producto: "Antiparasitario interno", tratamiento: "Dosis única según peso" });
    rec({ mascotaId: "p_luna", veterinarioId: "u_ana", tipo: "consulta", fecha: d(-208), motivo: "Control general", diagnostico: "Sin hallazgos", tratamiento: "—", proximaFecha: d(40) });
    rec({ mascotaId: "p_luna", veterinarioId: "u_ana", tipo: "vacuna", fecha: d(-208), motivo: "Refuerzo anual", producto: "Antirrábica", proximaFecha: d(4) });
    rec({ mascotaId: "p_milo", veterinarioId: "u_ana", tipo: "vacuna", fecha: d(-300), motivo: "Esquema anual", producto: "Triple felina", proximaFecha: d(65) });
    rec({ mascotaId: "p_milo", veterinarioId: "u_ana", tipo: "desparasitacion", fecha: d(-70), motivo: "Desparasitación trimestral", producto: "Antiparasitario interno", proximaFecha: d(21) });
    rec({ mascotaId: "p_rocky", veterinarioId: "u_ana", tipo: "consulta", fecha: d(-2), motivo: "Primera consulta a domicilio", diagnostico: "Cachorro sano", tratamiento: "Iniciar plan de vacunación", proximaFecha: d(12) });
    rec({ mascotaId: "p_nala", veterinarioId: "u_ana", tipo: "vacuna", fecha: d(-368), motivo: "Esquema anual", producto: "Triple felina", proximaFecha: d(-3) });

    /* ---------- Notas del dueño ---------- */
    db.insert("notes", { mascotaId: "p_luna", duenoId: "u_camila", texto: "Estornudó varias veces hoy", peso: 28.5, fecha: d(-3), creado: now });
    db.insert("notes", { mascotaId: "p_luna", duenoId: "u_camila", texto: "Comió menos de lo normal en la mañana", peso: null, fecha: d(-30), creado: now });

    /* ---------- Logros ---------- */
    db.insert("achievements", { duenoId: "u_camila", tipo: "primera_mascota", fecha: d(-200) });
    db.insert("achievements", { duenoId: "u_camila", tipo: "a_tiempo_1", fecha: d(-208) });
    db.insert("achievements", { duenoId: "u_camila", tipo: "racha_3", fecha: d(-70) });
    db.insert("achievements", { duenoId: "u_laura", tipo: "primera_mascota", fecha: d(-400) });

    /* ---------- Contenido educativo (lo administra el admin, HU-25) ---------- */
    const content = [
      ["Calendario de vacunas del cachorro", "Vacunación", "perro", "cachorro", "Entre las 6 y 16 semanas el cachorro recibe varias dosis de la vacuna múltiple (parvovirus, moquillo, hepatitis) y, desde los 3 meses, la antirrábica. Hasta completar el esquema evita parques y lugares con perros de origen desconocido. Pide a tu veterinario que registre cada dosis en PetLink para recibir los recordatorios."],
      ["¿Cada cuánto desparasitar a mi perro?", "Prevención", "perro", "adulto", "En perros adultos se recomienda desparasitación interna cada 3 a 6 meses, según el estilo de vida (contacto con otros perros, salidas al campo). La externa (pulgas y garrapatas) depende del producto: algunos duran un mes y otros hasta tres. Tu veterinario define el esquema ideal."],
      ["Señales de alerta en perros mayores", "Salud", "perro", "senior", "A partir de los 8 años conviene hacer chequeos cada 6 meses. Consulta si notas que toma mucha más agua, orina más, pierde peso, le cuesta levantarse o se desorienta. Detectar a tiempo problemas renales, articulares o cardiacos mejora mucho su calidad de vida."],
      ["Primeros días de un gatito en casa", "Cuidados", "gato", "cachorro", "Prepara un espacio tranquilo con arenero, agua, comida y un escondite. La vacuna triple felina se aplica desde las 8 semanas con refuerzos. Desparasítalo según indique tu veterinario y empieza a acostumbrarlo al transportador con premios."],
      ["Hidratación en gatos", "Nutrición", "gato", "adulto", "Muchos gatos beben poca agua, lo que favorece problemas urinarios. Ofrece varias fuentes de agua lejos de la comida, considera una fuente con movimiento y combina alimento húmedo con el seco."],
      ["El gato senior", "Salud", "gato", "senior", "Desde los 10 años los gatos pueden desarrollar enfermedad renal, hipertiroidismo o artrosis. Facilita el acceso al arenero y a sus lugares favoritos, y programa controles con análisis de sangre al menos una vez al año."],
      ["Cómo leer el historial de tu mascota", "PetLink", "todas", "todas", "Cada registro del historial muestra quién lo hizo y cuándo. Las vacunas y desparasitaciones con próxima fecha generan automáticamente tu calendario de cuidados. Si un veterinario modifica un registro, PetLink conserva la versión anterior."],
      ["Golpe de calor: cómo prevenirlo", "Prevención", "todas", "todas", "Nunca dejes a tu mascota dentro de un carro. En días calurosos pasea temprano o al final de la tarde, lleva agua y busca sombra. Jadeo excesivo, encías muy rojas o debilidad son señales de alerta: consulta de inmediato."]
    ];
    content.forEach(([titulo, tema, especie, etapa, texto]) =>
      db.insert("content", { titulo, tema, especie, etapa, texto, estado: "publicado", autorId: "u_admin", actualizado: now })
    );

    meta.seeded = true;
    meta.seededOn = t;
    db.save();
  }

  return { run };
})();
