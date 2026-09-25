import { checkLogin, makeToken, send } from './_lib.js';

const fails = new Map(); // intentos fallidos por IP (por instancia)

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const f = fails.get(ip) || { n: 0, t: 0 };
  if (f.n >= 8 && Date.now() - f.t < 15 * 60e3) return send(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
  const { user, key } = req.body || {};
  const role = checkLogin(user, key);
  if (role) {
    fails.delete(ip);
    return send(res, 200, { token: makeToken(role), role });
  }
  fails.set(ip, { n: f.n + 1, t: Date.now() });
  await new Promise((r) => setTimeout(r, 700));
  return send(res, 401, { error: 'Usuario o clave incorrectos.' });
}
