import { get } from '@vercel/blob';
import { blobReady, readStream, send } from './_lib.js';

export default async function handler(req, res) {
  const p = String((req.query && req.query.p) || '');
  if (!/^fotos\/[\w.-]+\.jpg$/.test(p)) return send(res, 400, { error: 'Ruta no válida' });
  if (!blobReady()) return send(res, 503, { error: 'Almacén no conectado' });
  try {
    const r = await get(p, { access: 'private' });
    if (!r || r.statusCode !== 200) return send(res, 404, { error: 'No existe' });
    const buf = await readStream(r.stream);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    return send(res, 404, { error: 'No existe' });
  }
}
