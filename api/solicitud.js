import { put } from '@vercel/blob';
import crypto from 'node:crypto';
import { blobReady, send } from './_lib.js';
import { avisar } from './_aviso.js';

// Pre-reservas enviadas desde la web (sin sesión). Se guardan en privado, una por archivo,
// y solo se leen desde el panel (api/solicitudes). Nada de esto se publica.
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_DOC = 3 * 1024 * 1024;
const hits = new Map(); // envíos por IP (por instancia)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  if (!blobReady()) return send(res, 503, { error: 'Ahora mismo no podemos recibir solicitudes. Escríbenos por WhatsApp.' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (h.length >= 6) return send(res, 429, { error: 'Has enviado varias solicitudes seguidas. Espera un rato o escríbenos por WhatsApp.' });

  const b = req.body || {};
  if (b.web) return send(res, 200, { ok: true }); // campo trampa para robots
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const d = {
    nombre: str(b.nombre, 80), apellidos: str(b.apellidos, 120), email: str(b.email, 120), telefono: str(b.telefono, 30),
    documento: str(b.documento, 30), tipoDoc: ['DNI', 'NIE', 'Pasaporte'].includes(b.tipoDoc) ? b.tipoDoc : 'DNI', nacimiento: iso(b.nacimiento),
    pais: str(b.pais, 60), provincia: str(b.provincia, 80), universidad: str(b.universidad, 80), estudios: str(b.estudios, 120),
    instagram: str(b.instagram, 60).replace(/^@+/, ''), familiar: str(b.familiar, 100), familiarTel: str(b.familiarTel, 30), mensaje: str(b.mensaje, 1000),
    habitacionId: str(b.habitacionId, 20), habitacion: str(b.habitacion, 80), precio: Number(b.precio) || 0, gastos: Number(b.gastos) || 0,
    periodo: { titulo: str(b.periodo && b.periodo.titulo, 80), desde: iso(b.periodo && b.periodo.desde), hasta: iso(b.periodo && b.periodo.hasta) }
  };
  const faltan = [];
  if (!d.nombre || !d.apellidos) faltan.push('nombre y apellidos');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) faltan.push('email');
  if (d.telefono.replace(/\D/g, '').length < 9) faltan.push('teléfono');
  if (!d.documento) faltan.push('número de documento');
  if (!d.nacimiento) faltan.push('fecha de nacimiento');
  if (!d.pais || !d.provincia) faltan.push('país y provincia de procedencia');
  if (!d.instagram) faltan.push('Instagram');
  if (!d.universidad) faltan.push('universidad');
  if (!d.habitacionId || !d.periodo.desde || !d.periodo.hasta) faltan.push('habitación y fechas');
  if (b.acepta !== true) faltan.push('aceptar las condiciones');
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(b.doc || '');
  if (!m || !TYPES[m[1]]) faltan.push('foto o PDF del DNI o pasaporte');
  if (faltan.length) return send(res, 400, { error: 'Falta: ' + faltan.join(', ') + '.' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_DOC) return send(res, 413, { error: 'El documento pesa demasiado (máximo 3 MB).' });

  const doc = await put('privado/docs/sol.' + TYPES[m[1]], buf, { access: 'private', addRandomSuffix: true, contentType: m[1] });
  const id = now.toString(36) + crypto.randomBytes(3).toString('hex');
  const sol = Object.assign({ id, fecha: new Date(now).toISOString(), estado: 'nueva' }, d,
    { doc: { path: doc.pathname, tipo: TYPES[m[1]] === 'pdf' ? 'pdf' : 'img', nombre: str(b.docNombre, 120) || 'Documento' } });
  await put('privado/solicitudes/' + id + '.json', JSON.stringify(sol), { access: 'private', addRandomSuffix: false, contentType: 'application/json' });
  h.push(now); hits.set(ip, h);
  await avisar(sol).catch(() => {});
  return send(res, 200, { ok: true });
}
