# PetLink

**Historial de salud compartido entre veterinarios y dueños de mascotas.**

El historial pertenece a la mascota y a su dueño, quien decide qué veterinarios pueden verlo.
Así el caso continúa aunque la mascota cambie de consultorio, requiera un traslado o una segunda opinión.

Proyecto del curso **Proceso Apps** · Universidad Cooperativa de Colombia · Wilmer Alejandro Buriticá.

- **App publicada:** https://wilmer19png.github.io/PetLink/
- **Documento de planeación (Momento 1):** [`docs/PetLink_Entrega_Momento1.docx`](docs/PetLink_Entrega_Momento1.docx)
- **Pruebas del flujo MVP:** https://wilmer19png.github.io/PetLink/tests/flujo-mvp.html

---

## Cómo probarla

Abre la app y entra con uno de los usuarios de prueba (también aparecen en la pantalla de inicio de sesión):

| Rol | Correo | Contraseña |
|---|---|---|
| Dueña (Camila, titular de Luna y Milo) | `camila@petlink.co` | `dueno123` |
| Dueña (Laura, tiene una solicitud de acceso pendiente) | `laura@petlink.co` | `dueno123` |
| Veterinaria verificada (Dra. Ana Gómez) | `ana@petlink.co` | `vet123` |
| Veterinario verificado (Dr. Luis Mora) | `luis@petlink.co` | `vet123` |
| Veterinario **sin verificar** | `andres@petlink.co` | `vet123` |
| Administrador (panel web) | `admin@petlink.co` | `admin123` |

**Recorrido sugerido (flujo mínimo del MVP, sección 9.5):**

1. Entra como **Dra. Ana** → *Pacientes* → *Crear mascota*. Elige especie y raza (se cargan de la API), escribe los datos del dueño y pulsa *Crear e invitar al dueño*. Se abre el mensaje listo para WhatsApp, SMS o correo.
2. Copia el enlace de invitación, cierra sesión y ábrelo: crea la cuenta del dueño y pulsa *Aceptar y ser titular*.
3. Vuelve como **Dra. Ana** → abre la mascota → *+ Nueva consulta* → registra una *Vacuna* con próxima dosis.
4. Como **dueño**: la mascota aparece en *Inicio* y en *Calendario* con su recordatorio.
5. En la ficha → *Accesos* aparece el código y el QR. Como **Dr. Luis** → *Vincular código* → escribe ese código.
6. El dueño ve la solicitud en *Accesos* → *Autorizar*. Ahora el Dr. Luis ve el historial previo y puede continuar el caso.

Para ver una invitación ya creada: `#/invitacion/rocky-demo-invite`.

### Ejecutarla en tu computador

No necesita instalar nada: abre `index.html` en el navegador.
Para que funcionen la geolocalización, las notificaciones y el modo sin conexión, sírvela por `http://localhost`
(por ejemplo con la extensión *Live Server* de VS Code) o usa la versión publicada.

---

## Arquitectura

La app sigue la arquitectura conceptual del documento (sección 16): **clientes → servicios (backend) → datos → servicios externos**.

```
index.html  ──►  js/views/*        Pantallas por rol (cliente)
                    │
                    ▼
                 js/core/http.js    Cliente HTTP: token de sesión, caché de lectura,
                    │               cola de sincronización sin conexión
                    ▼
                 js/backend/        API REST (backend simulado en el navegador)
                   server.js        · Reglas de negocio y control de acceso por rol
                   db.js            · Base de datos (tablas del modelo de datos)
                   seed.js          · Datos de demostración del wireframe
                    │
                    ▼
                 js/services/*      Servicios externos (APIs reales)
```

**Decisiones de diseño aplicadas:**

- **Toda regla de acceso vive en el backend** (16.2, RNF-01). Las pantallas nunca leen la base de datos: siempre piden a la API, y la API valida el rol, la verificación del veterinario y la autorización vigente del dueño.
- **Una sola API para las tres experiencias** (dueño, veterinario, administrador) con permisos distintos.
- **Los servicios externos se consumen a través de un módulo propio** para poder cambiarlos sin tocar las pantallas. La IA va por un proxy de servidor para proteger la clave.
- **El backend es reemplazable:** si en `js/config.js` se pone `apiBaseUrl`, el cliente HTTP envía las mismas peticiones a un servidor real con `fetch()`.

