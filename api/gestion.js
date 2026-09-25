import { get, put } from '@vercel/blob';
import { GESTION_PATH, isAuthed, canWrite, READONLY_MSG, blobReady, readStream, send, cleanGestion } from './_lib.js';

// Datos privados (inquilinas, contratos, cobros, incidencias). Solo con sesión del panel.
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
    const g = cleanGestion(req.body && req.body.gestion);
    if (!g) return send(res, 400, { error: 'Datos no válidos' });
    await put(GESTION_PATH, JSON.stringify(g), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60
    });
    return send(res, 200, { ok: true, updatedAt: g.updatedAt });
  }

  return send(res, 405, { error: 'Método no permitido' });
}
