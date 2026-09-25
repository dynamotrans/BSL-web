# TODO — bsl-web

## Pendiente de datos del cliente
- [x] WhatsApp: +34 672 338 922 (`BSL_CONFIG.whatsapp` en `js/rooms.js`)
- [ ] Email e Instagram
- [ ] Más fotos: salón, cocinas, patio, azoteas, fachada
- [ ] Nº de habitaciones y precio de cada una (tabla de habitaciones)
- [x] Logo: elegido el de casa + libro (`images/logo-bsl.png`, `logo-mark.png`)
- [ ] Dominio → luego poner URL absoluta en `og:image`

## Panel de habitaciones (hecho en versión de prueba)
- [ ] **Conectar a base de datos (Supabase)** para que los cambios del panel se vean en todos los móviles. Hoy se guardan solo en el navegador de quien edita. Crear cuenta en supabase.com (gratis), tablas `habitaciones` e `intervalos`, almacenamiento para fotos y un usuario con email + clave para la propietaria. Solo hay que cambiar `BSLStore` en `js/rooms.js`
- [ ] Acceso al panel: hoy es usuario + clave comprobados en el navegador (solo se guarda el hash en `js/rooms.js`). **No es seguridad real**: con Supabase pasa a login de verdad
- [ ] Rellenar las 8 habitaciones reales: precio, gastos, m², cama, fotos y calendario

## Ideas
- [ ] Versión en inglés para estudiantes Erasmus
- [ ] Formulario de solicitud conectado a n8n (Google Sheets + aviso por WhatsApp)
- [ ] Disponibilidad de habitaciones en vivo
