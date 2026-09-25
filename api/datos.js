import { get, put } from '@vercel/blob';
import { DATA_PATH, isAuthed, blobReady, readStream, send, cleanData } from './_lib.js';

export default async function handler(req, res) {
  if (!blobReady()) return send(res, 503, { error: 'Almacén no conectado' });

  if (req.method === 'GET') {
    try {
      const r = await get(DATA_PATH, { access: 'private', useCache: false });
      if (!r || r.statusCode !== 200) return send(res, 404, { empty: true });
      const buf = await readStream(r.stream);
      res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(buf);
    } catch (e) {
      if (e && /not.?found/i.test(e.name + e.message)) return send(res, 404, { empty: true });
      return send(res, 500, { error: 'No se pudieron leer los datos' });
    }
  }

  if (req.method === 'POST') {
    if (!isAuthed(req)) return send(res, 401, { error: 'Sesión caducada. Vuelve a entrar.' });
    const data = cleanData(req.body && req.body.data);
    if (!data) return send(res, 400, { error: 'Datos no válidos' });
    await put(DATA_PATH, JSON.stringify(data), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true,
      contentType: 'application/json', cacheControlMaxAge: 60
    });
    return send(res, 200, { ok: true, updatedAt: data.updatedAt });
  }

  return send(res, 405, { error: 'Método no permitido' });
}
