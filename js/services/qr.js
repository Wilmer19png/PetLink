/* =========================================================
   Servicio externo: CÓDIGOS QR (RF-07, RF-08)
   ---------------------------------------------------------
   QR Server API (https://goqr.me/api) · sin clave
   - create-qr-code: genera la imagen del QR de la mascota
   - read-qr-code: decodifica una foto del QR (veterinario)
   ========================================================= */
PL.services = PL.services || {};

PL.services.qr = (function () {
  /** Enlace que abre PetLink en la pantalla de vincular con el código. */
  function linkFor(code) {
    const base = location.href.split("#")[0];
    return base + "#/vincular?codigo=" + encodeURIComponent(code);
  }

  function imageUrl(code, size) {
    const s = size || 220;
    return PL.config.qr.createUrl + "?size=" + s + "x" + s + "&margin=8&color=1F6F75&data=" + encodeURIComponent(linkFor(code));
  }

  /** Lee un QR desde una imagen (File). Devuelve el código de la mascota. */
  async function read(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(PL.config.qr.readUrl, { method: "POST", body: form });
    if (!res.ok) throw new Error("No se pudo leer el QR (HTTP " + res.status + ")");
    const json = await res.json();
    const symbol = json && json[0] && json[0].symbol && json[0].symbol[0];
    if (!symbol || symbol.error || !symbol.data) throw new Error("No se encontró un código QR en la imagen");
    return extractCode(symbol.data);
  }

  function extractCode(text) {
    const m = String(text).match(/codigo=([A-Z0-9-]+)/i) || String(text).match(/([A-Z]{2,5}-[A-Z0-9]{3}-[A-Z0-9]{3})/i);
    return m ? decodeURIComponent(m[1]).toUpperCase() : String(text).trim().toUpperCase();
  }

  return { linkFor, imageUrl, read, extractCode };
})();
