# bsl-web — Instrucciones para Claude

Web de **BSL · Boutique Student Living**: habitaciones para chicas estudiantes en Calle Canónigo, 41701 Dos Hermanas (Sevilla).
Proyecto independiente de `dynamo-web`: **no mezclar** código ni contexto entre ambos.

## Proyecto
- Sitio estático HTML (`index.html` + `images/`). Local: `python3 -m http.server 3000`.
- Hosting previsto: Vercel conectado a GitHub (rama `main` = producción).

## Reglas
1. **Nunca hacer push sin preguntar.** Resumir cambios, commit local y preguntar "¿Subo los cambios a GitHub?".
2. Confirmar proyecto + rama antes de tocar nada.
3. Al terminar la sesión, añadir entrada a la Bitácora y actualizar `TODO.md`.
4. Imágenes en JPG (≤ 900 px de ancho, calidad ~78) para que carguen rápido.
5. El número de WhatsApp va en la constante `WA_NUMBER` del script de `index.html`.

## Bitácora

### 2026-09-25 — Claude Code web (nube)
- Primera versión de la web: hero con el pasillo de azulejo, datos clave, la vivienda, la habitación, cocinas, ubicación con tiempos "desde la puerta", condiciones y formulario que prepara un mensaje de WhatsApp.
- Paleta sacada del azulejo del pasillo (verde botella + ocre) y banda de "zócalo" como separador. Tipografías Young Serif + Instrument Sans.
- 5 fotos optimizadas en `images/` + `og-bsl.jpg` (1200×630) para compartir por WhatsApp.
- Logo elegido: casa + libro con degradado magenta → coral → amarillo sobre verde azulado. Recortado sin fondo (`logo-bsl.png`, `logo-mark.png`) + `favicon.png`. La paleta de la web pasa a la del logo.
- Animaciones: portada que "entra en la casa" al hacer scroll, zócalo de azulejo con los colores del logo, galería arrastrable con visor, panel de estación con tiempos que cambian letra a letra, contadores, revelado al hacer scroll y botón flotante de WhatsApp. Todo se desactiva con "reducir movimiento".
