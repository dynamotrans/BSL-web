import { get, put, del } from '@vercel/blob';
import { blobReady, readStream, send } from './_lib.js';

// Sube UN documento de una solicitud de admisión (foto o PDF del DNI/pasaporte), antes de enviarla.
// Se guarda en privado con nombre aleatorio; la solicitud lo enlaza después. Nada de esto es público.
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX = 15 * 1024 * 1024;
const ID = /^[a-z0-9]{12,40}$/;
// Más de ~2,5 MB llega por partes (Vercel limita cada petición a 4,5 MB): {op:'parte'} × n y {op:'unir'}, igual que api/doc.
const hits = new Map();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  if (!blobReady()) return send(res, 503, { error: 'Ahora mismo no podemos recibir documentos.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (h.length >= 24) return send(res, 429, { error: 'Demasiados archivos seguidos. Espera un rato.' });
  const b0 = req.body || {};
  if (b0.op === 'parte') { // las partes no cuentan como archivo completo para el límite por hora
    const id = String(b0.id || ''), i = +b0.i;
    if (!ID.test(id) || !(i >= 0 && i < 8) || !/^[A-Za-z0-9+/=]+$/.test(b0.data || '')) return send(res, 400, { error: 'Parte no válida' });
    await put('privado/tmp/' + id + '/' + i + '.part', Buffer.from(b0.data, 'base64'), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/octet-stream' });
    return send(res, 200, { ok: true });
  }
  if (b0.op === 'unir') {
    const id = String(b0.id || ''), n = +b0.n, ext2 = TYPES[b0.type];
    if (!ID.test(id) || !(n >= 1 && n <= 8) || !ext2) return send(res, 400, { error: 'Solo fotos (JPG, PNG) o PDF.' });
    const bufs = [], keys = [];
    for (let i = 0; i < n; i++) {
      const r = await get('privado/tmp/' + id + '/' + i + '.part', { access: 'private', useCache: false }).catch(() => null);
      if (!r || r.statusCode !== 200) return send(res, 400, { error: 'Falta una parte del archivo. Vuelve a subirlo.' });
      bufs.push(await readStream(r.stream)); keys.push('privado/tmp/' + id + '/' + i + '.part');
    }
    const all = Buffer.concat(bufs);
    await del(keys).catch(() => null);
    if (all.length > MAX) return send(res, 413, { error: 'El archivo pesa demasiado (máximo 15 MB).' });
    const up = await put('privado/docs/sol.' + ext2, all, { access: 'private', addRandomSuffix: true, contentType: b0.type });
    h.push(now); hits.set(ip, h);
    return send(res, 200, { path: up.pathname, tipo: ext2 === 'pdf' ? 'pdf' : 'img' });
  }
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(b0.data || '');
  const ext = m && TYPES[m[1]];
  if (!ext) return send(res, 400, { error: 'Solo fotos (JPG, PNG) o PDF.' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX) return send(res, 413, { error: 'El archivo pesa demasiado (máximo 15 MB).' });
  const b = await put('privado/docs/sol.' + ext, buf, { access: 'private', addRandomSuffix: true, contentType: m[1] });
  h.push(now); hits.set(ip, h);
  return send(res, 200, { path: b.pathname, tipo: ext === 'pdf' ? 'pdf' : 'img' });
}
