/* =========================================================
   Servicio externo: CORREO O SMS (RF-05)
   ---------------------------------------------------------
   Envía la invitación al dueño cuando el veterinario crea el
   registro de su mascota. Sin un proveedor transaccional
   configurado, abre WhatsApp (wa.me) o el cliente de correo
   (mailto:) con el mensaje listo, y deja constancia en la
   bandeja de salida del backend.
   ========================================================= */
PL.services = PL.services || {};

PL.services.messaging = (function () {
  function inviteLink(token) {
    return location.href.split("#")[0] + "#/invitacion/" + encodeURIComponent(token);
  }

  function inviteText(invite, petName, vetName) {
    const hola = invite.nombre ? "Hola " + invite.nombre.split(" ")[0] + ", " : "Hola, ";
    return hola + vetName + " creó el registro de salud de " + petName + " en PetLink. " +
      "Acepta la invitación para ver su historial, recibir recordatorios de vacunas y decidir qué veterinarios pueden verlo: " +
      inviteLink(invite.token);
  }

  function isEmail(contact) {
    return /@/.test(contact || "");
  }

  function whatsappUrl(phone, text) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.length === 10) digits = "57" + digits; // número celular de Colombia
    return "https://wa.me/" + digits + "?text=" + encodeURIComponent(text);
  }

  function smsUrl(phone, text) {
    return "sms:" + String(phone || "").replace(/[^\d+]/g, "") + "?body=" + encodeURIComponent(text);
  }

  function mailtoUrl(email, subject, text) {
    return "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text);
  }

  /** Opciones de envío para una invitación. */
  function inviteChannels(invite, petName, vetName) {
    const text = inviteText(invite, petName, vetName);
    const subject = "Invitación a PetLink: historial de " + petName;
    const list = [];
    if (isEmail(invite.contacto)) {
      list.push({ canal: "correo", label: "Enviar por correo", url: mailtoUrl(invite.contacto, subject, text) });
    } else {
      list.push({ canal: "whatsapp", label: "Enviar por WhatsApp", url: whatsappUrl(invite.contacto, text) });
      list.push({ canal: "sms", label: "Enviar por SMS", url: smsUrl(invite.contacto, text) });
    }
    return { text, subject, link: inviteLink(invite.token), channels: list };
  }

  function logSent(canal, para, asunto, texto) {
    return PL.http.post("/outbox", { canal, para, asunto, texto }).catch(() => null);
  }

  return { inviteLink, inviteText, inviteChannels, whatsappUrl, mailtoUrl, logSent, isEmail };
})();
