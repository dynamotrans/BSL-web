# TODO — bsl-web

## Pendiente de datos del cliente
- [x] WhatsApp: +34 672 338 922 (`BSL_CONFIG.whatsapp` en `js/rooms.js`)
- [ ] Email e Instagram
- [ ] Más fotos: salón, cocinas, patio, azoteas, fachada
- [ ] Nº de habitaciones y precio de cada una (tabla de habitaciones)
- [x] Logo: elegido el de casa + libro (`images/logo-bsl.png`, `logo-mark.png`)
- [ ] Dominio → luego poner URL absoluta en `og:image`

## Panel de habitaciones (hecho en versión de prueba)
- [x] Datos compartidos con Vercel Blob (sin Supabase)
- [x] Acceso al panel comprobado en el servidor
- [ ] Opcional: mover hash y secreto de sesión a variables de entorno de Vercel (`BSL_ADMIN_HASH`, `BSL_SESSION_SECRET`) y elegir una clave más larga
- [ ] Rellenar las 8 habitaciones reales: precio, gastos, m², cama, fotos y calendario

## Ideas
- [ ] Versión en inglés para estudiantes Erasmus
- [ ] Formulario de solicitud conectado a n8n (Google Sheets + aviso por WhatsApp)
- [ ] Disponibilidad de habitaciones en vivo
