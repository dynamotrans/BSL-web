import { get } from '@vercel/blob';
import { DATA_PATH, blobReady, send } from './_lib.js';

// Diagnóstico: dice si el almacén está conectado y si ya hay datos guardados (sin mostrar secretos)
export default async function handler(req, res) {
  const out = { almacen: blobReady(), datos: false };
  if (out.almacen) {
    try { const r = await get(DATA_PATH, { access: 'private', useCache: false }); out.datos = Boolean(r && r.statusCode === 200); }
    catch (e) { out.error = String(e && e.name || 'error'); }
  }
  res.setHeader('Cache-Control', 'no-store');
  return send(res, 200, out);
}