> **Alcance de esta versión:** el backend se ejecuta dentro del navegador y guarda los datos en `localStorage`. Esto permite demostrar el MVP completo sin servidor, pero los datos quedan en cada navegador (no se comparten entre dispositivos). Llevarlo a producción implica implementar los mismos endpoints de `server.js` en un servidor real con base de datos.

---

## APIs y servicios externos (sección 15)

| Servicio | Para qué | Implementación | Estado |
|---|---|---|---|
| Mapas y geolocalización | Veterinarios cercanos, filtro a domicilio, distancias (RF-21 a 23) | **Google Maps JavaScript API** + **Google Places API (New)** si hay clave. Respaldo automático: **Leaflet + OpenStreetMap** y **Overpass API**. **Geolocation API** en ambos casos | ✅ OpenStreetMap conectado sin clave · ⚙️ Google listo, falta la clave |
| Catálogo de razas | Lista normalizada de razas al registrar una mascota (RF-04, RF-19) | **Dog CEO API** (perros, con fotos) y **catfact.ninja** (gatos). The Dog/Cat API opcional con clave | ✅ Conectado, sin clave |
| Modelo de lenguaje (IA) | Perfil informativo de la raza con aviso (RF-19, RNF-11) | **API de Claude** a través de `server/claude-proxy` (Cloudflare Worker) | ⚙️ Listo para desplegar; mientras tanto usa una base local y lo indica |
| Códigos QR | Generar y leer el código de la mascota (RF-07, RF-08) | **QR Server API** (crear y leer QR) | ✅ Conectado, sin clave |
| Notificaciones push | Recordatorios de vacunas y controles (RF-17) | **Notifications API** del navegador + service worker. Texto sin datos clínicos | ✅ Funciona en el navegador. FCM requeriría un backend real |
| Correo o SMS | Invitar al dueño (RF-05) | Enlaces **WhatsApp (wa.me)**, **SMS** y **correo (mailto)** con el mensaje listo; queda registro en el panel admin | ✅ Funciona. Un proveedor transaccional requeriría backend |
| Autenticación | Registro e inicio de sesión (RF-01) | Módulo de autenticación del backend: contraseñas con SHA-256 y token de sesión | ✅ Simulado en el backend |
| Imágenes de gatos | Foto de referencia en el perfil de raza | **The Cat API** (`images/search`, sin clave) | ✅ Conectado |

La configuración de todos los servicios está en [`js/config.js`](js/config.js). Las claves privadas van en `js/config.local.js`, que no se sube al repositorio.

### Activar Google Maps

Sin clave, el mapa usa OpenStreetMap. Con clave, usa Google Maps para el mapa y Google Places para encontrar las veterinarias cercanas. Si la clave falla, la app vuelve sola a OpenStreetMap.

1. Entra a https://console.cloud.google.com y crea un proyecto (por ejemplo, `PetLink`).
2. En **Facturación**, vincula una cuenta de facturación. Google pide una tarjeta, pero el uso de un proyecto académico queda dentro de la cuota gratuita mensual.
3. En **APIs y servicios → Biblioteca**, habilita **Maps JavaScript API** y **Places API (New)**.
4. En **APIs y servicios → Credenciales → Crear credenciales → Clave de API**, copia la clave.
5. Edita la clave y restríngela:
   - **Restricciones de aplicación → Sitios web:** `https://wilmer19png.github.io/*` y, para pruebas locales, `http://localhost:5500/*` y `http://127.0.0.1:5500/*`.
   - **Restricciones de API:** solo *Maps JavaScript API* y *Places API (New)*.
6. Pon la clave en `js/config.js`, en `googleMapsKey: "..."`, y sube el cambio.

A diferencia de la clave de Claude, la de Google Maps sí puede ir en la app: Google la diseñó para el navegador y la protección es la restricción por dominio del paso 5.

### Activar la IA con Claude

Ver [`server/claude-proxy/README.md`](server/claude-proxy/README.md). En resumen: desplegar el Worker con la clave como secreto y poner su URL en `PL.config.ai.proxyUrl`.

---

