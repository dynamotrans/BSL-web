import { put } from '@vercel/blob';
import { blobReady, send } from './_lib.js';

// Sube UN documento de una solicitud de admisión (foto o PDF del DNI/pasaporte), antes de enviarla.
// Se guarda en privado con nombre aleatorio; la solicitud lo enlaza después. Nada de esto es público.
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX = 3 * 1024 * 1024;
const hits = new Map();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  if (!blobReady()) return send(res, 503, { error: 'Ahora mismo no podemos recibir documentos.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (h.length >= 24) return send(res, 429, { error: 'Demasiados archivos seguidos. Espera un rato.' });
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec((req.body && req.body.data) || '');
  const ext = m && TYPES[m[1]];
  if (!ext) return send(res, 400, { error: 'Solo fotos (JPG, PNG) o PDF.' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX) return send(res, 413, { error: 'El archivo pesa demasiado (máximo 3 MB).' });
  const b = await put('privado/docs/sol.' + ext, buf, { access: 'private', addRandomSuffix: true, contentType: m[1] });
  h.push(now); hits.set(ip, h);
  return send(res, 200, { path: b.pathname, tipo: ext === 'pdf' ? 'pdf' : 'img' });
}
