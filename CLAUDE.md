# bsl-web — Instrucciones para Claude

Web de **BSL · Boutique Student Living**: habitaciones para chicas estudiantes en Calle Canónigo, 41701 Dos Hermanas (Sevilla).
Proyecto independiente de `dynamo-web`: **no mezclar** código ni contexto entre ambos.

## Proyecto
- Sitio estático HTML (`index.html` + `images/`). Local: `python3 -m http.server 3000`.
- **Repo**: `dynamotrans/BSL-web` (privado). **Vercel**: proyecto `bsl-web` → https://bsl-web.vercel.app (cada push a `main` se publica solo).
- La protección "Vercel Authentication" del proyecto debe quedar en *Only Preview Deployments* para que `bsl-web.vercel.app` se vea sin registro.

## Reglas
1. **Nunca hacer push sin preguntar.** Resumir cambios, commit local y preguntar "¿Subo los cambios a GitHub?".
2. Confirmar proyecto + rama antes de tocar nada.
3. Al terminar la sesión, añadir entrada a la Bitácora y actualizar `TODO.md`.
4. Imágenes en JPG (≤ 900 px de ancho, calidad ~78) para que carguen rápido.
5. El número de WhatsApp va en `BSL_CONFIG` de `js/rooms.js`. El acceso al panel se comprueba **en el servidor** (`api/_lib.js`, solo el hash). **Nunca escribir la clave en claro en el repo.**

## Bitácora

