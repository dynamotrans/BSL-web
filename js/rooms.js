/* BSL · datos de habitaciones y disponibilidad.
 * Compartido por la web pública (index.html) y el panel (admin.html).
 *
 * MODO DEMO: los datos se guardan en el navegador (localStorage), así que
 * solo los ve quien los edita. Para producción se sustituye BSLStore por
 * la versión conectada a la base de datos (ver TODO.md).
 */
(function () {
  'use strict';

  var CONFIG = window.BSL_CONFIG = window.BSL_CONFIG || {
    // WhatsApp de BSL en formato internacional sin "+" (ej. 34600111222). Vacío = pendiente.
    whatsapp: '',
    // SHA-256 de la clave del panel en modo demo. Clave demo: bsl2026
    adminKeyHash: '050860f16aea432dcaca4e6c2c0a72339a588aa90f8df256ab39df5f066bfd07'
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
    // Ejemplos de ocupación para que se vea cómo funciona
    rooms[1].intervalos.push({ desde: y + '-09-01', hasta: (y + 1) + '-07-31', estado: 'ocupada' });
    rooms[2].intervalos.push({ desde: y + '-09-01', hasta: (y + 1) + '-07-31', estado: 'ocupada' });
    rooms[2].intervalos.push({ desde: y + '-10-31', hasta: (y + 1) + '-07-31', estado: 'libre' });
    rooms[4].intervalos.push({ desde: y + '-09-01', hasta: (y + 1) + '-01-31', estado: 'ocupada' });
    rooms[6].intervalos.push({ desde: (y + 1) + '-02-01', hasta: (y + 1) + '-07-31', estado: 'ocupada' });
    return { demo: true, rooms: rooms };
  }

  /* ---------- Almacenamiento (demo: navegador) ---------- */
  var BSLStore = {
    load: function () {
      try {
        var s = localStorage.getItem(KEY);
        if (s) return Promise.resolve(JSON.parse(s));
      } catch (e) { /* sin almacenamiento: se usan los ejemplos */ }
      return Promise.resolve(seed());
    },
    save: function (data) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(new Error(e && e.name === 'QuotaExceededError'
          ? 'No cabe más: quita alguna foto o usa fotos más pequeñas.'
          : 'Este navegador no permite guardar datos.'));
      }
    },
    reset: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* nada */ }
      return Promise.resolve(seed());
    }
  };

  function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  function waLink(text) {
    return CONFIG.whatsapp ? 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(text) : '';
  }

  window.BSL = {
    config: CONFIG, store: BSLStore, sha256: sha256, waLink: waLink,
    PERIODS: PERIODS, periodRange: periodRange, defaultCourse: defaultCourse, courseLabel: courseLabel,
    dayState: dayState, status: status, addDays: addDays, toDate: toDate, today: today, fmt: fmt, MESES: MESES
  };
})();
