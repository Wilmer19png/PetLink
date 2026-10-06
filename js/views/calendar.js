/* Calendario de cuidados del dueño (wireframe 8; RF-16, RF-17). */
(function () {
  const U = PL.utils;
  const { esc } = U;
  const ui = PL.ui;
  const http = PL.http;
  const DOW = ["L", "M", "M", "J", "V", "S", "D"];

  PL.router.add("/calendario", async (_, query) => {
    ui.loading("Calendario");
    const dates = await http.get("/calendar");
    const selected = query.fecha || null;
    const base = U.parseDate(query.mes ? query.mes + "-01" : selected || U.today());
    const year = base.getFullYear();
    const month = base.getMonth();
    const monthKey = year + "-" + String(month + 1).padStart(2, "0");
    const prev = U.toISODate(new Date(year, month - 1, 1)).slice(0, 7);
    const next = U.toISODate(new Date(year, month + 1, 1)).slice(0, 7);

    // Celdas del mes (semana inicia el lunes).
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(year, month, 1 - offset + i);
      cells.push(U.toISODate(d));
    }
    const byDay = {};
    dates.forEach(d => (byDay[d.fecha] = byDay[d.fecha] || []).push(d));
    const lastRow = cells.slice(35).every(c => c.slice(0, 7) !== monthKey) ? 35 : 42;

    const dayCell = iso => {
      const list = byDay[iso] || [];
      const cls = ["cal-day"];
      if (iso.slice(0, 7) !== monthKey) cls.push("other");
      if (iso === U.today()) cls.push("today");
      if (list.length) {
        cls.push("has");
        if (list.some(d => d.estado === "vencida")) cls.push("overdue");
        else if (list.every(d => d.estado === "cumplida")) cls.push("done");
      }
      if (iso === selected) cls.push("selected");
      const label = U.fmtDate(iso) + (list.length ? ": " + list.map(d => d.titulo + " de " + d.mascota).join(", ") : "");
      return `<button class="${cls.join(" ")}" data-day="${iso}" aria-label="${esc(label)}">${Number(iso.slice(8))}</button>`;
    };

    const shown = selected ? (byDay[selected] || []) : dates.filter(d => d.estado !== "cumplida");
    const perm = PL.services.notifications.permission();

    ui.screen({
      title: "Calendario",
      right: PL.app.headerActions(),
      tab: "calendario",
      body: `
        <div class="card">
          <div class="cal-head">
            <a class="icon-btn" href="#/calendario?mes=${prev}" aria-label="Mes anterior">‹</a>
            <span>${U.MONTHS_LONG[month]} ${year}</span>
            <a class="icon-btn" href="#/calendario?mes=${next}" aria-label="Mes siguiente">›</a>
          </div>
          <div class="cal-grid">
            ${DOW.map(d => `<div class="dow">${d}</div>`).join("")}
            ${cells.slice(0, lastRow).map(dayCell).join("")}
          </div>
          <div class="legend"><span><i style="background:var(--teal)"></i>Pendiente</span><span><i style="background:var(--red)"></i>Vencida</span><span><i style="background:var(--green)"></i>Cumplida</span></div>
        </div>
        <div class="row spread"><h2 class="section-title">${selected ? esc(U.fmtDate(selected)) : "Próximas fechas"}</h2>${selected ? '<a class="small" href="#/calendario">Ver todas</a>' : ""}</div>
        ${shown.length ? shown.map(d => `
          <a class="card ${d.estado === "vencida" ? "danger" : ""}" href="#/mascotas/${d.mascotaId}/agenda">
            <div class="card-title">${esc(U.fmtDate(d.fecha, false))} · ${esc(d.titulo)}</div>
            <div class="card-sub">${esc(d.mascota)} · ${d.estado === "cumplida" ? "Cumplida ✅" : d.estado === "vencida" ? "Vencida: agenda con tu veterinario" : "Recordatorio " + (perm === "granted" ? "activo" : "en la app")}</div>
          </a>`).join("") : ui.empty(selected ? "No hay cuidados este día." : "No tienes fechas pendientes.")}
        ${perm === "default" ? '<button class="btn block outline" id="perm" style="margin-top:14px">🔔 Activar recordatorios en este dispositivo</button>' : ""}`,
      onMount(main) {
        main.querySelectorAll("[data-day]").forEach(b =>
          b.addEventListener("click", () => (location.hash = "#/calendario?fecha=" + b.dataset.day))
        );
        const p = main.querySelector("#perm");
        if (p) p.addEventListener("click", async () => {
          await PL.services.notifications.requestPermission();
          await PL.services.notifications.checkReminders();
          PL.router.resolve();
        });
      }
    });
  }, { roles: ["dueno"], tab: "calendario" });
})();
