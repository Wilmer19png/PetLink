/* =========================================================
   Capa de DATOS (sección 16: "Base de datos remota")
   ---------------------------------------------------------
   Simula la base de datos del servidor con tablas guardadas en
   localStorage. Solo el backend (server.js) la usa; las pantallas
   nunca la leen directamente, siempre pasan por la API.
   Tablas según el modelo de datos conceptual (figura 5).
   ========================================================= */
PL.db = (function () {
  const KEY = () => PL.config.dbKey || "petlink_db_v1";
  const TABLES = [
    "users", "sessions", "vetProfiles", "pets", "invites", "accesses",
    "records", "recordVersions", "notes", "careDates", "achievements",
    "content", "breedProfiles", "inbox", "outbox"
  ];
  let data = null;

  function load() {
    data = PL.utils.store.get(KEY(), null);
    if (!data || !data.users) {
      data = {};
      TABLES.forEach(t => (data[t] = []));
      data.meta = { seeded: false, created: new Date().toISOString() };
    }
    TABLES.forEach(t => (data[t] = data[t] || []));
    return data;
  }

  function save() {
    PL.utils.store.set(KEY(), data);
  }

  function table(name) {
    if (!data) load();
    if (!data[name]) throw new Error("Tabla desconocida: " + name);
    return data[name];
  }

  function insert(name, row) {
    const rec = Object.assign({ id: PL.utils.uid(name.slice(0, 3)) }, row);
    table(name).push(rec);
    save();
    return rec;
  }

  function update(name, id, changes) {
    const rec = table(name).find(r => r.id === id);
    if (!rec) return null;
    Object.assign(rec, changes);
    save();
    return rec;
  }

  function remove(name, predicate) {
    const t = table(name);
    for (let i = t.length - 1; i >= 0; i--) if (predicate(t[i])) t.splice(i, 1);
    save();
  }

  const find = (name, predicate) => table(name).find(predicate);
  const filter = (name, predicate) => table(name).filter(predicate);
  const byId = (name, id) => table(name).find(r => r.id === id);

  function meta() {
    if (!data) load();
    return data.meta;
  }

  function reset() {
    PL.utils.store.remove(KEY());
    data = null;
    load();
  }

  return { load, save, table, insert, update, remove, find, filter, byId, meta, reset, TABLES };
})();
