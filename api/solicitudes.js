import { get, put, list } from '@vercel/blob';
import { isAuthed, canWrite, READONLY_MSG, blobReady, readStream, send } from './_lib.js';

// Pre-reservas: listado y cambio de estado desde el panel (solo con sesión).
const PREFIX = 'privado/solicitudes/';

async function read(pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse((await readStream(r.stream)).toString('utf8'));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!blobReady()) return send(res, 503, { error: 'Almacén no conectado' });
  if (!isAuthed(req)) return send(res, 401, { error: 'Sesión caducada. Vuelve a entrar.' });

  if (req.method === 'GET') {
    const out = [];
    let cursor;
    do {
      const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
      for (const b of page.blobs) { try { const s = await read(b.pathname); if (s) out.push(s); } catch (e) { /* se ignora una dañada */ } }
      cursor = page.hasMore ? page.cursor : null;
    } while (cursor && out.length < 500);
    out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    return send(res, 200, { solicitudes: out });
  }

  if (req.method === 'POST') {
    if (!canWrite(req)) return send(res, 403, { error: READONLY_MSG });
    const b = req.body || {};
    if (!/^[a-z0-9]{6,30}$/.test(String(b.id || ''))) return send(res, 400, { error: 'Pre-reserva no válida' });
    const path = PREFIX + b.id + '.json';
    const s = await read(path).catch(() => null);
    if (!s) return send(res, 404, { error: 'No existe esa pre-reserva' });
    if (['nueva', 'aceptada', 'descartada'].includes(b.estado)) s.estado = b.estado;
    if (typeof b.nota === 'string') s.nota = b.nota.slice(0, 1000);
    if (typeof b.inquilinaId === 'string') s.inquilinaId = b.inquilinaId.slice(0, 40);
    if (b.pago && typeof b.pago.url === 'string' && /^https:\/\//.test(b.pago.url)) s.pago = { url: b.pago.url.slice(0, 300), importe: Number(b.pago.importe) || 0, fecha: new Date().toISOString() };
    s.actualizada = new Date().toISOString();
    await put(path, JSON.stringify(s), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    return send(res, 200, { ok: true, solicitud: s });
  }

  return send(res, 405, { error: 'Método no permitido' });
}
