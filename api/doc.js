import { get, put, del } from '@vercel/blob';
import { isAuthed, canWrite, READONLY_MSG, blobReady, readStream, send } from './_lib.js';

// Documentos de los contratos (PDF o fotos). Son privados: solo se ven con sesión del panel.
// Vercel no deja pasar más de 4,5 MB por petición, así que los archivos grandes (hasta 15 MB) se suben y se
// descargan por partes: POST {op:'parte'} × n + POST {op:'unir'}; GET ?info=1 da el tamaño y GET ?parte=i cada trozo.
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX = 15 * 1024 * 1024;
const PARTE = 3 * 1024 * 1024; // trozo de descarga (en bytes)
const ID = /^[a-z0-9]{12,40}$/;

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
      if (req.query.info) return send(res, 200, { size: buf.length, type: MIME[m[1]], parte: PARTE });
      if (req.query.parte !== undefined) {
        const i = +req.query.parte;
        if (!(i >= 0)) return send(res, 400, { error: 'Parte no válida' });
        res.setHeader('Content-Type', 'application/octet-stream');
        return res.status(200).send(buf.subarray(i * PARTE, (i + 1) * PARTE));
      }
      res.setHeader('Content-Type', MIME[m[1]]);
      res.setHeader('Content-Disposition', 'inline');
      return res.status(200).send(buf);
    } catch (e) {
      return send(res, 404, { error: 'No existe' });
    }
  }

  if (req.method === 'POST') {
    if (!canWrite(req)) return send(res, 403, { error: READONLY_MSG });
    const b0 = req.body || {};
    if (b0.op === 'parte') { // un trozo de un archivo grande (base64 sin cabecera)
      const id = String(b0.id || ''), i = +b0.i;
      if (!ID.test(id) || !(i >= 0 && i < 8) || !/^[A-Za-z0-9+/=]+$/.test(b0.data || '')) return send(res, 400, { error: 'Parte no válida' });
      await put('privado/tmp/' + id + '/' + i + '.part', Buffer.from(b0.data, 'base64'), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/octet-stream' });
      return send(res, 200, { ok: true });
    }
    if (b0.op === 'unir') { // junta los trozos en el documento final y borra los trozos
      const id = String(b0.id || ''), n = +b0.n, ext = TYPES[b0.type];
      if (!ID.test(id) || !(n >= 1 && n <= 8) || !ext) return send(res, 400, { error: 'Archivo no válido' });
      const bufs = [], urls = [];
      for (let i = 0; i < n; i++) {
        const r = await get('privado/tmp/' + id + '/' + i + '.part', { access: 'private', useCache: false }).catch(() => null);
        if (!r || r.statusCode !== 200) return send(res, 400, { error: 'Falta una parte del archivo. Vuelve a subirlo.' });
        bufs.push(await readStream(r.stream)); urls.push('privado/tmp/' + id + '/' + i + '.part');
      }
      const buf = Buffer.concat(bufs);
      await del(urls).catch(() => null);
      if (buf.length > MAX) return send(res, 413, { error: 'El archivo pesa demasiado (máximo 15 MB).' });
      const b = await put('privado/docs/doc.' + ext, buf, { access: 'private', addRandomSuffix: true, contentType: b0.type });
      return send(res, 200, { path: b.pathname });
    }
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec((req.body && req.body.data) || '');
    const ext = m && TYPES[m[1]];
    if (!ext) return send(res, 400, { error: 'Solo se admiten PDF o fotos (JPG, PNG, WEBP).' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX) return send(res, 413, { error: 'El archivo pesa demasiado (máximo 15 MB).' });
    const b = await put('privado/docs/doc.' + ext, buf, { access: 'private', addRandomSuffix: true, contentType: m[1] });
    return send(res, 200, { path: b.pathname });
  }

  return send(res, 405, { error: 'Método no permitido' });
}
