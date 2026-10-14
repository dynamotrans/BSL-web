import { get, list, copy, del } from '@vercel/blob';
import { DATA_PATH, GESTION_PATH, isAuthed, canWrite, READONLY_MSG, blobReady, readStream, send } from './_lib.js';

// Copia de seguridad nocturna dentro del propio almacén Blob (la lanza el cron de vercel.json).
//  · copias/AAAA-MM-DD/<ruta>  → todos los .json (habitaciones, gestión, solicitudes…) de ese día. Se guardan DIAS días.
//  · copias/archivos/<ruta>    → cada foto o documento subido, una sola vez (no cambian), para no perderlos si se borran.
// GET (cron o admin): hace la copia de hoy si aún no existe. GET ?listar=1: días guardados.
// GET ?fecha=AAAA-MM-DD: descarga esa copia en un solo JSON. POST: copia ahora (rehace la de hoy).
const RAIZ = 'copias/', ARCH = 'copias/archivos/', DIAS = 30;
const hoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const OPC = { access: 'private', addRandomSuffix: false, allowOverwrite: true };

async function todos(prefix) {
  const out = []; let cursor;
  do { const p = await list({ prefix: prefix || undefined, cursor, limit: 1000 }); out.push(...p.blobs); cursor = p.hasMore ? p.cursor : undefined; } while (cursor);
  return out;
}
async function enTandas(items, fn, n = 6) {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(fn));
}
async function dias() {
  const out = []; let cursor;
  do {
    const p = await list({ prefix: RAIZ, mode: 'folded', cursor, limit: 1000 });
    (p.folders || []).forEach((f) => { const m = /^copias\/(\d{4}-\d{2}-\d{2})\/$/.exec(f); if (m) out.push(m[1]); });
    cursor = p.hasMore ? p.cursor : undefined;
  } while (cursor);
  return out.sort().reverse();
}

async function hacerCopia(forzar) {
  const fecha = hoy(), dir = RAIZ + fecha + '/';
  if (!forzar && (await list({ prefix: dir, limit: 1 })).blobs.length) return { fecha, hecha: false, motivo: 'Ya había copia de hoy' };
  const origen = (await todos('')).filter((b) => !b.pathname.startsWith(RAIZ));
  const yaArchivados = new Set((await todos(ARCH)).map((b) => b.pathname.slice(ARCH.length)));
  const jsons = origen.filter((b) => b.pathname.endsWith('.json'));
  const nuevos = origen.filter((b) => !b.pathname.endsWith('.json') && !yaArchivados.has(b.pathname));
  await enTandas(jsons, (b) => copy(b.url, dir + b.pathname, { ...OPC, contentType: 'application/json' }));
  await enTandas(nuevos, (b) => copy(b.url, ARCH + b.pathname, { ...OPC, allowOverwrite: false }).catch(() => null));
  // Borra los días que pasan de DIAS
  const limite = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10);
  const viejos = (await dias()).filter((d) => d < limite);
  for (const d of viejos) { const bs = await todos(RAIZ + d + '/'); if (bs.length) await del(bs.map((b) => b.url)); }
  return { fecha, hecha: true, jsons: jsons.length, archivosNuevos: nuevos.length, borrados: viejos };
}

async function leerJson(path) {
  try {
    const r = await get(path, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse((await readStream(r.stream)).toString('utf8'));
  } catch (e) { return null; }
}

function esCron(req) {
  const s = process.env.CRON_SECRET;
  if (s) return req.headers.authorization === 'Bearer ' + s;
  return /^vercel-cron\//.test(req.headers['user-agent'] || '');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!blobReady()) return send(res, 503, { error: 'Almacén no conectado' });
  const q = req.query || {};

  if (req.method === 'GET' && !q.listar && !q.fecha) {
    // Lo llama el cron cada noche. Solo hace algo una vez al día, así que repetirlo no gasta ni estropea nada.
    if (!esCron(req) && !canWrite(req)) return send(res, 401, { error: 'No autorizado' });
    try { return send(res, 200, await hacerCopia(false)); } catch (e) { return send(res, 500, { error: 'No se pudo hacer la copia: ' + (e.message || e) }); }
  }

  if (!isAuthed(req)) return send(res, 401, { error: 'Sesión caducada. Vuelve a entrar.' });

  if (req.method === 'POST') {
    if (!canWrite(req)) return send(res, 403, { error: READONLY_MSG });
    try { return send(res, 200, await hacerCopia(true)); } catch (e) { return send(res, 500, { error: 'No se pudo hacer la copia: ' + (e.message || e) }); }
  }

  if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' });
  if (q.listar) return send(res, 200, { dias: await dias(), guarda: DIAS });

  // Descarga de un día: mismo formato que «_COPIA_RESTAURAR.json» del ZIP del panel
  const f = String(q.fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return send(res, 400, { error: 'Fecha no válida' });
  const dir = RAIZ + f + '/';
  const bs = await todos(dir);
  if (!bs.length) return send(res, 404, { error: 'No hay copia de ese día' });
  const solicitudes = [];
  await enTandas(bs.filter((b) => b.pathname.startsWith(dir + 'privado/solicitudes/')), async (b) => { const j = await leerJson(b.pathname); if (j) solicitudes.push(j); });
  return send(res, 200, {
    fecha: f, origen: 'copia automática nocturna',
    habitaciones: await leerJson(dir + DATA_PATH), gestion: await leerJson(dir + GESTION_PATH), solicitudes
  });
}
