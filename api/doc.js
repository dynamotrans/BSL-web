import { get, put } from '@vercel/blob';
import { isAuthed, canWrite, READONLY_MSG, blobReady, readStream, send } from './_lib.js';

// Documentos de los contratos (PDF o fotos). Son privados: solo se ven con sesión del panel.
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX = 3 * 1024 * 1024;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!blobReady()) return send(res, 503, { error: 'Almacén no conectado' });
  if (!isAuthed(req)) return send(res, 401, { error: 'Sesión caducada. Vuelve a entrar.' });

  if (req.method === 'GET') {
    const p = String((req.query && req.query.p) || '');
    const m = /^privado\/docs\/[\w.-]+\.(pdf|jpg|png|webp)$/.exec(p);
    if (!m) return send(res, 400, { error: 'Ruta no válida' });
    try {
      const r = await get(p, { access: 'private', useCache: false });
      if (!r || r.statusCode !== 200) return send(res, 404, { error: 'No existe' });
      const buf = await readStream(r.stream);
      res.setHeader('Content-Type', MIME[m[1]]);
      res.setHeader('Content-Disposition', 'inline');
      return res.status(200).send(buf);
    } catch (e) {
      return send(res, 404, { error: 'No existe' });
    }
  }

  if (req.method === 'POST') {
    if (!canWrite(req)) return send(res, 403, { error: READONLY_MSG });
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec((req.body && req.body.data) || '');
    const ext = m && TYPES[m[1]];
    if (!ext) return send(res, 400, { error: 'Solo se admiten PDF o fotos (JPG, PNG, WEBP).' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX) return send(res, 413, { error: 'El archivo pesa demasiado (máximo 3 MB).' });
    const b = await put('privado/docs/doc.' + ext, buf, { access: 'private', addRandomSuffix: true, contentType: m[1] });
    return send(res, 200, { path: b.pathname });
  }

  return send(res, 405, { error: 'Método no permitido' });
}