### 2026-09-25 — Claude Code web (nube)
- Primera versión de la web: hero con el pasillo de azulejo, datos clave, la vivienda, la habitación, cocinas, ubicación con tiempos "desde la puerta", condiciones y formulario que prepara un mensaje de WhatsApp.
- Paleta sacada del azulejo del pasillo (verde botella + ocre) y banda de "zócalo" como separador. Tipografías Young Serif + Instrument Sans.
- 5 fotos optimizadas en `images/` + `og-bsl.jpg` (1200×630) para compartir por WhatsApp.
- Logo elegido: casa + libro con degradado magenta → coral → amarillo sobre verde azulado. Recortado sin fondo (`logo-bsl.png`, `logo-mark.png`) + `favicon.png`. La paleta de la web pasa a la del logo.
- Animaciones: portada que "entra en la casa" al hacer scroll, zócalo de azulejo con los colores del logo, galería arrastrable con visor, panel de estación con tiempos que cambian letra a letra, contadores, revelado al hacer scroll y botón flotante de WhatsApp. Todo se desactiva con "reducir movimiento".
- Arreglo: fotos de la galería estiradas en móvil (el atributo `height` del `<img>` ganaba al `aspect-ratio`; ahora `img{height:auto}`).
- **Sección "Elige tu habitación"**: las 8 habitaciones con estado Libre / Libre parte del periodo / Ocupada según curso y periodo (curso completo 1 sep–31 jul, 1er cuatri 1 sep–31 ene, 2º cuatri 1 feb–31 jul). Ficha con fotos, equipamiento y disponibilidad. Botón Reservar → ventana con la habitación ya elegida, curso, periodo u "Otro" con fechas, y botón Enviar WhatsApp con el mensaje preparado.
- **Panel `admin.html`** con clave: publicar/ocultar cada habitación, nombre, precio, gastos, m², cama, descripción, equipamiento, fotos (se reducen solas) y calendario por intervalos de días ocupada/libre (manda el último añadido), con vista de 6 cursos (2 atrás, 3 adelante). Guarda solo.
- Datos y lógica compartidos en `js/rooms.js`. **Versión de prueba: guarda en el navegador**; falta conectar Supabase.
- Arreglo: en móvil, al terminar la animación de entrada (~1 s) la capa oscura de la foto se ponía encima del texto y bloqueaba los botones de la portada. Orden de capas fijado con `z-index`. Portada ajustada para que quepa en móviles pequeños (iPhone SE).
- Panel de tiempos más legible: fondo verde azulado de la marca, números en fichas claras grandes y "min" como texto en amarillo (antes todo en fichas amarillas sobre casi negro).
- **Responsive revisado**: un bloque `@media` del móvil se había roto (las cifras quedaban en 4 columnas de 566 px y la web se desplazaba de lado en el iPhone). Arreglado + ajustes de portada para móvil en horizontal y portátiles de pantalla baja + panel sin desbordes en móvil. Escaneo automático sin desbordes en 320, 390, 844×390, 768, 1024, 1280×720 y 1920.
- "La vivienda": la foto suelta del baño con etiqueta encima pasa a composición de 2 fotos (baño + habitación) escalonadas, con el texto debajo.
- "Tu habitación": la lista pasa a 8 tarjetas de equipamiento (título + detalle), 4 por fila en ordenador, 2 en tablet y 1 en móvil.
- **Reserva simplificada** (decisión de la propietaria): fuera cuatrimestres y fechas libres ("Otro"). Solo 2 opciones: **Curso completo siguiente** (1 sep – 31 jul, principal, sale siempre aunque esté ocupada, indicando fechas libres) y **Resto del curso en marcha** (solo si queda libre desde hoy o desde una fecha hasta el 31 jul). Lógica en `BSL.options()` de `js/rooms.js`. Filtros de la web: "Curso AAAA/AA" y "Para entrar ya".
- Carrusel "Pasa y mira": la primera foto ya no queda pegada al borde (`scroll-padding-inline`).
- Quitado "Hospital Virgen del Rocío · Reina Mercedes" del panel de tiempos.
- Botón del mapa → Google Maps de la casa (`https://maps.app.goo.gl/VNDkkathCcGhzhDj8`).
- **"Solo chicas estudiantes" siempre visible**: etiqueta fija en la barra superior (todas las pantallas), también en la ventana de reserva, y el mensaje de WhatsApp añade "Soy estudiante".
- Publicado en Vercel: `bsl-web.vercel.app` (proyecto creado por la propietaria desde vercel.com/new; el conector de Claude no tiene permiso para crear/editar proyectos).
- Arreglo: la portada fija ("entrar en la casa") dejaba un hueco vacío porque `overflow-x:hidden` en `html` + `body` rompía `position:sticky`. Ahora solo en `body` con `overflow-x:clip`. **No volver a poner overflow en `html`.**
- WhatsApp activo (+34 672 338 922) en el botón flotante, la reserva y el formulario. Enlace discreto "Admin" en el pie → `admin.html`, con usuario + clave (solo hash SHA-256 en el código; quitada la pista de la clave demo).
- **Habitaciones en carrusel** (antes lista/cuadrícula larga): tarjetas de 290 px que se deslizan, puntos para saber por cuál vas, flechas en ordenador y arrastre con ratón.
- **Datos compartidos en Vercel (sin base de datos)**: almacén Vercel Blob `bsl-web-blob` (privado, iad1) conectado al proyecto. Funciones en `api/`: `datos` (GET leer / POST guardar), `subir` (fotos JPG), `foto` (servir fotos), `login` (usuario+clave → sesión firmada de 12 h), `estado` (diagnóstico). Autenticación con OIDC de Vercel (`BLOB_STORE_ID`), sin token.
- El panel guarda para todos; si no hay servidor (vista previa local) usa el navegador como respaldo. Probado con un servidor local que imita Vercel + almacén en memoria.
- Qué incluyen los gastos (agua, luz, fibra + wifi, limpieza semanal de zonas comunes, mantenimiento y reparaciones): en la ventana de reserva, la ficha, las tarjetas, el mensaje de WhatsApp y Condiciones.
- Para las madres/familias: frase de portada ("solo para chicas estudiantes, en su mayoría de la Universidad Loyola y de la Pablo de Olavide") + bloque "Para las familias · Tu hija, en una casa tranquila y segura" con 4 tarjetas (solo chicas, zona segura, cerradura, casa cuidada).
- **Panel de gestión completo** (`js/gestion.js`, pestañas en `admin.html`): Habitaciones · Inquilinas (ficha, contacto de emergencia, contratos) · Cobros (mensualidades prorrateadas + fianza generadas por contrato, marcar pagado con fecha y forma de pago, resumen del mes y vencidos) · Incidencias (dónde, quién avisa, estado, coste) · Ocupación (cuadro de habitaciones × meses del curso) · Ajustes (cursos visibles en la web, "Para entrar ya", copia de seguridad).
- Datos personales en `privado/gestion.json` del Blob vía `api/gestion` (solo con sesión). Los contratos escriben en la ocupación pública solo fechas (`origen: 'c:<id>'`), nunca nombres. Comprobado: la web pública no expone datos personales y `api/gestion` sin sesión da 401.
- Cursos visibles configurables: `BSL.visibleCourses(ajustes)`; opciones de reserva con claves `curso-AAAA` y `resto`.