## Pantallas (wireframe, sección 17)

| N.º | Pantalla | Ruta | Funcionalidad |
|---|---|---|---|
| 1 | Veterinario · Pacientes | `#/pacientes` | F-02, F-03, F-04 |
| 2 | Veterinario · Crear mascota | `#/pacientes/nueva` | F-02 |
| 3 | Veterinario · Nueva consulta | `#/consulta/nueva?mascota=…` | F-04 |
| 4 | Dueño · Invitación | `#/invitacion/:token` | F-02 |
| 5 | Dueño · Inicio | `#/inicio` | F-06, F-08 |
| 6 | Dueño · Historial | `#/mascotas/:id` | F-04 |
| 7 | Dueño · Accesos | `#/mascotas/:id/accesos` | F-03, F-02 |
| 8 | Dueño · Calendario | `#/calendario` | F-06 |
| 9 | Dueño · Mapa | `#/mapa` | F-09 |
| 10 | Dueño · Perfil de raza (IA) | `#/mascotas/:id/raza` | F-07 |
| 11 | Dueño · Notas | `#/mascotas/:id/notas` | F-05 |

Además: inicio de sesión y registro por rol, vincular por código o QR, perfil del veterinario, editar registro con versiones, sección *Aprender*, logros y racha, bandeja de notificaciones y el **panel web del administrador** (verificación de veterinarios, contenido educativo, mensajes enviados).

## Requerimientos del MVP cubiertos

| Funcionalidad | Requerimientos | Dónde |
|---|---|---|
| F-01 Cuentas y verificación | RF-01, RF-02, RF-03 | `views/auth.js`, `views/vet.js`, `views/admin.js` |
| F-02 Mascotas y titularidad | RF-04 a RF-07 | `views/vet.js`, `views/auth.js`, `views/pet.js` |
| F-03 Control de acceso | RF-08, RF-09 | `views/vet.js` (vincular), `views/pet.js` (accesos) |
| F-04 Historial clínico | RF-10 a RF-13 | `views/vet.js`, `views/pet.js` |
| F-05 Notas del dueño | RF-14 | `views/pet.js` |
| F-06 Calendario y recordatorios | RF-16, RF-17 | `views/calendar.js`, `services/notifications.js` |
| F-07 Educación e IA | RF-18, RF-19, RF-29 | `views/learn.js`, `views/pet.js`, `services/ai.js` |
| F-08 Gamificación | RF-20 | `backend/server.js`, `views/owner.js` |
| F-09 Mapa | RF-21 a RF-23 | `views/map.js`, `services/maps.js` |

**No funcionales destacados:** reglas de acceso en el servidor (RNF-01), versiones sin sobrescritura silenciosa (RNF-04, devuelve 409 si otro veterinario editó antes), tareas frecuentes en pocos toques (RNF-05), modo sin conexión con cola de sincronización (RNF-08), IA solo informativa con aviso (RNF-11), módulos separados por pilar (RNF-14).

## Pruebas

[`tests/flujo-mvp.html`](tests/flujo-mvp.html) recorre contra la API los 6 pasos del flujo mínimo del MVP y los flujos alternos (acceso retirado, veterinario sin verificar, edición concurrente, token inválido). Usa una base de datos de prueba separada. Resultado actual: **28 de 28 pruebas pasan**.

## Estructura

```
index.html              Entrada de la app
manifest.webmanifest    Instalable como app (PWA)
sw.js                   Service worker: sin conexión y clic en notificaciones
css/styles.css          Estilos mobile-first con los colores del wireframe
js/config.js            Configuración de servicios externos
js/core/                Utilidades, UI, router y cliente HTTP
js/backend/             API REST simulada, base de datos y datos de demo
js/services/            Integraciones con APIs externas
js/views/               Pantallas por rol
server/claude-proxy/    Proxy de IA (Cloudflare Worker + API de Claude)
tests/                  Pruebas del flujo MVP
docs/                   Documento de planeación (Momento 1)
```

## Proceso

El historial de commits muestra el orden de construcción: documento de planeación → estructura base y estilos → capa de datos y backend → servicios externos → pantallas por rol → panel del administrador → pruebas y modo sin conexión → proxy de IA → ajustes tras revisar cada pantalla.
