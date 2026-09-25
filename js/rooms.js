/* BSL · datos de habitaciones y disponibilidad.
 * Compartido por la web pública (index.html) y el panel (admin.html).
 *
 * Los datos se guardan en Vercel Blob a través de /api (ver api/). Si no hay
 * servidor (p. ej. vista previa local), se usa el navegador como respaldo.
 */
(function () {
  'use strict';

  var CONFIG = window.BSL_CONFIG = window.BSL_CONFIG || {
    // WhatsApp de BSL en formato internacional sin "+" (ej. 34600111222). Vacío = pendiente.
    whatsapp: '34672338922'
  };

  var KEY = 'bsl-rooms-v1';
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /* ---------- Fechas (siempre 'AAAA-MM-DD', en UTC para evitar líos de horario) ---------- */
  function toDate(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function toIso(d) { return d.toISOString().slice(0, 10); }
  function addDays(iso, n) { var d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function fmt(iso, withYear) {
    var d = toDate(iso);
    return d.getUTCDate() + ' ' + MESES[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
  }

  /* ---------- Cursos y periodos ---------- */
  // Curso "2026" = del 1 sep 2026 al 31 jul 2027.
  function defaultCourse() {
    var d = new Date(), m = d.getMonth(), y = d.getFullYear();
    return m <= 3 ? y - 1 : y; // ene-abr: curso en marcha · may-dic: el que empieza en septiembre
  }
  function courseLabel(y) { return y + '/' + String(y + 1).slice(-2); }
  var PERIODS = {
    curso: { label: 'Curso completo', from: function (y) { return y + '-09-01'; }, to: function (y) { return (y + 1) + '-07-31'; } },
    c1: { label: '1er cuatrimestre', from: function (y) { return y + '-09-01'; }, to: function (y) { return (y + 1) + '-01-31'; } },
    c2: { label: '2º cuatrimestre', from: function (y) { return (y + 1) + '-02-01'; }, to: function (y) { return (y + 1) + '-07-31'; } }
  };
  function periodRange(key, y) { var p = PERIODS[key]; return p ? { from: p.from(y), to: p.to(y) } : null; }

  /* ---------- Disponibilidad ----------
   * Cada habitación tiene una lista de intervalos {desde, hasta, estado:'ocupada'|'libre'}.
   * Si dos intervalos se pisan, manda el último añadido (así, si una chica se va antes,
   * basta con añadir un intervalo "libre" desde ese día). Los días sin marcar cuentan como libres.
   */
  function dayState(room, iso) {
    var list = room.intervalos || [], st = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].desde <= iso && list[i].hasta >= iso) st = list[i].estado;
    }
    return st; // 'ocupada' | 'libre' | null (sin marcar)
  }
  function status(room, from, to) {
    var firstOcc = null, lastOcc = null, d = from;
    while (d <= to) {
      if (dayState(room, d) === 'ocupada') { if (!firstOcc) firstOcc = d; lastOcc = d; }
      d = addDays(d, 1);
    }
    if (!firstOcc) return { kind: 'libre', text: 'Libre' };
    if (lastOcc < to) return { kind: 'parcial', text: 'Libre desde el ' + fmt(addDays(lastOcc, 1)), from: addDays(lastOcc, 1) };
    if (firstOcc > from) return { kind: 'parcial', text: 'Libre hasta el ' + fmt(addDays(firstOcc, -1)), to: addDays(firstOcc, -1) };
    return { kind: 'ocupada', text: 'Ocupada' };
  }

  /* ---------- Opciones de reserva ----------
   * 1) Resto del curso en marcha: solo si la habitación queda libre desde hoy (o desde una fecha)
   *    hasta el 31 de julio.
   * 2) Curso completo siguiente (1 sep – 31 jul): siempre, aunque esté ocupada, con sus fechas libres.
   */
  function courseOf(iso) { // curso en marcha que contiene la fecha, o null en agosto
    var y = +iso.slice(0, 4), md = iso.slice(5);
    if (md >= '09-01') return y;
    if (md <= '07-31') return y - 1;
    return null;
  }
  function nextFullCourse(iso) { var y = +iso.slice(0, 4); return iso.slice(5) >= '09-01' ? y + 1 : y; }
  function longStatus(st, from, to) {
    if (st.kind === 'libre') return 'Libre';
    if (st.kind === 'ocupada') return 'Ocupada todo el periodo';
    if (st.from) return 'Ocupada hasta el ' + fmt(addDays(st.from, -1), true) + ' · libre desde el ' + fmt(st.from, true);
    return 'Libre hasta el ' + fmt(st.to, true) + ' · después ocupada';
  }
  // Cursos que se ofrecen en la web (Ajustes del panel). Por defecto: el siguiente curso completo.
  function visibleCourses(ajustes, iso) {
    iso = iso || today();
    var yn = nextFullCourse(iso), y0 = courseOf(iso);
    var list = (ajustes && ajustes.cursos && ajustes.cursos.length ? ajustes.cursos : [yn]).map(Number)
      .filter(function (y) { return (y + 1) + '-07-31' >= iso && y !== y0; }); // solo cursos completos aún por empezar
    list = list.filter(function (y, i) { return list.indexOf(y) === i; }).sort();
    return list.length ? list : [yn];
  }
  function options(room, iso, ajustes) {
    iso = iso || today();
    var out = [], y0 = courseOf(iso);
    if (y0 !== null && !(ajustes && ajustes.entrarYa === false)) {
      var end = (y0 + 1) + '-07-31', st = status(room, iso, end);
      var d = st.kind === 'libre' ? iso : (st.kind === 'parcial' && st.from ? st.from : null);
      if (d) out.push({
        key: 'resto', y: y0, from: d, to: end,
        title: 'Resto del curso ' + courseLabel(y0),
        short: d === iso ? 'Libre ya' : 'Libre desde el ' + fmt(d, true),
        st: { kind: d === iso ? 'libre' : 'parcial' },
        long: d === iso ? 'Libre desde hoy' : 'Libre el ' + fmt(d, true)
      });
    }
    visibleCourses(ajustes, iso).forEach(function (yn, i) {
      var r = periodRange('curso', yn), s2 = status(room, r.from, r.to);
      out.push({ key: 'curso-' + yn, y: yn, main: i === 0, from: r.from, to: r.to, title: 'Curso completo ' + courseLabel(yn), short: s2.text, st: s2, long: longStatus(s2, r.from, r.to) });
    });
    return out;
  }

  /* ---------- Fichas reales de las 8 habitaciones (tabla de la propietaria) ---------- */
  var FICHAS = [
    { num: 1, nombre: 'Azahar', precio: 330, m2: 10.74, cama: '140', descripcion: 'Planta baja, primera a la derecha al entrar. Ventana grande a la calle. Medidas: 3,74 × 2,87 m.' },
    { num: 2, nombre: 'Jazmín', precio: 330, m2: 11.37, cama: '140', descripcion: 'Planta baja, primera a la izquierda al entrar. Ventana grande a la calle. Medidas: 3,74 × 3,04 m.' },
    { num: 3, nombre: 'Dalia', precio: 320, m2: 8.61, cama: '140', descripcion: 'Planta baja, segunda a la derecha al entrar. Ventana grande al patio. Medidas: 3 × 2,87 m.' },
    { num: 4, nombre: 'Azucena', precio: 320, m2: 9.94, cama: '140', descripcion: 'Planta baja, al fondo, junto al baño, la cocina y el patio. Ventana grande al patio y armario empotrado. Medidas: 3,39 × 2,93 m.' },
    { num: 5, nombre: 'Tulipán', precio: 330, m2: 9.21, cama: '140', descripcion: 'Primera planta, primera a la derecha. Ventana grande a la calle. Medidas: 3,13 × 2,94 m.' },
    { num: 6, nombre: 'Malva', precio: 300, m2: 6.87, cama: '110', descripcion: 'Primera planta, primera a la izquierda. Ventana grande a la azotea de la primera planta. Medidas: 3,38 × 2,03 m.' },
    { num: 7, nombre: 'Girasol', precio: 330, m2: 6.02, cama: '105', descripcion: 'Primera planta, segunda a la derecha. Balcón grande a la calle. Medidas: 2,95 × 2,04 m.' },
    { num: 8, nombre: 'Margarita', precio: 330, m2: 6.02, cama: '105', descripcion: 'Primera planta, tercera a la derecha. Ventana grande a la calle. Medidas: 2,95 × 2,04 m.' }
  ];
  function applyFichas(rooms) {
    FICHAS.forEach(function (f) {
      var r = rooms.filter(function (x) { return x.num === f.num; })[0]; if (!r) return;
      r.nombre = f.nombre; r.m2 = f.m2; r.cama = f.cama; r.descripcion = f.descripcion;
      if (f.precio == null) r.activa = false; else r.precio = f.precio; // sin precio: se oculta hasta que se ponga
    });
  }
  // true si las habitaciones aún tienen los datos genéricos de ejemplo
  function needsFichas(data) {
    if (!data || !data.rooms || (data.ajustes && data.ajustes.fichas)) return false;
    return data.rooms.some(function (r) { return /^Habitación( \d+)?$/.test(r.nombre || ''); });
  }
  function m2(v) { return (+v || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 }); }

  /* ---------- Datos de ejemplo ---------- */
  var EQUIP = ['Cerradura propia', 'Armario', 'Escritorio y silla ergonómica', 'Smart TV 32″ con wifi',
    'Radiador De’Longhi', 'Ventilador de techo', 'Ropa de cama y toallas'];
  function seed() {
    var y = defaultCourse();
    var fotos = {
      1: ['images/habitacion-cama-140.jpg'],
      2: ['images/habitacion-escritorio.jpg'],
      3: ['images/habitacion-completa.jpg']
    };
    var rooms = [];
    for (var n = 1; n <= 8; n++) {
      rooms.push({
        id: 'h' + n,
        num: n,
        nombre: 'Habitación ' + n,
        activa: true,
        precio: [330, 350, 360, 340, 330, 370, 350, 390][n - 1],
        gastos: 60,
        m2: [10, 12, 11, 9, 10, 13, 11, 14][n - 1],
        cama: n % 3 === 0 ? '105' : '140',
        descripcion: n === 8
          ? 'La más amplia de la casa, con ventana a la calle y mucha luz natural.'
          : 'Habitación exterior, reformada y amueblada, con zona de estudio junto a la ventana.',
        equipamiento: EQUIP.slice(),
        fotos: fotos[n] || [],
        intervalos: []
      });
    }
    applyFichas(rooms);
    return { demo: true, rooms: rooms, ajustes: { cursos: [nextFullCourse(today())], entrarYa: true } };
  }

  /* ---------- Almacenamiento ----------
   * En la web publicada: /api/datos (Vercel Blob), visible para todos.
   * Sin servidor (vista previa local): el navegador, solo para quien edita.
   */
  var TOKEN_KEY = 'bsl-admin-token';
  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* nada */ } }
  function isJson(r) { return (r.headers.get('content-type') || '').indexOf('json') >= 0; }
  function post(path, body, auth) {
    var h = { 'Content-Type': 'application/json' };
    if (auth) h.Authorization = 'Bearer ' + getToken();
    return fetch(path, { method: 'POST', headers: h, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('Error ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function localLoad() {
    try { var s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { /* nada */ }
    return seed();
  }

  var BSLStore = {
    remote: false,   // true = hay servidor y los datos son compartidos
    broken: false,   // true = hay servidor pero el almacén no está conectado
    load: function () {
      return fetch('/api/datos', { cache: 'no-store' }).then(function (r) {
        if (r.status === 200 && isJson(r)) {
          BSLStore.remote = true;
          return r.json().then(function (d) { return { rooms: d.rooms || [], ajustes: d.ajustes || {}, demo: false, updatedAt: d.updatedAt }; });
        }
        if ((r.status === 404 || r.status === 503) && isJson(r)) {
          BSLStore.remote = true; BSLStore.broken = r.status === 503;
          return seed(); // aún no hay nada guardado: ejemplos
        }
        throw new Error('sin servidor');
      }).catch(function () { BSLStore.remote = false; return localLoad(); });
    },
    save: function (data) {
      if (!BSLStore.remote) {
        try { localStorage.setItem(KEY, JSON.stringify(data)); return Promise.resolve(); }
        catch (e) { return Promise.reject(new Error('Este navegador no permite guardar más datos.')); }
      }
      return post('/api/datos', { data: { rooms: data.rooms, ajustes: data.ajustes || {} } }, true).then(function (j) { data.demo = false; return j; });
    },
    upload: function (dataUrl) {
      if (!BSLStore.remote) return Promise.resolve(dataUrl);
      return post('/api/subir', { foto: dataUrl }, true).then(function (j) { return j.url; });
    },
    login: function (user, key) {
      return fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: user, key: key }) })
        .then(function (r) {
          if (r.status === 200) return r.json().then(function (j) { setToken(j.token); return true; });
          if (!isJson(r)) throw new Error('El acceso solo funciona en la web publicada.');
          return r.json().then(function (j) { throw new Error(j.error || 'Usuario o clave incorrectos.'); });
        });
    },
    logout: function () { setToken(''); },
    // Datos privados de gestión (inquilinas, contratos, cobros, incidencias)
    loadGestion: function () {
      var empty = { inquilinas: [], contratos: [], cobros: [], incidencias: [] };
      if (!BSLStore.remote) {
        try { var s = localStorage.getItem(KEY + '-gestion'); if (s) return Promise.resolve(JSON.parse(s)); } catch (e) { /* nada */ }
        return Promise.resolve(empty);
      }
      return fetch('/api/gestion', { headers: { Authorization: 'Bearer ' + getToken() }, cache: 'no-store' }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || ('Error ' + r.status)); e.status = r.status; throw e; }
          ['inquilinas', 'contratos', 'cobros', 'incidencias', 'cambios'].forEach(function (k) { if (!Array.isArray(j[k])) j[k] = []; });
          return j;
        });
      });
    },
    loadCambios: function () {
      if (!BSLStore.remote) return Promise.resolve([]);
      return fetch('/api/cambios', { headers: { Authorization: 'Bearer ' + getToken() }, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : { cambios: [] }; })
        .then(function (j) { return Array.isArray(j.cambios) ? j.cambios : []; }, function () { return []; });
    },
    saveGestion: function (g) {
      if (!BSLStore.remote) {
        try { localStorage.setItem(KEY + '-gestion', JSON.stringify(g)); return Promise.resolve(); }
        catch (e) { return Promise.reject(new Error('Este navegador no permite guardar más datos.')); }
      }
      return post('/api/gestion', { gestion: g }, true);
    },
    hasSession: function () { return +(getToken().split('.')[0] || 0) > Date.now(); },
    // Usuario de solo lectura (comercial): el servidor rechaza cualquier cambio
    readOnly: function () { return getToken().split('.')[1] === 'r'; },
    reset: function () {
      if (!BSLStore.remote) { try { localStorage.removeItem(KEY); } catch (e) { /* nada */ } }
      return Promise.resolve(seed());
    }
  };

  function waLink(text) {
    return CONFIG.whatsapp ? 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(text) : '';
  }

  window.BSL = {
    config: CONFIG, store: BSLStore, waLink: waLink,
    PERIODS: PERIODS, periodRange: periodRange, defaultCourse: defaultCourse, courseLabel: courseLabel,
    dayState: dayState, status: status, options: options, visibleCourses: visibleCourses, FICHAS: FICHAS, applyFichas: applyFichas, needsFichas: needsFichas, m2: m2, periodRange: periodRange, courseOf: courseOf, nextFullCourse: nextFullCourse, addDays: addDays, toDate: toDate, today: today, fmt: fmt, MESES: MESES
  };
})();
