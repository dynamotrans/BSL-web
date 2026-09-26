// Aviso cuando llega una solicitud de admisión. Cada vía se activa sola al poner sus variables en Vercel:
//  · WhatsApp (CallMeBot): AVISO_WHATSAPP_TEL + AVISO_WHATSAPP_KEY
//  · Email (Brevo):        BREVO_API_KEY + AVISO_EMAIL (+ AVISO_REMITENTE, remitente verificado en Brevo)
//  · n8n u otro webhook:   AVISO_WEBHOOK_URL
// Si ninguna está puesta, no hace nada. Un fallo en el aviso nunca impide guardar la solicitud.
const env = process.env;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export async function avisar(s) {
  const edad = s.nacimiento ? Math.floor((Date.now() - Date.parse(s.nacimiento)) / 31557600000) : null;
  const resumen = `${s.nombre} ${s.apellidos}${edad ? ` (${edad} años)` : ''} · ${s.universidad} · ${[s.provincia, s.pais].filter(Boolean).join(', ')}`;
  const panel = 'https://bsl-web.vercel.app/admin.html';
  const tareas = [];

  if (env.AVISO_WHATSAPP_TEL && env.AVISO_WHATSAPP_KEY) {
    const text = `🏠 BSL · Nueva solicitud de admisión\n${resumen}\nHabitación ${s.habitacion} · ${s.periodo.titulo}\nRevísala en el panel: ${panel}`;
    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(env.AVISO_WHATSAPP_TEL) +
      '&apikey=' + encodeURIComponent(env.AVISO_WHATSAPP_KEY) + '&text=' + encodeURIComponent(text);
    tareas.push(fetch(url));
  }

  if (env.BREVO_API_KEY && env.AVISO_EMAIL) {
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fila = (k, v) => (v ? `<tr><td style="padding:4px 12px 4px 0;color:#667">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>` : '');
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16303a">
      <h2 style="margin:0 0 12px">Nueva solicitud de admisión</h2><table>
      ${fila('Nombre', s.nombre + ' ' + s.apellidos)}${fila('Edad', edad ? edad + ' años' : '')}${fila('Estudia', s.universidad + (s.estudios ? ' · ' + s.estudios : ''))}
      ${fila('Procedencia', [s.provincia, s.pais].filter(Boolean).join(', '))}${fila('Habitación', s.habitacion + ' · ' + s.periodo.titulo)}
      ${fila('Teléfono', s.telefono)}${fila('Email', s.email)}${fila('Instagram', s.instagram ? '@' + s.instagram : '')}${fila('Mensaje', s.mensaje)}
      </table><p style="margin:18px 0 0"><a href="${panel}" style="background:#16434a;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">Revisar en el panel</a></p>
      <p style="color:#889;font-size:12px">El documento de identidad solo se ve en el panel.</p></div>`;
    tareas.push(fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: env.AVISO_REMITENTE || env.AVISO_EMAIL, name: 'BSL · Web' },
        to: env.AVISO_EMAIL.split(',').map((e) => ({ email: e.trim() })),
        replyTo: { email: s.email, name: s.nombre + ' ' + s.apellidos },
        subject: `Nueva solicitud: ${s.nombre} ${s.apellidos} · ${s.habitacion}`,
        htmlContent: html
      })
    }));
  }

  if (env.AVISO_WEBHOOK_URL) {
    const datos = Object.assign({}, s); delete datos.doc; // sin el documento
    tareas.push(fetch(env.AVISO_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'solicitud', edad, resumen, panel, solicitud: datos }) }));
  }

  if (tareas.length) await withTimeout(Promise.allSettled(tareas), 4000).catch(() => {});
}
