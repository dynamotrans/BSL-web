import { put } from '@vercel/blob';
import { isAuthed, blobReady, send } from './_lib.js';


export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  if (!blobReady()) return send(res, 503, { error: 'Almacén no conectado' });
  if (!isAuthed(req)) return send(res, 401, { error: 'Sesión caducada. Vuelve a entrar.' });
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec((req.body && req.body.foto) || '');
  if (!m) return send(res, 400, { error: 'La foto debe ser JPG' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 3 * 1024 * 1024) return send(res, 413, { error: 'La foto pesa demasiado' });
  const b = await put('fotos/habitacion.jpg', buf, {
    access: 'private', addRandomSuffix: true, contentType: 'image/jpeg', cacheControlMaxAge: 31536000
  });
  return send(res, 200, { url: '/api/foto?p=' + b.pathname });
}
