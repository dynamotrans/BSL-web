import CAMBIOS from './_cambios.js';
import { isAuthed, send } from './_lib.js';

// Lista de cambios preparados por Claude. Solo con sesión del panel (pueden llevar datos personales).
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthed(req)) return send(res, 401, { error: 'Sesión caducada. Vuelve a entrar.' });
  return send(res, 200, { cambios: CAMBIOS });
}
