import { canWrite, isAuthed, READONLY_MSG, send } from './_lib.js';

// Enlace de pago de Stripe para una pre-reserva aceptada (fianza). Solo desde el panel.
// Necesita la variable STRIPE_SECRET_KEY en Vercel; la clave nunca va en el código.
async function stripe(path, params, key) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Stripe no ha aceptado la petición');
  return j;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  if (!isAuthed(req)) return send(res, 401, { error: 'Sesión caducada. Vuelve a entrar.' });
  if (!canWrite(req)) return send(res, 403, { error: READONLY_MSG });
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return send(res, 503, { error: 'Los pagos con Stripe todavía no están activados. En cuanto la cuenta esté verificada y la clave puesta en Vercel, este botón generará el enlace.' });
  // Solo se mira el prefijo (sk_live / rk_live / pk_live…) para diagnosticar; la clave nunca se muestra.
  if (!/^(sk|rk)_(live|test)_/.test(key)) {
    const pre = (key.match(/^[a-z]+_[a-z]+_/) || ['desconocido'])[0];
    console.error('pago: STRIPE_SECRET_KEY con formato no válido, prefijo ' + pre);
    return send(res, 503, { error: 'La clave de Stripe puesta en Vercel no es la secreta (empieza por «' + pre + '»). Hay que pegar la que empieza por sk_live_.' });
  }
  const bad = key.search(/[^A-Za-z0-9_]/);
  if (bad >= 0) {
    console.error('pago: STRIPE_SECRET_KEY con un carácter no válido en la posición ' + (bad + 1) + ' de ' + key.length);
    return send(res, 503, { error: 'La clave de Stripe en Vercel está mal copiada: tiene un carácter raro en la posición ' + (bad + 1) + ' (de ' + key.length + '). Cópiala de nuevo desde Stripe, pégala en Vercel y haz Redeploy.' });
  }
  const b = req.body || {};
  const cents = Math.round((Number(b.importe) || 0) * 100);
  if (cents < 100 || cents > 1000000) return send(res, 400, { error: 'Importe no válido' });
  const concepto = String(b.concepto || 'Reserva BSL').slice(0, 120);
  try {
    const price = await stripe('prices', { currency: 'eur', unit_amount: String(cents), 'product_data[name]': concepto }, key);
    const link = await stripe('payment_links', {
      'line_items[0][price]': price.id, 'line_items[0][quantity]': '1',
      'restrictions[completed_sessions][limit]': '1',
      'metadata[solicitud]': String(b.id || '').slice(0, 40),
      'payment_intent_data[metadata][solicitud]': String(b.id || '').slice(0, 40),
      'payment_intent_data[description]': concepto
    }, key);
    return send(res, 200, { url: link.url });
  } catch (e) {
    console.error('pago: Stripe ha rechazado la petición: ' + e.message);
    return send(res, 502, { error: 'Stripe: ' + e.message });
  }
}
