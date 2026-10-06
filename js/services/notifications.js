/* =========================================================
   Servicio externo: NOTIFICACIONES PUSH (RF-17)
   ---------------------------------------------------------
   Usa la Notifications API del navegador (y el service worker
   cuando la app está publicada en https) para recordar vacunas,
   desparasitaciones y controles.

   En producción el documento propone Firebase Cloud Messaging:
   el backend revisaría las fechas y enviaría el push. Aquí la
   revisión se hace al abrir la app y cada N minutos.
   El texto evita datos clínicos en la pantalla de bloqueo (15.1).
   ========================================================= */
PL.services = PL.services || {};

PL.services.notifications = (function () {
  const U = PL.utils;
  let timer = null;

  function supported() {
    return "Notification" in window;
  }
  function permission() {
    return supported() ? Notification.permission : "unsupported";
  }
  async function requestPermission() {
    if (!supported()) return "unsupported";
    if (Notification.permission === "default") return Notification.requestPermission();
    return Notification.permission;
  }

  async function show(title, body, link) {
    if (permission() !== "granted") return false;
    const opts = { body, icon: "assets/icon.svg", badge: "assets/icon.svg", data: { link }, tag: link || title };
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) await reg.showNotification(title, opts);
      else {
        const n = new Notification(title, opts);
        n.onclick = () => { window.focus(); if (link) location.hash = link; };
      }
      return true;
    } catch (e) {
      console.warn("No se pudo mostrar la notificación:", e.message);
      return false;
    }
  }

  /** Revisa el calendario del dueño y envía los recordatorios que correspondan. */
  async function checkReminders() {
    const user = PL.session.user;
    if (!user || user.rol !== "dueno" || !(user.prefs && user.prefs.recordatorios !== false)) return [];
    let dates;
    try {
      dates = await PL.http.get("/calendar");
    } catch (e) {
      return [];
    }
    const sent = [];
    const steps = PL.config.notifications.remindDaysBefore.slice().sort((a, b) => b - a);
    for (const c of dates) {
      if (c.estado === "cumplida") continue;
      const n = U.daysBetween(U.today(), c.fecha);
      let clave = null;
      if (n < 0) clave = "vencida";
      else {
        const step = steps.filter(s => n <= s).pop();
        if (step != null) clave = "d" + step;
      }
      if (!clave || (c.avisos || []).includes(clave)) continue;

      const when = n < 0 ? "tiene un cuidado vencido" : n === 0 ? "tiene un cuidado programado para hoy" : "tiene un cuidado programado " + U.relDays(c.fecha).toLowerCase();
      const title = "Recordatorio de PetLink";
      const body = c.mascota + " " + when + ". Toca para ver el calendario.";
      await show(title, body, "#/calendario?fecha=" + c.fecha);
      await PL.http.post("/care-dates/" + c.id + "/notified", { clave }).catch(() => null);
      sent.push({ c, clave, body });
    }
    if (sent.length && permission() !== "granted") {
      PL.ui.toast(sent.length === 1 ? sent[0].body : "Tienes " + sent.length + " cuidados próximos en tu calendario", 4500);
    }
    return sent;
  }

  function start() {
    stop();
    checkReminders();
    timer = setInterval(checkReminders, PL.config.notifications.checkEveryMinutes * 60000);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { supported, permission, requestPermission, show, checkReminders, start, stop };
})();
