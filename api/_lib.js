// Utilidades compartidas por las funciones de /api (los archivos con "_" no se publican como ruta).
import crypto from 'node:crypto';

// SHA-256 de "usuario:clave" del panel. La clave en claro no está en ningún archivo.
const ADMIN_HASH = process.env.BSL_ADMIN_HASH || '10e13f83f1e159976fd32f265d70210c0e6baff1a783ce3c497236cfdc9aed27';
// Usuario de solo lectura (comercial): ve todo el panel pero no puede cambiar nada.
const READER_HASH = process.env.BSL_READER_HASH || 'e1cafaf62ccfc07055968f6922daf7805853468cd2bf539e7a485a65ff751ede';
// Secreto para firmar la sesión del panel. Se puede sobrescribir con la variable BSL_SESSION_SECRET en Vercel.
const SECRET = process.env.BSL_SESSION_SECRET || 'VYpIzBHwkBcdYIC0eofkEYkTY2ByxN8PA5iCZfei';
const SESSION_HOURS = 12;

export const DATA_PATH = 'datos/habitaciones.json';
export const GESTION_PATH = 'privado/gestion.json';

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');
const hmac = (t) => crypto.createHmac('sha256', SECRET).update(t).digest('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Devuelve el rol ('admin' o 'lectura') o false si usuario/clave no son correctos
export function checkLogin(user, key) {
  if (typeof user !== 'string' || typeof key !== 'string') return false;
  const h = sha256(user.trim().toLowerCase() + ':' + key.trim());
  if (same(h, ADMIN_HASH)) return 'admin';
  if (same(h, READER_HASH)) return 'lectura';
  return false;
}

// Sesión: caducidad.rol.firma (a = admin, r = solo lectura)
export function makeToken(role) {
  const exp = Date.now() + SESSION_HOURS * 3600e3, r = role === 'admin' ? 'a' : 'r';
  return exp + '.' + r + '.' + hmac(exp + '.' + r);
}

// Rol de la sesión ('admin' | 'lectura') o false si no hay sesión válida
export function isAuthed(req) {
  const m = /^Bearer (\d+)\.([ar])\.([0-9a-f]{64})$/.exec(req.headers.authorization || '');
  if (!m || +m[1] < Date.now() || !same(hmac(m[1] + '.' + m[2]), m[3])) return false;
  return m[2] === 'a' ? 'admin' : 'lectura';
}
export const canWrite = (req) => isAuthed(req) === 'admin';
export const READONLY_MSG = 'Tu usuario es de solo lectura: no puede cambiar nada.';

export function blobReady() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readStream(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

export function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(body));
}

// Comprueba que los datos de habitaciones tienen la forma esperada antes de guardarlos
export function cleanData(data) {
  if (!data || !Array.isArray(data.rooms) || data.rooms.length > 30) return null;
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const num = (v) => (Number.isFinite(+v) ? +v : 0);
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const okUrl = (u) => typeof u === 'string' && (/^images\/[\w.-]+$/.test(u) || /^\/api\/foto\?p=fotos\/[\w.-]+$/.test(u));
  const rooms = data.rooms.map((r, i) => ({
    id: str(r.id || 'h' + (i + 1), 20),
    num: num(r.num) || i + 1,
    nombre: str(r.nombre, 80),
    activa: Boolean(r.activa),
    precio: num(r.precio),
    gastos: num(r.gastos),
    m2: num(r.m2),
    cama: ['90', '105', '110', '120', '135', '140', '150'].includes(String(r.cama)) ? String(r.cama) : '140',
    descripcion: str(r.descripcion, 1200),
    equipamiento: (Array.isArray(r.equipamiento) ? r.equipamiento : []).slice(0, 30).map((x) => str(x, 120)),
    fotos: (Array.isArray(r.fotos) ? r.fotos : []).filter(okUrl).slice(0, 20),
    intervalos: (Array.isArray(r.intervalos) ? r.intervalos : []).slice(0, 300)
      .map((x) => {
        const o = { desde: iso(x.desde), hasta: iso(x.hasta), estado: x.estado === 'libre' ? 'libre' : 'ocupada' };
        if (typeof x.origen === 'string' && /^c:[\w-]{1,40}$/.test(x.origen)) o.origen = x.origen;
        return o;
      })
      .filter((x) => x.desde && x.hasta && x.desde <= x.hasta)
  }));
  const aj = data.ajustes || {};
  const ajustes = {
    cursos: (Array.isArray(aj.cursos) ? aj.cursos : []).map(Number).filter((y) => y > 2000 && y < 2100).slice(0, 6),
    entrarYa: aj.entrarYa !== false,
    fichas: aj.fichas === true
  };
  return { rooms, ajustes, updatedAt: new Date().toISOString() };
}

// Limpieza genérica de los datos privados de gestión (inquilinas, contratos, cobros, incidencias)
export function cleanGestion(g) {
  if (!g || typeof g !== 'object') return null;
  const walk = (v, depth) => {
    if (depth > 4) return null;
    if (v == null) return null;
    if (typeof v === 'string') return v.slice(0, 3000);
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.slice(0, 5000).map((x) => walk(x, depth + 1));
    if (typeof v === 'object') {
      const o = {};
      Object.keys(v).slice(0, 60).forEach((k) => { if (/^[\w-]{1,40}$/.test(k)) o[k] = walk(v[k], depth + 1); });
      return o;
    }
    return null;
  };
  const out = {};
  ['inquilinas', 'contratos', 'cobros', 'incidencias', 'cambios'].forEach((k) => { out[k] = Array.isArray(g[k]) ? walk(g[k], 0) : []; });
  out.updatedAt = new Date().toISOString();
  return JSON.stringify(out).length > 3 * 1024 * 1024 ? null : out;
}
