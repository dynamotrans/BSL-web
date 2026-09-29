import { get, put } from '@vercel/blob';
import { GESTION_PATH, isAuthed, canWrite, READONLY_MSG, blobReady, readStream, send, cleanGestion } from './_lib.js';

// Datos privados (inquilinas, contratos, cobros, incidencias). Solo con sesión del panel.
const f = (d) => String(d).split('-').reverse().join('/');

function overlaps(g) {
  const cs = ((g && g.contratos) || []).filter((c) => c && c.id && c.habitacionId && c.desde && c.hasta);
  const out = [];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (a.habitacionId === b.habitacionId && a.desde <= b.hasta && a.hasta >= b.desde) out.push([a.id, b.id].sort().join('|'));
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!blobReady()) return send(res, 503, { error: 'Almacén no conectado' });
  if (!isAuthed(req)) return send(res, 401, { error: 'Sesión caducada. Vuelve a entrar.' });

  if (req.method === 'GET') {
    try {
      const r = await get(GESTION_PATH, { access: 'private', useCache: false });
      if (!r || r.statusCode !== 200) return send(res, 200, { inquilinas: [], contratos: [], cobros: [], incidencias: [] });
      const buf = await readStream(r.stream);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(buf);
    } catch (e) {
      if (e && /not.?found/i.test(e.name + e.message)) return send(res, 200, { inquilinas: [], contratos: [], cobros: [], incidencias: [] });
      return send(res, 500, { error: 'No se pudieron leer los datos de gestión' });
    }
  }

  if (req.method === 'POST') {
    if (!canWrite(req)) return send(res, 403, { error: READONLY_MSG });
    let prev = { contratos: [] };
    try {
      const r0 = await get(GESTION_PATH, { access: 'private', useCache: false });
      if (r0 && r0.statusCode === 200) prev = JSON.parse((await readStream(r0.stream)).toString('utf8'));
    } catch (e) { /* sin datos previos */ }
    const g = cleanGestion(req.body && req.body.gestion);
    if (!g) return send(res, 400, { error: 'Datos no válidos' });
    // Nunca se guardan dos contratos de la misma habitación con fechas que se pisan.
    // (Solo se rechazan solapes nuevos: si ya hubiera alguno antiguo, no bloquea el resto de cambios.)
    const nuevos = overlaps(g).filter((k) => !overlaps(prev).includes(k));
    if (nuevos.length) {
      const [a1, b1] = nuevos[0].split('|').map((id) => g.contratos.find((c) => c.id === id));
      return send(res, 409, { error: 'No se ha guardado: dos contratos de la misma habitación se pisan en fechas (' + f(a1.desde) + ' → ' + f(a1.hasta) + ' y ' + f(b1.desde) + ' → ' + f(b1.hasta) + '). Cambia las fechas o la habitación.' });
    }
    await put(GESTION_PATH, JSON.stringify(g), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60
    });
    return send(res, 200, { ok: true, updatedAt: g.updatedAt });
  }

  return send(res, 405, { error: 'Método no permitido' });
}
