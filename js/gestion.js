/* BSL · Gestión interna del panel: inquilinas, contratos, cobros, incidencias, ocupación y ajustes.
 * Los datos personales se guardan en privado (api/gestion). Los contratos marcan solos
 * la ocupación de cada habitación en la web (sin datos personales).
 */
(function () {
  'use strict';
  var B = window.BSL, A = null, G = null, tab = 'res', saveT = null, detail = null;
  var box, dlg;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var METODOS = ['Transferencia', 'Bizum', 'Efectivo', 'Tarjeta', 'Otro'];

  /* ---------- Confirmar con usuario y clave antes de borrar ----------
   * La clave se comprueba en el servidor (api/login), nunca en el navegador. */
  function confirmKey(msg) {
    return new Promise(function (resolve) {
      var d = document.createElement('dialog');
      d.className = 'gdlg keydlg';
      var user = ''; try { user = sessionStorage.getItem('bsl-user') || ''; } catch (e) { /* nada */ }
      d.innerHTML = '<form method="dialog" class="dform"><div class="dh"><h3>Confirmar borrado</h3><button type="button" class="dx" aria-label="Cancelar">✕</button></div>' +
        '<div class="grid dbody"><p class="keymsg wide">' + esc(msg) + '</p>' +
        '<label><span>Usuario</span><input id="kd-u" type="text" autocomplete="username" autocapitalize="none" value="' + esc(user) + '"></label>' +
        '<label><span>Clave</span><input id="kd-k" type="password" autocomplete="current-password"></label>' +
        '<p class="derr wide" id="kd-err" hidden></p></div>' +
        '<div class="dfoot"><button type="button" class="btn plain" id="kd-no">Cancelar</button><button type="submit" class="btn danger-btn">Borrar</button></div></form>';
      document.body.appendChild(d);
      function close(ok) { if (d.open) d.close(); d.remove(); resolve(ok); }
      d.querySelector('.dx').onclick = d.querySelector('#kd-no').onclick = function () { close(false); };
      d.addEventListener('cancel', function (e) { e.preventDefault(); close(false); });
      d.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = d.querySelector('[type=submit]'), err = d.querySelector('#kd-err');
        var u = d.querySelector('#kd-u').value.trim(), k = d.querySelector('#kd-k').value;
        if (!u || !k) { err.textContent = 'Escribe usuario y clave.'; err.hidden = false; return; }
        if (!B.store.remote) { close(true); return; } // modo local de pruebas
        btn.disabled = true;
        B.store.login(u, k).then(function () { close(true); }, function (x) {
          btn.disabled = false; err.textContent = x.message || 'Usuario o clave incorrectos.'; err.hidden = false;
          d.querySelector('#kd-k').value = ''; d.querySelector('#kd-k').focus();
        });
      });
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      d.querySelector(user ? '#kd-k' : '#kd-u').focus();
    });
  }

  /* ---------- Utilidades ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad(n) { return ('0' + n).slice(-2); }
  function num(v) { return Number.isFinite(+v) ? +v : 0; }
  function money(n) { n = num(n); return n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'; }
  function today() { return B.today(); }
  function fmt(iso) { return iso ? B.fmt(iso, true) : '—'; }
  // Fecha y hora de registro (hora de España)
  function now() { return new Date().toISOString(); }
  function fmtDT(iso) {
    if (!iso) return '';
    if (iso.length <= 10) return fmt(iso);
    try {
      var d = new Date(iso), p = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
      var g = function (t) { return (p.filter(function (x) { return x.type === t; })[0] || {}).value || ''; };
      return g('day') + ' ' + g('month').replace('.', '').replace('sept', 'sep') + ' ' + g('year') + ', ' + g('hour') + ':' + g('minute') + ' h';
    } catch (e) { return fmt(iso.slice(0, 10)); }
  }
  function mesLabel(ym) { var p = ym.split('-'); return MES_LARGO[+p[1] - 1] + ' ' + p[0]; }
  function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m: 1-12
  function rooms() { return A.data().rooms.slice().sort(function (a, b) { return a.num - b.num; }); }
  function room(id) { return A.data().rooms.filter(function (r) { return r.id === id; })[0]; }
  function roomName(id) { var r = room(id); return r ? 'Nº ' + r.num + ' · ' + r.nombre : (id === 'comun' ? 'Zonas comunes' : '—'); }
  function tenant(id) { return G.inquilinas.filter(function (t) { return t.id === id; })[0]; }
  function fullName(t) { return t ? ((t.nombre || '') + ' ' + (t.apellidos || '')).trim() || 'Sin nombre' : '—'; }
  function contract(id) { return G.contratos.filter(function (c) { return c.id === id; })[0]; }
  function tenantOfCobro(x) { var c = contract(x.contratoId); return tenant(x.inquilinaId || (c && c.inquilinaId)); }
  function cobroState(x) { return x.pagado ? 'pagado' : (x.vence && x.vence < today() ? 'vencido' : 'pendiente'); }
  function activeContract(tid) {
    var t = today(), list = G.contratos.filter(function (c) { return c.inquilinaId === tid; });
    return list.filter(function (c) { return c.desde <= t && c.hasta >= t; })[0] ||
      list.filter(function (c) { return c.desde > t; }).sort(function (a, b) { return a.desde < b.desde ? -1 : 1; })[0] || null;
  }
  function debt(tid) {
    return G.cobros.filter(function (x) { var te = tenantOfCobro(x); return te && te.id === tid && cobroState(x) === 'vencido'; })
      .reduce(function (s, x) { return s + num(x.importe); }, 0);
  }
  // Paginación: 10 elementos por página, recordando la página de cada listado
  var PAGES = {}, PER = 10;
  function pageOf(list, key, per) {
    per = per || PER;
    var pages = Math.max(1, Math.ceil(list.length / per)), p = Math.min(PAGES[key] || 0, pages - 1);
    PAGES[key] = p;
    return list.slice(p * per, p * per + per);
  }
  function pager(key, total, per) {
    per = per || PER;
    var pages = Math.ceil(total / per), p = PAGES[key] || 0;
    if (pages <= 1) return '';
    var from = p * per + 1, to = Math.min(total, from + per - 1), btns = '', gap = false;
    for (var i = 0; i < pages; i++) {
      if (pages > 7 && i > 0 && i < pages - 1 && Math.abs(i - p) > 1) { if (!gap) { btns += '<span class="pg-gap">…</span>'; gap = true; } continue; }
      gap = false;
      btns += '<button type="button" data-pgk="' + key + '" data-pg="' + i + '"' + (i === p ? ' aria-current="true"' : '') + '>' + (i + 1) + '</button>';
    }
    return '<nav class="pager" aria-label="Páginas"><span class="hint">Mostrando ' + from + '–' + to + ' de ' + total + '</span><div>' +
      '<button type="button" data-pgk="' + key + '" data-pg="' + Math.max(0, p - 1) + '"' + (p === 0 ? ' disabled' : '') + ' aria-label="Anterior">←</button>' + btns +
      '<button type="button" data-pgk="' + key + '" data-pg="' + Math.min(pages - 1, p + 1) + '"' + (p === pages - 1 ? ' disabled' : '') + ' aria-label="Siguiente">→</button></div></nav>';
  }
  function chip(kind, text) { return '<span class="chip2 k-' + kind + '">' + esc(text) + '</span>'; }

  /* ---------- Guardado ---------- */
  function save() {
    if (B.store.readOnly()) return;
    A.setState('Guardando…');
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      B.store.saveGestion(G).then(function () { A.setState('Todo guardado'); }, function (err) {
        if (err.status === 401) return A.expired();
        A.setState('No se ha guardado'); A.alert(err.message);
      });
    }, 400);
  }
  // Los contratos marcan la ocupación de cada habitación (sin datos personales)
  function syncRooms() {
    var rs = A.data().rooms;
    rs.forEach(function (r) { r.intervalos = (r.intervalos || []).filter(function (i) { return !i.origen; }); });
    G.contratos.forEach(function (c) {
      var r = rs.filter(function (x) { return x.id === c.habitacionId; })[0];
      if (r && c.desde && c.hasta) r.intervalos.push({ desde: c.desde, hasta: c.hasta, estado: 'ocupada', origen: 'c:' + c.id });
    });
    A.saveRooms();
  }
  // Mensualidades (prorrateadas el primer y último mes) + fianza. Los cobros ya pagados no se tocan.
  // Al admitir: la fianza queda pendiente en Cobros con vencimiento el día de la admisión
  function fianzaAdmision(tid, importe, dia, solId) {
    var cids = G.contratos.filter(function (c) { return c.inquilinaId === tid; }).map(function (c) { return c.id; });
    var ya = G.cobros.filter(function (x) { return x.tipo === 'fianza' && (x.inquilinaId === tid || cids.indexOf(x.contratoId) >= 0); })[0];
    if (ya || !(num(importe) > 0)) return ya || null;
    var x = { id: uid(), contratoId: '', inquilinaId: tid, solicitudId: solId || '', tipo: 'fianza', mes: dia.slice(0, 7), concepto: 'Fianza (admisión)', importe: num(importe), vence: dia, pagado: false, creadoEn: now() };
    G.cobros.push(x); return x;
  }
  function genCobros(c) {
    var paid = {};
    // La fianza apuntada al admitir (aún sin contrato) pasa a este contrato, con su fecha y su enlace de pago
    G.cobros.forEach(function (x) { if (x.tipo === 'fianza' && !x.contratoId && x.inquilinaId && x.inquilinaId === c.inquilinaId) x.contratoId = c.id; });
    G.cobros.forEach(function (x) { if (x.contratoId === c.id && x.pagado) paid[x.tipo === 'fianza' ? 'fianza' : x.mes] = true; });
    var fz = G.cobros.filter(function (x) { return x.contratoId === c.id && x.tipo === 'fianza' && !x.pagado; })[0];
    G.cobros = G.cobros.filter(function (x) { return x.contratoId !== c.id || x.pagado || x.tipo === 'otro' || (x === fz && num(c.fianza) > 0); });
    var total = num(c.precio) + num(c.gastos), dia = Math.min(28, Math.max(1, num(c.diaPago) || 5));
    var y = +c.desde.slice(0, 4), m = +c.desde.slice(5, 7), endKey = c.hasta.slice(0, 7);
    for (var guard = 0; guard < 60; guard++) {
      var ym = y + '-' + pad(m);
      if (ym > endKey) break;
      var dim = daysIn(y, m), first = ym + '-01', last = ym + '-' + pad(dim);
      var from = c.desde > first ? c.desde : first, to = c.hasta < last ? c.hasta : last;
      var days = Math.round((B.toDate(to) - B.toDate(from)) / 864e5) + 1;
      var imp = days >= dim ? total : Math.round(total * days / dim);
      var vence = ym + '-' + pad(dia); if (vence < from) vence = from;
      if (!paid[ym] && imp > 0) G.cobros.push({ id: uid(), contratoId: c.id, tipo: 'mensualidad', mes: ym, concepto: 'Mensualidad ' + mesLabel(ym) + (days < dim ? ' (' + days + ' días)' : ''), importe: imp, vence: vence, pagado: false });
      m++; if (m > 12) { m = 1; y++; }
    }
    if (fz && num(c.fianza) > 0 && !paid.fianza) { fz.importe = num(c.fianza); if (fz.pago && num(fz.pago.importe) !== fz.importe) delete fz.pago; }
    else if (num(c.fianza) > 0 && !paid.fianza) G.cobros.push({ id: uid(), contratoId: c.id, tipo: 'fianza', mes: c.desde.slice(0, 7), concepto: 'Fianza', importe: num(c.fianza), vence: c.desde, pagado: false });
  }

  /* ---------- Ventana de formulario genérica ---------- */
  function field(f, v) {
    var id = 'fx-' + f.k, val = v == null ? '' : v, lab = '<span>' + esc(f.label) + '</span>';
    var cls = f.wide ? ' class="wide"' : '';
    if (f.type === 'select') return '<label' + cls + '>' + lab + '<select id="' + id + '">' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
    if (f.type === 'textarea') return '<label class="wide"><span>' + esc(f.label) + '</span><textarea id="' + id + '">' + esc(val) + '</textarea></label>';
    if (f.type === 'html') return '<div class="wide">' + f.html + '</div>';
    return '<label' + cls + '>' + lab + '<input id="' + id + '" type="' + (f.type || 'text') + '"' + (f.step ? ' step="' + f.step + '"' : '') + ' value="' + esc(val) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '></label>';
  }
  function openForm(o) {
    dlg.innerHTML = '<form method="dialog" class="dform"><div class="dh"><h3>' + esc(o.title) + '</h3><button type="button" class="dx" aria-label="Cerrar">✕</button></div>' +
      '<div class="grid dbody">' + o.fields.map(function (f) { return field(f, o.values ? o.values[f.k] : ''); }).join('') + '<p class="derr wide" id="fx-err" hidden></p></div>' +
      '<div class="dfoot">' + (o.onDelete ? '<button type="button" class="btn plain danger" id="fx-del">Borrar</button>' : '<span></span>') +
      '<button type="submit" class="btn">' + esc(o.ok || 'Guardar') + '</button></div></form>';
    var form = dlg.querySelector('form');
    dlg.querySelector('.dx').onclick = function () { dlg.close(); };
    if (o.onChange) form.addEventListener('change', function (e) { o.onChange(e, read); });
    function read() {
      var out = {};
      o.fields.forEach(function (f) {
        var el = $('fx-' + f.k); if (!el) return;
        var v = f.type === 'number' ? num(el.value) : el.value.trim();
        // Los textos escritos se guardan en MAYÚSCULAS (no emails, fechas ni desplegables)
        if (typeof v === 'string' && (!f.type || f.type === 'text' || f.type === 'textarea')) v = v.toLocaleUpperCase('es-ES');
        out[f.k] = v;
      });
      return out;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = o.onSave(read());
      if (err) {
        var p = $('fx-err'); p.textContent = err; p.hidden = false;
        // El aviso puede quedar al final de un formulario largo: se lleva a la vista para que no parezca que se ha guardado
        p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
        p.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      dlg.close();
    });
    if (o.onDelete) $('fx-del').onclick = function () {
      if (o.needKey) {
        confirmKey(o.needKey).then(function (ok) { if (ok) { o.onDelete(); dlg.close(); } });
        return;
      }
      if (this.dataset.sure !== '1') { this.dataset.sure = '1'; this.textContent = 'Pulsa otra vez para borrar'; return; }
      o.onDelete(); dlg.close();
    };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    return { read: read };
  }

  /* ---------- Pestañas ---------- */
  var TABS = [['res', 'Panel de control'], ['sol', 'Solicitudes'], ['ocu', 'Ocupación'], ['hab', 'Habitaciones'], ['inq', 'Inquilinas'], ['cob', 'Cobros'], ['con', 'Consumos'], ['inc', 'Incidencias'], ['aju', 'Ajustes']];
  function renderTabs() {
    $('tabs').innerHTML = TABS.map(function (t) {
      var badge = '';
      if (t[0] === 'cob') { var n = G.cobros.filter(function (x) { return cobroState(x) === 'vencido'; }).length; if (n) badge = '<i>' + n + '</i>'; }
      if (t[0] === 'sol' && SOL) { var ns = SOL.filter(function (x) { return x.estado === 'nueva'; }).length; if (ns) badge = '<i>' + ns + '</i>'; }
      if (t[0] === 'inc') { var k = G.incidencias.filter(function (x) { return x.estado !== 'resuelta'; }).length; if (k) badge = '<i>' + k + '</i>'; }
      return '<button type="button" data-t="' + t[0] + '" aria-current="' + (t[0] === tab) + '">' + t[1] + badge + '</button>';
    }).join('');
  }
  function show(t) {
    tab = t; detail = t === 'inq' ? detail : null;
    renderTabs();
    $('tab-hab').hidden = t !== 'hab'; box.hidden = t === 'hab';
    if (t === 'hab') { A.refresh(); return; }
    ({ res: viewResumen, sol: viewSolicitudes, inq: viewTenants, cob: viewCobros, con: viewConsumos, inc: viewIncidencias, ocu: viewOcupacion, aju: viewAjustes })[t]();
    window.scrollTo(0, 0);
  }
  function refresh() { renderTabs(); if (tab !== 'hab') show(tab); }


  /* ---------- Panel de control: todo de un vistazo ---------- */
  function viewResumen() {
    var t = today(), ym = t.slice(0, 7), act = rooms().filter(function (r) { return r.activa; });
    var y0 = B.courseOf(t); if (y0 === null) y0 = B.nextFullCourse(t);
    var y = +(box.dataset.ry || y0);
    // Ocupación hoy
    var occ = act.filter(function (r) { return B.dayState(r, t) === 'ocupada'; }), free = act.filter(function (r) { return occ.indexOf(r) < 0; });
    var pct = act.length ? Math.round(occ.length * 100 / act.length) : 0;
    // Cobros
    var rent = G.cobros.filter(function (x) { return x.tipo !== 'fianza'; });
    var mesL = rent.filter(function (x) { return (x.vence || '').slice(0, 7) === ym; });
    var mesTot = mesL.reduce(function (s, x) { return s + num(x.importe); }, 0);
    var mesOk = mesL.filter(function (x) { return x.pagado; }).reduce(function (s, x) { return s + num(x.importe); }, 0);
    var venc = G.cobros.filter(function (x) { return cobroState(x) === 'vencido'; }).sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
    var vencTot = venc.reduce(function (s, x) { return s + num(x.importe); }, 0);
    var incA = G.incidencias.filter(function (x) { return x.estado !== 'resuelta'; });
    // Mes a mes del curso
    // Curso de septiembre a agosto (agosto incluido por si alguna se queda todo el año)
    var months = []; for (var i = 0; i < 12; i++) { var mm = (8 + i) % 12 + 1, yy = mm >= 9 ? y : y + 1; months.push(yy + '-' + pad(mm)); }
    var maxMoney = 1, mdata = months.map(function (m) {
      var mid = m + '-15', o = act.filter(function (r) { return B.dayState(r, mid) === 'ocupada'; }).length;
      var L = rent.filter(function (x) { return (x.vence || '').slice(0, 7) === m; }), d = { m: m, o: o, ok: 0, pe: 0, ve: 0 };
      L.forEach(function (x) { var st = cobroState(x); d[st === 'pagado' ? 'ok' : st === 'vencido' ? 've' : 'pe'] += num(x.importe); });
      maxMoney = Math.max(maxMoney, d.ok + d.pe + d.ve); return d;
    });
    function mlab(m) { return B.MESES[+m.slice(5) - 1]; }
    var occChart = '<div class="rchart">' + mdata.map(function (d) {
      var h = act.length ? d.o * 100 / act.length : 0;
      return '<div class="rcol' + (d.m === ym ? ' now' : '') + '" title="' + mesLabel(d.m) + ': ' + d.o + ' de ' + act.length + ' ocupadas"><span class="rv2">' + d.o + '</span><div class="rbarbox"><i class="rb-occ" style="height:' + h + '%"></i></div><small>' + mlab(d.m) + '</small></div>';
    }).join('') + '</div>';
    var payChart = '<div class="rchart">' + mdata.map(function (d) {
      var tot = d.ok + d.pe + d.ve, f = function (v) { return (v * 100 / maxMoney) + '%'; };
      return '<div class="rcol' + (d.m === ym ? ' now' : '') + '" title="' + mesLabel(d.m) + ': cobrado ' + money(d.ok) + ', pendiente ' + money(d.pe) + ', vencido ' + money(d.ve) + '"><span class="rv2">' + (tot ? String(Math.round(tot / 100) / 10).replace('.', ',') + 'k' : '') + '</span><div class="rbarbox stack">' +
        '<i class="rb-ve" style="height:' + f(d.ve) + '"></i><i class="rb-pe" style="height:' + f(d.pe) + '"></i><i class="rb-ok" style="height:' + f(d.ok) + '"></i></div><small>' + mlab(d.m) + '</small></div>';
    }).join('') + '</div>';
    // Movimientos próximos (45 días)
    var lim = B.addDays(t, 70), moves = [];
    G.contratos.forEach(function (c) {
      if (c.desde >= t && c.desde <= lim) moves.push({ d: c.desde, k: 'Entra', c: c });
      if (c.hasta >= t && c.hasta <= lim) moves.push({ d: c.hasta, k: 'Sale', c: c });
    });
    moves.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var prox = G.cobros.filter(function (x) { return !x.pagado && x.vence >= t && x.vence <= B.addDays(t, 10); }).sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
    function cuando(d) { var n = Math.round((B.toDate(d) - B.toDate(t)) / 864e5); return n <= 0 ? 'vence hoy' : n === 1 ? 'vence mañana' : 'vence en ' + n + ' días'; }
    function who(x) { var c = contract(x.contratoId); return esc(fullName(tenantOfCobro(x))) + (c ? ' · ' + esc(room(c.habitacionId) ? room(c.habitacionId).nombre : '') : ''); }
    // Días que faltan: menos de 15 en rojo, menos de 55 en naranja, el resto neutro
    function faltan(d) {
      var n = Math.round((Date.parse(d) - Date.parse(t)) / 864e5);
      return '<span class="chip2 ' + (n < 15 ? 'k-vencido' : n < 55 ? 'k-pendiente' : 'k-neutro') + '">' + (n <= 0 ? 'Hoy' : n === 1 ? 'Mañana' : 'Faltan ' + n + ' días') + '</span>';
    }
    function list(items, empty) { return items.length ? items.join('') : '<p class="empty">' + empty + '</p>'; }
    var circ = 2 * Math.PI * 34;
    var ys = []; for (var k = -2; k <= 3; k++) ys.push(y0 + k);
    box.innerHTML = solResumenHtml() +
      '<div class="ghead"><h2>Panel de control</h2><div class="gtools"><span class="hint">Hoy ' + fmt(t) + '</span><select id="ry" aria-label="Curso">' +
      ys.map(function (c) { return '<option value="' + c + '"' + (c === y ? ' selected' : '') + '>Curso ' + B.courseLabel(c) + (c === y0 ? ' (actual)' : '') + '</option>'; }).join('') + '</select></div></div>' +
      '<section class="card moves"><h3>Entradas y salidas</h3><p class="hint">Próximos 70 días.</p>' + list(moves.slice(0, 8).map(function (m) {
          var te = tenant(m.c.inquilinaId), rm = room(m.c.habitacionId);
          return '<button type="button" class="crow" data-ten="' + (te ? te.id : '') + '"><span><b>' + esc(fullName(te)) + '</b><small>' + fmt(m.d) + ' · ' + esc(rm ? rm.nombre : '') + '</small></span><span class="mv-tags">' + faltan(m.d) + chip(m.k === 'Entra' ? 'pagado' : 'fin', m.k) + '</span></button>';
        }), 'Sin entradas ni salidas.') + '</section>' +
      '<div class="kpis">' +
        '<button type="button" class="kpi" data-go="ocu"><svg class="ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34"/><circle class="on" cx="40" cy="40" r="34" style="stroke-dasharray:' + (circ * pct / 100) + ' ' + circ + '"/></svg>' +
          '<span><small>Ocupación hoy</small><b>' + occ.length + '<em>/' + act.length + '</em></b><small>' + (free.length ? 'Libre: ' + esc(free.map(function (r) { return r.nombre; }).join(', ')) : 'Casa completa') + '</small></span></button>' +
        '<button type="button" class="kpi" data-go="cob"><span><small>Cobrado en ' + MES_LARGO[+ym.slice(5) - 1] + '</small><b>' + money(mesOk) + '</b><small>de ' + money(mesTot) + ' previstos</small><i class="kbar"><i style="width:' + (mesTot ? mesOk * 100 / mesTot : 0) + '%"></i></i></span></button>' +
        '<button type="button" class="kpi' + (venc.length ? ' bad' : '') + '" data-go="cob"><span><small>Vencido sin cobrar</small><b>' + money(vencTot) + '</b><small>' + (venc.length ? venc.length + ' cobro' + (venc.length > 1 ? 's' : '') + ' atrasado' + (venc.length > 1 ? 's' : '') : 'Todo al día') + '</small></span></button>' +
        '<button type="button" class="kpi' + (incA.length ? ' warn' : '') + '" data-go="inc"><span><small>Incidencias abiertas</small><b>' + incA.length + '</b><small>' + (incA.length ? 'Pendientes de resolver' : 'Nada pendiente') + '</small></span></button>' +
      '</div>' +
      '<div class="rgrid">' +
        '<section class="card"><h3>Ocupación del curso ' + B.courseLabel(y) + '</h3><p class="hint">Habitaciones ocupadas cada mes (a día 15).</p>' + occChart + '</section>' +
        '<section class="card"><h3>Cobros del curso ' + B.courseLabel(y) + '</h3><p class="hint">Mensualidades por mes, en miles de euros.</p>' + payChart +
          '<p class="legend2"><span><i class="lg ok"></i>Cobrado</span><span><i class="lg pe"></i>Pendiente</span><span><i class="lg ve"></i>Vencido</span></p></section>' +
      '</div>' +
      '<div class="rgrid">' +
        '<section class="card"><h3>Cobros atrasados</h3>' + list(venc.slice(0, 5).map(function (x) {
          return '<div class="crow-w"><button type="button" class="crow" data-go="cob"><span><b>' + who(x) + '</b><small>' + esc(x.concepto) + ' · venció ' + fmt(x.vence) + '</small></span>' + chip('vencido', money(x.importe)) + '</button>' + payMini(x) + '</div>';
        }), '<span class="ok-msg">Nadie debe nada.</span>') + (venc.length > 5 ? '<button type="button" class="btn plain sm rmore" data-go="cob">Ver los ' + venc.length + ' atrasados</button>' : '') + (prox.length ? '<h4 class="rsub warn">Por vencer · próximos 10 días · ' + prox.length + ' · ' + money(prox.reduce(function (t2, x) { return t2 + num(x.importe); }, 0)) + '</h4>' + prox.map(function (x) {
          return '<div class="crow-w"><button type="button" class="crow" data-go="cob"><span><b>' + who(x) + '</b><small>' + esc(x.concepto) + ' · ' + fmt(x.vence) + ' · <b class="cuando">' + cuando(x.vence) + '</b></small></span>' + chip('pendiente', money(x.importe)) + '</button>' + payMini(x) + '</div>';
        }).join('') : '') + '</section>' +
        '<section class="card"><h3>Incidencias</h3>' + list(incA.slice(0, 6).map(function (x) {
          var s = INC_ST[x.estado] || INC_ST.abierta;
          return '<button type="button" class="crow" data-i="' + x.id + '"><span><b>' + esc(x.titulo) + '</b><small>' + fmt(x.fecha) + ' · ' + esc(roomName(x.habitacionId)) + '</small></span>' + chip(s[0], s[1]) + '</button>';
        }), 'Sin incidencias abiertas.') + '</section>' +
      '</div>';
    $('ry').onchange = function () { box.dataset.ry = this.value; viewResumen(); };
    box.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { show(b.getAttribute('data-go')); }; });
    box.querySelectorAll('[data-ten]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-ten'); if (id) { detail = id; show('inq'); } }; });
    bindInc(box); bindSol(); bindCobros(box);
  }

  /* ---------- Solicitudes de admisión (enviadas desde la web) ---------- */
  var SOL = null;
  function loadSol() {
    return B.store.loadSolicitudes().then(function (list) {
      SOL = list;
      var nuevo = false;
      if (!document.body.classList.contains('ro')) SOL.forEach(function (x) {
        if (x.estado !== 'aceptada' || !x.inquilinaId || !tenant(x.inquilinaId)) return;
        var n = G.cobros.length, fx = fianzaAdmision(x.inquilinaId, +x.precio || (room(x.habitacionId) || {}).precio || 0, (x.admitida || x.actualizada || x.fecha || today()).slice(0, 10), x.id);
        if (G.cobros.length > n) { nuevo = true; if (x.pago && fx) fx.pago = x.pago; }
      });
      if (nuevo) { save(); if (tab === 'cob') viewCobros(); }
      renderTabs(); if (tab === 'sol') viewSolicitudes(); if (tab === 'res') viewResumen(); if (tab === 'ocu') viewOcupacion(); }, function (err) {
      if (err.status === 401) return A.expired(); SOL = SOL || [];
    });
  }
  var PRE_ST = { nueva: ['pendiente', 'Nueva'], aceptada: ['pagado', 'Admitida'], descartada: ['fin', 'Descartada'] };
  function edad(iso) {
    if (!iso) return null;
    var t = today(), y = +t.slice(0, 4) - +iso.slice(0, 4);
    if (t.slice(5) < iso.slice(5)) y--;
    return y >= 0 && y < 120 ? y : null;
  }
  var THUMBS = {};
  function loadThumbs(root) {
    root.querySelectorAll('[data-thumb]').forEach(function (el) {
      var path = el.getAttribute('data-thumb');
      function put(u) { el.style.backgroundImage = 'url(' + u + ')'; el.classList.add('ok'); }
      if (THUMBS[path]) return put(THUMBS[path]);
      B.store.fetchDoc(path).then(function (blob) { THUMBS[path] = URL.createObjectURL(blob); put(THUMBS[path]); }, function () { /* sin miniatura */ });
    });
  }
  /* ---------- Solicitudes de admisión (pestaña propia) ---------- */
  function viewSolicitudes() {
    if (!SOL) { box.innerHTML = '<div class="ghead"><h2>Solicitudes de admisión</h2></div><p class="hint">Cargando…</p>'; return; }
    var q = (box.dataset.sq || '').toLowerCase();
    var match = function (x) { return !q || [x.nombre, x.apellidos, x.telefono, x.universidad, x.habitacion, x.provincia].join(' ').toLowerCase().indexOf(q) >= 0; };
    var byDate = function (a, b) { return (a.fecha || '') < (b.fecha || '') ? 1 : -1; };
    var nuevas = SOL.filter(function (x) { return x.estado === 'nueva' && match(x); }).sort(byDate);
    var adm = SOL.filter(function (x) { return x.estado === 'aceptada' && match(x); }).sort(byDate);
    var desc = SOL.filter(function (x) { return x.estado === 'descartada' && match(x); }).sort(byDate);
    var conC = function (x) { return x.inquilinaId && G.contratos.some(function (c) { return c.inquilinaId === x.inquilinaId; }); };
    var admSin = adm.filter(function (x) { return !conC(x); }), admCon = adm.filter(conC);
    function block(cls, title, sub, list, empty) {
      return '<section class="card solblk ' + cls + '"><div class="prer-h"><h3>' + title + ' <span class="chip2 k-' + (cls === 'b-new' ? 'pendiente' : cls === 'b-adm' ? 'pagado' : 'fin') + '">' + list.length + '</span></h3></div>' +
        (sub ? '<p class="hint">' + sub + '</p>' : '') +
        (list.length ? byRoom(list) : '<p class="empty">' + empty + '</p>') + '</section>';
    }
    // Agrupadas por habitación, de la Nº 1 a la 8 (si varias piden la misma, se ven juntas)
    function byRoom(list) {
      var groups = rooms().map(function (rm) { return { r: rm, l: list.filter(function (x) { return x.habitacionId === rm.id; }) }; });
      var otras = list.filter(function (x) { return !room(x.habitacionId); });
      if (otras.length) groups.push({ r: null, l: otras });
      return groups.filter(function (g) { return g.l.length; }).map(function (g) {
        return '<div class="rgroup"><h4 class="rg-h">' + (g.r ? 'Nº ' + g.r.num + ' · ' + esc(g.r.nombre) : 'Sin habitación') +
          (g.l.length > 1 ? ' <span class="chip2 k-vencido">' + g.l.length + ' piden esta</span>' : '') + '</h4><div class="plist">' + g.l.map(solCard).join('') + '</div></div>';
      }).join('');
    }
    box.innerHTML = '<div class="ghead"><h2>Solicitudes de admisión</h2><div class="gtools"><input type="search" id="sq" placeholder="Buscar por nombre, teléfono, universidad…" value="' + esc(box.dataset.sq || '') + '"></div></div>' +
      '<div class="tiles soltiles"><div class="t-new"><small>Por revisar</small><b>' + nuevas.length + '</b></div><div><small>Admitidas sin contrato</small><b>' + admSin.length + '</b></div>' +
      '<div><small>Ya con contrato</small><b>' + admCon.length + '</b></div><div><small>Descartadas</small><b>' + desc.length + '</b></div></div>' +
      block('b-new', 'Por revisar', 'Solicitudes nuevas desde la web. Ábrelas para admitir, descartar o escribir por WhatsApp.', nuevas, 'No hay solicitudes nuevas. 👌') +
      block('b-adm', 'Admitidas, pendientes de contrato', 'Ya son inquilinas; falta crear el contrato (y cobrar la fianza).', admSin, 'Ninguna pendiente de contrato.') +
      (admCon.length ? '<details class="card solfold"' + (q ? ' open' : '') + '><summary>Ya con contrato · ' + admCon.length + ' <span class="hint">(están en Inquilinas)</span></summary><div class="solfold-b">' + byRoom(admCon) + '</div></details>' : '') +
      (desc.length ? '<details class="card solfold"' + (q ? ' open' : '') + '><summary>Descartadas · ' + desc.length + '</summary><div class="solfold-b">' + byRoom(desc) + '</div></details>' : '');
    $('sq').oninput = function () { box.dataset.sq = this.value; var pos = this.selectionStart; viewSolicitudes(); $('sq').focus(); $('sq').setSelectionRange(pos, pos); };
    bindSol();
  }
  function solCard(x) {
    var st = PRE_ST[x.estado] || PRE_ST.nueva, ig = String(x.instagram || '').replace(/^@+/, ''), ed = x.edad || edad(x.nacimiento);
    var img = x.doc && x.doc.tipo !== 'pdf';
    return '<div class="pcard" role="button" tabindex="0" data-sol="' + esc(x.id) + '">' +
      (x.doc ? '<span class="pthumb' + (img ? '' : ' pdf') + '"' + (docsOf(x).length > 1 ? ' data-n="' + docsOf(x).length + '"' : '') + (img ? ' data-thumb="' + esc(x.doc.path) + '"' : '') + '>' + (img ? '' : 'PDF') + '</span>' : '') +
      '<span class="pinfo"><b>' + esc(x.nombre + ' ' + x.apellidos) + (ed !== null ? ' <em>' + ed + ' años</em>' : '') + '</b>' +
      '<small class="stamp">Recibida el ' + fmtDT(x.fecha) + '</small>' +
      '<small>' + esc(x.universidad) + (x.estudios ? ' · ' + esc(x.estudios) : '') + '</small>' +
      '<small>' + esc([[x.provincia, x.pais].filter(Boolean).join(', '), x.documento ? (x.tipoDoc || 'Doc.') + ' ' + x.documento : ''].filter(Boolean).join(' · ')) + '</small>' +
      '<small>' + esc(x.habitacion) + ' · ' + esc(x.periodo && x.periodo.titulo || '') + (x.habitacionOriginal ? ' <em class="porig">(pidió ' + esc(x.habitacionOriginal) + ')</em>' : '') + '</small>' +
      (x.mensaje ? '<small class="pmsg">«' + esc(x.mensaje.slice(0, 120)) + (x.mensaje.length > 120 ? '…' : '') + '»</small>' : '') +
      '<span class="prow">' + chip(st[0], st[1] + (x.pago ? ' · enlace enviado' : '')) +
      (ig ? '<a class="pig" href="https://instagram.com/' + encodeURIComponent(ig) + '" target="_blank" rel="noopener">@' + esc(ig) + '</a>' : '') + '</span></span></div>';
  }
  function bindSol() {
    box.querySelectorAll('[data-sol]').forEach(function (b) {
      b.onclick = function (e) { if (e.target.closest('a')) return; solDialog(b.getAttribute('data-sol')); };
      b.onkeydown = function (e) { if (e.key === 'Enter') solDialog(b.getAttribute('data-sol')); };
    });
    loadThumbs(box);
  }
  // Recordatorio en el Panel de control: solicitudes vivas (nuevas primero) en carrusel.
  function solResumenHtml() {
    if (!SOL) return '';
    var act = SOL.filter(function (x) { return x.estado !== 'descartada'; });
    if (!act.length) return '';
    act = act.filter(function (x) { return x.estado === 'nueva'; }).concat(act.filter(function (x) { return x.estado !== 'nueva'; }));
    var n = act.filter(function (x) { return x.estado === 'nueva'; }).length;
    return '<section class="card solres' + (n ? ' hot' : '') + '"><div class="prer-h"><h3>Solicitudes de admisión <span class="chip2 k-' + (n ? 'pendiente' : 'pagado') + '">' +
      (n ? n + (n > 1 ? ' nuevas por revisar' : ' nueva por revisar') : act.length + ' en curso') + '</span></h3>' +
      '<button type="button" class="mini" data-go="sol">Ver todas →</button></div>' +
      '<div class="solcar">' + act.map(solCard).join('') + '</div>' +
      (act.length > 1 ? '<p class="hint solhint">Desliza para ver las ' + act.length + ' →</p>' : '') + '</section>';
  }
  function docsOf(x) { return x.docs && x.docs.length ? x.docs : x.doc ? [x.doc] : []; }
  function waPhone(t) { var d = String(t || '').replace(/\D/g, ''); if (d.indexOf('00') === 0) d = d.slice(2); if (d.length === 9) d = '34' + d; return d; }
  function uniToTenant(u) { return ['Universidad Loyola Andalucía', 'Universidad Pablo de Olavide', 'Universidad de Sevilla', 'Máster'].indexOf(u) >= 0 ? u : (u ? 'Otra' : ''); }
  function solDialog(id) {
    var x = SOL.filter(function (o) { return o.id === id; })[0]; if (!x) return;
    var st = PRE_ST[x.estado] || PRE_ST.nueva, ig = String(x.instagram || '').replace(/^@+/, '');
    var fianza = +x.precio || (room(x.habitacionId) || {}).precio || 0;
    var row = function (k, v) { return v ? '<dt>' + k + '</dt><dd>' + v + '</dd>' : ''; };
    var payMsg = x.pago ? 'Hola ' + x.nombre + ', te escribimos de BSL. Te hemos admitido para la habitación ' + x.habitacion + ' (' + (x.periodo && x.periodo.titulo || '') + '). Para confirmarla, paga la fianza de ' + money(x.pago.importe) + ' (equivalente a 1 mes de alquiler) en este enlace seguro: ' + x.pago.url + '\n\nO, si lo prefieres, por transferencia a BBVA · IBAN ' + IBAN + ' (en el concepto pon tu nombre y «fianza ' + x.habitacion + '»).' : '';
    dlg.innerHTML = '<form method="dialog" class="dform"><div class="dh"><h3>Solicitud de admisión</h3><button type="button" class="dx" aria-label="Cerrar">✕</button></div>' +
      '<div class="dbody sol">' +
      '<div class="sol-top"><div><b>' + esc(x.nombre + ' ' + x.apellidos) + '</b><small>Recibida el ' + fmtDT(x.fecha) + (x.admitida ? ' · Admitida el ' + fmtDT(x.admitida) : '') + (x.pago && x.pago.fecha ? ' · Pago solicitado el ' + fmtDT(x.pago.fecha) : '') + '</small></div>' + chip(st[0], st[1]) + '</div>' +
      '<dl class="sol-dl">' +
      '<dt>Habitación</dt><dd><span id="sol-hab-v">' + esc(x.habitacion) + ' · ' + money(x.precio) + '/mes' + (x.habitacionOriginal ? '<small>Pidió al principio: ' + esc(x.habitacionOriginal) + '</small>' : '') + '</span>' +
        (x.estado !== 'descartada' ? ' <button type="button" class="mini edit-only" id="sol-hab">Cambiar habitación</button>' : '') +
        '<span id="sol-hab-f" hidden><select id="sol-hab-s">' + rooms().map(function (rm) { return '<option value="' + esc(rm.id) + '"' + (rm.id === x.habitacionId ? ' selected' : '') + '>Nº ' + rm.num + ' · ' + esc(rm.nombre) + ' · ' + money(B.priceFor(rm, (x.periodo && x.periodo.desde) || today())) + '/mes</option>'; }).join('') +
        '</select> <button type="button" class="mini" id="sol-hab-ok">Guardar</button> <button type="button" class="mini" id="sol-hab-no">Cancelar</button></span></dd>' +
      row('Periodo', esc(x.periodo && x.periodo.titulo || '') + '<small>' + fmt(x.periodo && x.periodo.desde) + ' → ' + fmt(x.periodo && x.periodo.hasta) + '</small>') +
      row('Estudia', esc(x.universidad) + (x.estudios ? '<small>' + esc(x.estudios) + '</small>' : '')) +
      row('Teléfono', '<a href="tel:' + esc(x.telefono) + '">' + esc(x.telefono) + '</a>') +
      row('Email', x.email ? '<a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a>' : '') +
      row('Instagram', ig ? '<a href="https://instagram.com/' + encodeURIComponent(ig) + '" target="_blank" rel="noopener">@' + esc(ig) + '</a>' : '') +
      row('Edad', x.edad ? x.edad + ' años' : edad(x.nacimiento) !== null ? edad(x.nacimiento) + ' años<small>Nacida el ' + fmt(x.nacimiento) + '</small>' : '') +
      row('Procedencia', esc([x.provincia, x.pais].filter(Boolean).join(', '))) +
      row('Documento', x.documento ? esc((x.tipoDoc || '') + ' ' + x.documento) : '') +
      row('Familiar', esc(x.familiar) + (x.familiarTel ? '<small>' + esc(x.familiarTel) + '</small>' : '')) +
      row('Mensaje', esc(x.mensaje)) +
      '</dl>' +
      (docsOf(x).length ? '<div class="sol-docs">' + docsOf(x).map(function (d, i) {
        return d.tipo === 'pdf' ? '<button type="button" class="sol-docpdf" data-opendoc="' + i + '">PDF<small>' + esc(d.nombre || 'Documento') + '</small></button>'
          : '<button type="button" class="sol-docimg" data-opendoc="' + i + '" data-thumb="' + esc(d.path) + '" aria-label="Abrir ' + esc(d.nombre || 'foto') + '"></button>';
      }).join('') + '</div><small class="hint">' + esc(x.tipoDoc || 'Documento') + ': pulsa en cada archivo para abrirlo.</small>' : '') +
      (x.pago ? '<div class="sol-pay"><b>Enlace de pago · ' + money(x.pago.importe) + '</b><input type="text" readonly value="' + esc(x.pago.url) + '" id="sol-url">' +
        '<div class="sol-row"><button type="button" class="btn plain sm" id="sol-copy">Copiar enlace</button>' +
        '<a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(x.telefono) + '?text=' + encodeURIComponent(payMsg) + '">Enviar por WhatsApp</a></div></div>' : '') +
      (x.estado === 'aceptada' ? ibanBox({ nombre: x.nombre, apellidos: x.apellidos, telefono: x.telefono }, 'la fianza de la habitación ' + x.habitacion, fianza) : '') +
      '<p class="derr" id="sol-err" hidden></p>' +
      '</div><div class="dfoot sol-actions edit-only">' +
      (x.estado !== 'descartada' ? '<button type="button" class="btn plain danger" id="sol-no">Descartar</button>' : '<button type="button" class="btn plain" id="sol-re">Recuperar</button><button type="button" class="btn plain danger" id="sol-del">Eliminar</button>') +
      '<div class="sol-row">' +
      '<a class="btn plain sm" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(x.telefono) + '?text=' + encodeURIComponent('Hola ' + x.nombre + ', te escribimos de BSL. Hemos recibido tu solicitud de admisión para la habitación ' + x.habitacion + '.') + '">WhatsApp</a>' +
      (x.estado !== 'aceptada' ? '<button type="button" class="btn sm" id="sol-ok">Admitir como inquilina</button>' : '') +
      (x.estado === 'aceptada' ? (x.inquilinaId && tenant(x.inquilinaId) && G.contratos.some(function (c) { return c.inquilinaId === x.inquilinaId; })
        ? '<button type="button" class="btn plain sm" id="sol-ten">Ver inquilina y contrato</button>'
        : '<button type="button" class="btn sm" id="sol-con">📄 ' + (x.inquilinaId && tenant(x.inquilinaId) ? 'Crear contrato' : 'Crear ficha y contrato') + '</button>') : '') +
      (x.estado === 'aceptada' ? '<button type="button" class="btn sm" id="sol-pay">' + (x.pago ? 'Solicitar pago de nuevo' : 'Solicitar pago de la fianza (' + money(fianza) + ')') + '</button>' : '') +
      '</div></div></form>';
    var err = function (m) { var p = $('sol-err'); p.textContent = m; p.hidden = !m; if (m) p.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    dlg.querySelector('.dx').onclick = function () { dlg.close(); };
    loadThumbs(dlg);
    dlg.querySelectorAll('[data-opendoc]').forEach(function (b) { b.onclick = function () {
      var d = docsOf(x)[+b.getAttribute('data-opendoc')], w = window.open('', '_blank');
      B.store.fetchDoc(d.path).then(function (blob) { var u = URL.createObjectURL(blob); if (w) w.location.href = u; else window.location.href = u; },
        function (e) { if (w) w.close(); if (e.status === 401) return A.expired(); err(e.message); });
    }; });
    if ($('sol-copy')) $('sol-copy').onclick = function () {
      var inp = $('sol-url'); inp.select();
      (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).then(function () { $('sol-copy').textContent = '¡Copiado!'; }, function () { document.execCommand('copy'); $('sol-copy').textContent = '¡Copiado!'; });
    };
    function setEstado(estado, extra) {
      return B.store.updateSolicitud(Object.assign({ id: x.id, estado: estado }, extra || {})).then(function (upd) {
        SOL = SOL.map(function (o) { return o.id === upd.id ? upd : o; }); renderTabs(); return upd;
      });
    }
    if ($('sol-hab')) {
      $('sol-hab').onclick = function () { this.hidden = true; $('sol-hab-v').hidden = true; $('sol-hab-f').hidden = false; $('sol-hab-s').focus(); };
      $('sol-hab-no').onclick = function () { solDialog(x.id); };
      $('sol-hab-ok').onclick = function () {
        var rm = room($('sol-hab-s').value); if (!rm || rm.id === x.habitacionId) return solDialog(x.id);
        var pNew = B.priceFor(rm, (x.periodo && x.periodo.desde) || today());
        var b = this; b.disabled = true; b.textContent = 'Guardando…';
        B.store.updateSolicitud({ id: x.id, habitacionId: rm.id, habitacion: rm.nombre, precio: pNew, gastos: rm.gastos }).then(function (upd) {
          SOL = SOL.map(function (o) { return o.id === upd.id ? upd : o; });
          // Si ya estaba admitida y la fianza aún no se ha pagado, se ajusta al precio de la nueva habitación
          var fx = x.inquilinaId && G.cobros.filter(function (c) { return c.tipo === 'fianza' && !c.pagado && !c.contratoId && c.inquilinaId === x.inquilinaId; })[0];
          if (fx && num(fx.importe) !== num(pNew)) { fx.importe = num(pNew); delete fx.pago; save(); }
          refresh(); solDialog(x.id);
        }, function (e) { b.disabled = false; b.textContent = 'Guardar'; if (e.status === 401) return A.expired(); err(e.message); });
      };
    }
    if ($('sol-con')) $('sol-con').onclick = function () {
      if (x.inquilinaId && tenant(x.inquilinaId)) return contractForm(x.inquilinaId, null, solPreset());
      // Se borró su ficha: se crea de nuevo con los datos de la solicitud y se abre el contrato
      var t = newTenant(), b = this; b.disabled = true;
      setEstado('aceptada', { inquilinaId: t.id }).then(function () { x.inquilinaId = t.id; contractForm(t.id, null, solPreset()); }, function (e) { b.disabled = false; err(e.message); });
    };
    if ($('sol-ten')) $('sol-ten').onclick = function () { dlg.close(); detail = x.inquilinaId; show('inq'); };
    if ($('sol-no')) $('sol-no').onclick = function () {
      if (!window.confirm('¿Descartar esta solicitud?')) return;
      setEstado('descartada').then(function () { dlg.close(); refresh(); }, function (e) { err(e.message); });
    };
    if ($('sol-re')) $('sol-re').onclick = function () { setEstado('nueva').then(function () { solDialog(x.id); }, function (e) { err(e.message); }); };
    if ($('sol-del')) $('sol-del').onclick = function () {
      Promise.resolve(window.confirm('¿Eliminar para siempre la solicitud de ' + x.nombre + ' ' + x.apellidos + '? No se puede deshacer.')).then(function (ok) {
        if (!ok) return;
        B.store.updateSolicitud({ id: x.id, borrar: true }).then(function () {
          SOL = SOL.filter(function (o) { return o.id !== x.id; }); renderTabs(); dlg.close();
          refresh();
        }, function (e) { if (e.status === 401) return A.expired(); err(e.message); });
      });
    };
    // Ficha de inquilina a partir de la solicitud (al admitir, o de nuevo si se borró la ficha)
    function newTenant() {
      var t = { id: uid(), creada: today(), creadaEn: now(), nombre: x.nombre, apellidos: x.apellidos, doc: x.documento, nacimiento: x.nacimiento, telefono: x.telefono, email: x.email,
        universidad: uniToTenant(x.universidad), estudios: [x.universidad !== uniToTenant(x.universidad) ? x.universidad : '', x.estudios].filter(Boolean).join(' · '),
        nacionalidad: x.pais, direccion: [x.provincia, x.pais].filter(Boolean).join(', '),
        emergNombre: x.familiar, emergTelefono: x.familiarTel, notas: [ig ? 'Instagram: @' + ig : '', x.mensaje ? 'Mensaje: ' + x.mensaje : ''].filter(Boolean).join('\n') };
      G.inquilinas.push(t); fianzaAdmision(t.id, fianza, today(), x.id); save();
      return t;
    }
    function solPreset() {
      return { habitacionId: x.habitacionId, desde: x.periodo && x.periodo.desde, hasta: x.periodo && x.periodo.hasta, fromSol: true,
        docs: docsOf(x).map(function (d, i) { return { id: uid(), nombre: (x.tipoDoc || 'Documento') + (docsOf(x).length > 1 ? ' ' + (i + 1) : ''), tipo: d.tipo, path: d.path, fecha: today() }; }) };
    }
    if ($('sol-ok')) $('sol-ok').onclick = function () {
      // Crea la inquilina con sus datos y abre el contrato con la habitación, fechas y el DNI adjunto
      var t = newTenant();
      setEstado('aceptada', { inquilinaId: t.id }).then(function () {
        dlg.close(); detail = t.id; show('inq');
        contractForm(t.id, null, solPreset());
      }, function (e) { err(e.message); });
    };
    if ($('sol-pay')) $('sol-pay').onclick = function () {
      var b = this; b.disabled = true; b.textContent = 'Generando…'; err('');
      B.store.crearPago({ id: x.id, importe: fianza, concepto: 'Fianza habitación ' + x.habitacion + ' · BSL · ' + x.nombre + ' ' + x.apellidos })
        .then(function (url) {
          var fx = x.inquilinaId && tenant(x.inquilinaId) ? fianzaAdmision(x.inquilinaId, fianza, (x.admitida || x.actualizada || today()).slice(0, 10), x.id) : null;
          if (fx && !fx.pagado) { fx.pago = { url: url, importe: fianza, fecha: now() }; save(); }
          return setEstado('aceptada', { pago: { url: url, importe: fianza } });
        })
        .then(function () { solDialog(x.id); }, function (e) { b.disabled = false; b.textContent = 'Solicitar pago'; if (e.status === 401) return A.expired(); err(e.message); });
    };
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  }

  /* ---------- Inquilinas ---------- */
  var TENANT_FIELDS = [
    { k: 'nombre', label: 'Nombre' }, { k: 'apellidos', label: 'Apellidos' },
    { k: 'doc', label: 'DNI / NIE / Pasaporte' }, { k: 'nacimiento', label: 'Fecha de nacimiento', type: 'date' },
    { k: 'telefono', label: 'Teléfono', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' },
    { k: 'nacionalidad', label: 'Nacionalidad' }, { k: 'universidad', label: 'Universidad', type: 'select', opts: [['', '—'], ['Universidad Loyola Andalucía', 'Universidad Loyola Andalucía'], ['Universidad Pablo de Olavide', 'Universidad Pablo de Olavide'], ['Universidad de Sevilla', 'Universidad de Sevilla'], ['Máster', 'Máster'], ['Otra', 'Otra']] },
    { k: 'estudios', label: 'Estudios / curso', wide: true },
    { k: 'emergNombre', label: 'Contacto de emergencia (madre, padre…)' }, { k: 'emergTelefono', label: 'Teléfono de emergencia', type: 'tel' },
    { k: 'direccion', label: 'Dirección familiar', wide: true },
    { k: 'notas', label: 'Notas', type: 'textarea' }
  ];
  function viewTenants() {
    if (detail) return viewTenant(detail);
    var q = (box.dataset.q || '').toLowerCase();
    var list = G.inquilinas.filter(function (t) { return !q || (fullName(t) + ' ' + (t.telefono || '') + ' ' + (t.doc || '')).toLowerCase().indexOf(q) >= 0; })
      .map(function (t) { var c = activeContract(t.id), r = c && room(c.habitacionId); return { t: t, c: c, n: r ? r.num : 99 }; })
      .sort(function (a, b) { return (a.n - b.n) || fullName(a.t).localeCompare(fullName(b.t)); });
    box.innerHTML = '<div class="ghead"><h2>Inquilinas</h2><div class="gtools"><input type="search" id="q" placeholder="Buscar por nombre, teléfono o DNI" value="' + esc(box.dataset.q || '') + '"><button class="btn" type="button" id="new-t">+ Nueva inquilina</button></div></div>' +
      (list.length ? '<section class="card tt-card"><table class="tt"><thead><tr><th>Habitación</th><th>Inquilina</th><th>Entrada</th><th>Salida</th><th>Estudia en</th><th>Estado</th></tr></thead><tbody>' +
        pageOf(list, 'inq', 20).map(function (x) {
          var t = x.t, c = x.c, d = debt(t.id), r = c && room(c.habitacionId);
          return '<tr class="tcard" data-id="' + t.id + '" tabindex="0">' +
            '<td class="t-h">' + (r ? '<b>' + r.num + '</b> ' + esc(r.nombre) + '<span class="t-hd"> · ' + fmt(c.desde) + ' → ' + fmt(c.hasta) + '</span>' : '<span class="muted">Sin contrato</span>') + '</td>' +
            '<td class="t-n"><b>' + esc(fullName(t)) + '</b>' + (t.telefono ? '<small>' + esc(t.telefono) + '</small>' : '') + '</td>' +
            '<td class="t-d">' + (c ? fmt(c.desde) : '—') + '</td><td class="t-d">' + (c ? fmt(c.hasta) : '—') + '</td>' +
            '<td class="t-u">' + esc(t.universidad || '—') + '</td>' +
            '<td class="t-e">' + (d ? chip('vencido', 'Debe ' + money(d)) : chip('pagado', 'Al día')) + '</td></tr>';
        }).join('') + '</tbody></table></section>' + pager('inq', list.length, 20) : '<p class="empty">Todavía no hay inquilinas. Pulsa <b>+ Nueva inquilina</b> para dar de alta la primera.</p>');
    $('q').oninput = function () { box.dataset.q = this.value; PAGES.inq = 0; var pos = this.selectionStart; viewTenants(); $('q').focus(); $('q').setSelectionRange(pos, pos); };
    $('new-t').onclick = function () {
      openForm({ title: 'Nueva inquilina', fields: TENANT_FIELDS, values: {}, ok: 'Crear', onSave: function (v) {
        if (!v.nombre) return 'Pon al menos el nombre.';
        v.id = uid(); v.creada = today(); v.creadaEn = now(); G.inquilinas.push(v); save(); detail = v.id; show('inq');
      } });
    };
    box.querySelectorAll('.tcard').forEach(function (b) {
      b.onclick = function () { detail = b.getAttribute('data-id'); PAGES.cobT = 0; PAGES.incT = 0; show('inq'); };
      b.onkeydown = function (e) { if (e.key === 'Enter') b.onclick(); };
    });
  }

  /* ---------- Pago por transferencia ---------- */
  function conc(x) { return String(x.concepto || '').replace(/ \(admisión\)$/, '').toLowerCase(); }
  var IBAN = 'ES89 0182 0401 8302 0155 6275';
  function transMsg(t, concepto, imp) {
    return 'Hola ' + ((t && t.nombre) || '') + ', te escribimos de BSL. Puedes pagar ' + concepto + (imp ? ' (' + money(imp) + ')' : '') +
      ' por transferencia a:\nBBVA · IBAN ' + IBAN + '\nEn el concepto pon por favor: ' + (t ? fullName(t) : '') + ' · ' + concepto + '.\nGracias.';
  }
  // Caja con el IBAN; si hay inquilina con teléfono, botón para mandarle los datos por WhatsApp
  function ibanBox(t, concepto, imp, id) {
    return '<div class="iban"' + (id ? ' id="' + id + '"' : '') + '><span><small>Transferencia · BBVA</small><b>' + IBAN + '</b></span><span class="sol-row">' +
      '<button type="button" class="btn plain sm" data-copy="' + IBAN.replace(/ /g, '') + '">Copiar IBAN</button>' +
      (t && t.telefono && concepto ? '<a class="btn plain sm wa" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(t.telefono) + '?text=' + encodeURIComponent(transMsg(t, concepto, imp)) + '">Enviar por WhatsApp</a>' : '') +
      '</span></div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]'); if (!b) return;
    var v = b.getAttribute('data-copy'), done = function () { var o = b.textContent; b.textContent = '¡Copiado!'; setTimeout(function () { b.textContent = o; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(done, done); else done();
  });
  function payMini(x) { return '<button type="button" class="mini pay edit-only" data-paylink="' + x.id + '" title="Solicitar el pago (enlace con tarjeta o transferencia)">' + (x.pago ? '💳 Solicitado' : '💳 Solicitar') + '</button>'; }
  function cobroRows(list, showWho, key) {
    if (!list.length) return '<p class="empty">No hay cobros.</p>';
    list.sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
    var total = list.length, shown = pageOf(list, key);
    return '<table class="gt"><thead><tr><th>Vence</th>' + (showWho ? '<th>Inquilina</th><th>Habitación</th>' : '') + '<th>Concepto</th><th class="r">Importe</th><th>Estado</th><th></th></tr></thead><tbody>' +
      shown.map(function (x) {
        var st = cobroState(x), c = contract(x.contratoId), t = tenantOfCobro(x);
        var so = !c && x.solicitudId && SOL ? SOL.filter(function (o) { return o.id === x.solicitudId; })[0] : null;
        var hab = c ? roomName(c.habitacionId) : so ? roomName(so.habitacionId) + ' (sin contrato)' : '—';
        var meta = 'Vence ' + fmt(x.vence) + (showWho ? ' · ' + fullName(t) + ' · ' + hab : '');
        return '<tr><td class="c-v">' + fmt(x.vence) + '</td>' + (showWho ? '<td class="c-q">' + esc(fullName(t)) + '</td><td class="c-h">' + esc(hab) + '</td>' : '') +
          '<td class="c-c">' + esc(x.concepto) + '</td><td class="c-m">' + esc(meta) + '</td><td class="r c-i">' + money(x.importe) + '</td>' +
          '<td class="c-e">' + chip(st, st === 'pagado' ? 'Pagado ' + fmt(x.fechaPago) + (x.metodo ? ' · ' + x.metodo : '') : st === 'vencido' ? 'Vencido' : 'Pendiente') +
          (x.cobradoEn ? '<small class="stamp">Registrado el ' + fmtDT(x.cobradoEn) + '</small>' : x.pago && x.pago.fecha ? '<small class="stamp">Pago solicitado el ' + fmtDT(x.pago.fecha) + '</small>' : '') + '</td>' +
          '<td class="r c-a">' + (x.pagado ? '' : payMini(x)) +
          '<button type="button" class="mini" data-cobro="' + x.id + '">' + (x.pagado ? 'Editar' : 'Cobrar') + '</button></td></tr>';
      }).join('') + '</tbody></table>' + pager(key, total);
  }
  function bindCobros(root) {
    root.querySelectorAll('[data-paylink]').forEach(function (b) {
      b.onclick = function () {
        var x = G.cobros.filter(function (c) { return c.id === b.getAttribute('data-paylink'); })[0], t = x && tenantOfCobro(x);
        if (x) payDialog(t && t.id, [x.id]);
      };
    });
    root.querySelectorAll('[data-cobro]').forEach(function (b) {
      b.onclick = function () {
        var x = G.cobros.filter(function (c) { return c.id === b.getAttribute('data-cobro'); })[0];
        openForm({
          title: x.concepto + ' · ' + money(x.importe),
          fields: [{ k: 'pagado', label: 'Estado', type: 'select', opts: [['si', 'Pagado'], ['no', 'Pendiente']] },
            { k: 'fechaPago', label: 'Fecha de pago', type: 'date' },
            { k: 'metodo', label: 'Forma de pago', type: 'select', opts: METODOS.map(function (m) { return [m, m]; }) },
            { k: 'importe', label: 'Importe (€)', type: 'number', step: '0.01' }, { k: 'vence', label: 'Vence', type: 'date' },
            { k: 'nota', label: 'Nota', type: 'textarea' }],
          values: { pagado: 'si', fechaPago: x.fechaPago || today(), metodo: x.metodo || 'Transferencia', importe: x.importe, vence: x.vence, nota: x.nota || '' },
          ok: 'Guardar',
          onSave: function (v) {
            var eraPagado = !!x.pagado;
            x.pagado = v.pagado === 'si'; x.fechaPago = x.pagado ? v.fechaPago : ''; x.metodo = x.pagado ? v.metodo : '';
            if (x.pagado && !eraPagado) x.cobradoEn = now(); if (!x.pagado) delete x.cobradoEn; x.editadoEn = now();
            x.importe = v.importe; x.vence = v.vence; x.nota = v.nota;
            var cx = x.tipo === 'fianza' && contract(x.contratoId); if (cx && cx.fianzaEstado !== 'devuelta') cx.fianzaEstado = x.pagado ? 'cobrada' : 'pendiente';
            save(); refresh();
          },
          onDelete: function () { G.cobros = G.cobros.filter(function (c) { return c !== x; }); save(); refresh(); }
        });
      };
    });
  }

  /* ---------- Enlace de pago (Stripe) desde cualquier sitio ----------
     tid: inquilina (si falta, se elige en la ventana). sel: ids de cobros marcados de inicio. */
  function cobrosOf(tid) {
    var cids = G.contratos.filter(function (c) { return c.inquilinaId === tid; }).map(function (c) { return c.id; });
    return G.cobros.filter(function (x) { return !x.pagado && (cids.indexOf(x.contratoId) >= 0 || x.inquilinaId === tid); })
      .sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
  }
  function payDialog(tid, sel) {
    sel = sel || [];
    var conT = G.inquilinas.filter(function (t) { return G.contratos.some(function (c) { return c.inquilinaId === t.id; }); })
      .sort(function (a, b) { return fullName(a).localeCompare(fullName(b)); });
    if (!tid && !conT.length) { A.alert('Primero crea una inquilina con su contrato.'); return; }
    if (!tid) tid = conT[0].id;
    var t = tenant(tid), list = cobrosOf(tid);
    // Si no se ha marcado nada: lo vencido, o si no hay, el primer cobro pendiente
    if (!sel.length) { sel = list.filter(function (x) { return cobroState(x) === 'vencido'; }).map(function (x) { return x.id; }); if (!sel.length && list[0]) sel = [list[0].id]; }
    var old = list.filter(function (x) { return x.pago && sel.indexOf(x.id) >= 0; })[0];
    dlg.innerHTML = '<form method="dialog" class="dform"><div class="dh"><h3>Solicitar pago</h3><button type="button" class="dx" aria-label="Cerrar">✕</button></div>' +
      '<div class="dbody paydlg">' +
      '<label><span>Inquilina</span><select id="py-t">' + (conT.indexOf(t) < 0 ? '<option value="' + esc(tid) + '">' + esc(fullName(t)) + '</option>' : '') +
        conT.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === tid ? ' selected' : '') + '>' + esc(fullName(o)) + '</option>'; }).join('') + '</select></label>' +
      '<div><h4 class="subh">¿Qué quieres cobrar?</h4>' +
      (list.length ? '<div class="paylist">' + list.map(function (x) {
        var st = cobroState(x);
        return '<label class="payrow"><input type="checkbox" value="' + x.id + '"' + (sel.indexOf(x.id) >= 0 ? ' checked' : '') + '>' +
          '<span><b>' + esc(x.concepto) + '</b><small>Vence ' + fmt(x.vence) + (x.pago ? ' · ya tiene enlace de ' + money(x.pago.importe) : '') + '</small></span>' +
          (st === 'vencido' ? chip('vencido', 'Vencido') : '') + '<em>' + money(x.importe) + '</em></label>';
      }).join('') + '</div>' : '<p class="empty">No tiene cobros pendientes.</p>') +
      '<details class="payotro"' + (list.length ? '' : ' open') + '><summary>+ Otro importe (llave extra, daños…)</summary><div class="grid2">' +
        '<label><span>Concepto</span><input id="py-con" placeholder="Ej.: llave extra"></label><label><span>Importe (€)</span><input id="py-imp" type="number" step="0.01" min="0"></label></div></details></div>' +
      '<div class="paytot"><span>Total del enlace</span><b id="py-tot">0 €</b></div>' +
      '<div id="py-trans"></div>' +
      '<div id="py-out"></div>' +
      '<p class="derr" id="py-err" hidden></p>' +
      '</div><div class="dfoot"><span></span><button type="submit" class="btn" id="py-go">Solicitar pago</button></div></form>';
    dlg.querySelector('.dx').onclick = function () { dlg.close(); };
    var err = function (m) { var p = $('py-err'); p.textContent = m; p.hidden = !m; };
    function picked() { return Array.prototype.map.call(dlg.querySelectorAll('.paylist input:checked'), function (i) { return G.cobros.filter(function (x) { return x.id === i.value; })[0]; }).filter(Boolean); }
    function extra() { return { con: $('py-con').value.trim(), imp: num($('py-imp').value) }; }
    function total() { return picked().reduce(function (s, x) { return s + num(x.importe); }, 0) + extra().imp; }
    function conceptoSel() {
      var partes = picked().map(function (x) { return conc(x); }), ex = extra(); if (ex.imp && ex.con) partes.push(ex.con.toLowerCase());
      return partes.length > 2 ? partes.length + ' conceptos (' + partes.join(', ') + ')' : partes.join(' y ');
    }
    function upd() {
      var tt = total(); $('py-tot').textContent = money(tt); $('py-go').textContent = tt ? 'Solicitar pago de ' + money(tt) : 'Solicitar pago';
      $('py-trans').innerHTML = '<h4 class="subh">O que pague por transferencia</h4>' + ibanBox(t, conceptoSel() || 'lo pendiente', tt);
    }
    function showLink(url, imp, concepto) {
      var msg = 'Hola ' + (t.nombre || '') + ', te escribimos de BSL. Para pagar ' + concepto + ' (' + money(imp) + ') puedes usar este enlace seguro con tarjeta: ' + url +
        '\n\nO, si lo prefieres, por transferencia a BBVA · IBAN ' + IBAN + ' (en el concepto pon: ' + fullName(t) + ' · ' + concepto + ').';
      $('py-out').innerHTML = '<div class="sol-pay"><b>Enlace de pago · ' + money(imp) + '</b><input type="text" readonly value="' + esc(url) + '" id="py-url">' +
        '<div class="sol-row"><button type="button" class="btn plain sm" id="py-copy">Copiar enlace</button>' +
        (t.telefono ? '<a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(t.telefono) + '?text=' + encodeURIComponent(msg) + '">Enviar por WhatsApp</a>' : '') + '</div>' +
        '<small class="hint">El mensaje incluye también el IBAN por si prefiere transferencia. Cuando te pague, pulsa «Cobrar» en ese cobro y elige su forma de pago.</small></div>';
      $('py-copy').onclick = function () {
        var inp = $('py-url'), b = this; inp.select();
        (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).then(function () { b.textContent = '¡Copiado!'; }, function () { document.execCommand('copy'); b.textContent = '¡Copiado!'; });
      };
    }
    $('py-t').onchange = function () { payDialog(this.value, []); };
    dlg.querySelector('.dbody').addEventListener('input', upd);
    dlg.querySelector('.dbody').addEventListener('change', function (e) { if (e.target.id !== 'py-t') upd(); });
    upd();
    if (old && sel.length === 1) showLink(old.pago.url, old.pago.importe, old.concepto);
    dlg.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); err('');
      var ps = picked(), ex = extra(), tt = total();
      if (ex.imp && !ex.con) return err('Pon el concepto del otro importe.');
      if (tt < 1) return err('Marca algún cobro o pon un importe.');
      var partes = ps.map(function (x) { return conc(x); }); if (ex.imp) partes.push(ex.con.toLowerCase());
      var concepto = partes.length > 2 ? partes.length + ' conceptos (' + partes.join(', ') + ')' : partes.join(' y ');
      var c = activeContract(tid), hab = c && room(c.habitacionId) ? room(c.habitacionId).nombre : '';
      var b = $('py-go'); b.disabled = true; b.textContent = 'Generando…';
      B.store.crearPago({ id: tid, importe: Math.round(tt * 100) / 100, concepto: (concepto.charAt(0).toUpperCase() + concepto.slice(1)) + (hab ? ' · habitación ' + hab : '') + ' · BSL · ' + fullName(t) })
        .then(function (url) {
          var pago = { url: url, importe: Math.round(tt * 100) / 100, fecha: now() };
          if (ex.imp) { // el otro importe queda apuntado como cobro para no perderlo
            var nx = { id: uid(), contratoId: c ? c.id : '', inquilinaId: tid, tipo: 'otro', mes: today().slice(0, 7), concepto: ex.con, importe: ex.imp, vence: today(), pagado: false, creadoEn: now() };
            G.cobros.push(nx); ps.push(nx);
          }
          ps.forEach(function (x) { x.pago = pago; });
          save(); refresh(); b.disabled = false; upd();
          showLink(url, pago.importe, concepto);
          $('py-out').scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, function (e) { b.disabled = false; upd(); if (e.status === 401) return A.expired(); err(e.message); });
    });
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  }

  function contractForm(tid, c, preset) {
    var isNew = !c; c = c || {}; preset = preset || {};
    // Contrato nuevo: si la inquilina vino de una reserva de la web, se rellenan habitación y fechas con lo que pidió (se pueden cambiar)
    if (isNew && !preset.desde && SOL) {
      var sr = SOL.filter(function (x) { return x.inquilinaId === tid && x.estado === 'aceptada' && x.periodo; })[0];
      if (sr) preset = Object.assign({ habitacionId: sr.habitacionId, desde: sr.periodo.desde, hasta: sr.periodo.hasta, fromSol: true }, preset);
    }
    var y0 = B.courseOf(today()), yn = B.nextFullCourse(today());
    var r0 = room(c.habitacionId || preset.habitacionId) || rooms()[0];
    var quick = '<div class="quick"><span class="hint">Rellenar fechas:</span>' +
      [yn, yn + 1].map(function (y) { return '<button type="button" data-q="' + y + '">Curso ' + B.courseLabel(y) + '</button>'; }).join('') +
      (y0 !== null ? '<button type="button" data-q="resto">Desde hoy hasta 31 jul ' + (y0 + 1) + '</button>' : '') + '</div>' +
      (preset.fromSol ? '<p class="hint fromsol">✓ Habitación y fechas rellenadas con su reserva de la web. Puedes cambiarlas.</p>' : '');
    var f = openForm({
      title: isNew ? 'Nuevo contrato' : 'Editar contrato',
      fields: [
        { k: 'habitacionId', label: 'Habitación', type: 'select', wide: true, opts: rooms().map(function (r) { return [r.id, 'Nº ' + r.num + ' · ' + r.nombre]; }) },
        { k: 'q', type: 'html', html: quick },
        { k: 'desde', label: 'Entrada', type: 'date' }, { k: 'hasta', label: 'Salida', type: 'date' },
        { k: 'precio', label: 'Alquiler (€/mes)', type: 'number', step: '1' }, { k: 'gastos', label: 'Gastos (€/mes)', type: 'number', step: '1' },
        { k: 'fianza', label: 'Fianza (€)', type: 'number', step: '1' },
        { k: 'fianzaEstado', label: 'Fianza', type: 'select', opts: [['pendiente', 'Pendiente de cobrar'], ['cobrada', 'Cobrada'], ['devuelta', 'Devuelta']] },
        { k: 'diaPago', label: 'Día de pago de cada mes', type: 'number', step: '1' },
        { k: 'notas', label: 'Notas del contrato', type: 'textarea' },
        { k: 'pay', type: 'html', html: isNew ? '' : '<div class="payc edit-only"><button type="button" class="btn plain sm" id="c-pay">💳 Solicitar pago (fianza, mensualidades…)</button></div>' },
        { k: 'docs', type: 'html', html: '<div class="docs"><h4 class="subh">Documentos del contrato</h4><div id="c-docs"></div>' +
          '<label class="btn plain sm doc-add edit-only">+ Adjuntar PDF o fotos<input type="file" id="c-doc-in" accept="application/pdf,image/*" multiple hidden></label>' +
          '<p class="hint edit-only" id="c-doc-st">PDF o fotos, hasta 3 MB cada uno. Puedes adjuntar varios.</p></div>' }
      ],
      values: {
        habitacionId: c.habitacionId || (r0 && r0.id), desde: c.desde || preset.desde || '', hasta: c.hasta || preset.hasta || '',
        precio: c.precio != null ? c.precio : r0 && B.priceFor(r0, c.desde || preset.desde || today()), gastos: c.gastos != null ? c.gastos : r0 && r0.gastos,
        fianza: c.fianza != null ? c.fianza : r0 && B.priceFor(r0, c.desde || preset.desde || today()), fianzaEstado: c.fianzaEstado || 'pendiente', diaPago: c.diaPago || 5, notas: c.notas || ''
      },
      ok: isNew ? 'Crear contrato' : 'Guardar',
      onChange: function (e) {
        // Contrato nuevo: al cambiar habitación o fecha de entrada, precio y fianza del curso que toca
        if ((e.target.id === 'fx-habitacionId' || e.target.id === 'fx-desde') && isNew) setPrecio();
        liveClash();
      },
      onSave: function (v) {
        if (!v.desde || !v.hasta || v.desde > v.hasta) return 'Pon la fecha de entrada y la de salida (la salida después de la entrada).';
        var clash = G.contratos.filter(function (o) { return o.id !== c.id && o.habitacionId === v.habitacionId && o.desde <= v.hasta && o.hasta >= v.desde; })[0];
        if (clash) return 'Esa habitación ya tiene un contrato en esas fechas (' + fullName(tenant(clash.inquilinaId)) + ', ' + fmt(clash.desde) + ' → ' + fmt(clash.hasta) + '). Cambia la habitación o las fechas.';
        delete v.q; delete v.docs;
        Object.keys(v).forEach(function (k) { c[k] = v[k]; });
        c.docs = docs.slice();
        c.diaPago = Math.min(28, Math.max(1, num(v.diaPago) || 5));
        if (isNew) { c.id = uid(); c.inquilinaId = tid; c.creadoEn = now(); G.contratos.push(c); } else c.editadoEn = now();
        if (c.fianzaEstado === 'cobrada') G.cobros.forEach(function (x) { if (x.contratoId === c.id && x.tipo === 'fianza' && !x.pagado) { x.pagado = true; x.fechaPago = today(); x.cobradoEn = now(); } });
        genCobros(c); syncRooms(); save(); refresh();
      },
      needKey: 'Vas a borrar este contrato: la habitación quedará libre en la web y se quitarán sus cobros pendientes.',
      onDelete: isNew ? null : function () {
        G.contratos = G.contratos.filter(function (o) { return o !== c; });
        G.cobros = G.cobros.filter(function (x) { return x.contratoId !== c.id || x.pagado; });
        syncRooms(); save(); refresh();
      }
    });
    // Documentos adjuntos (contrato firmado, DNI…): se guardan en privado
    var docs = (c.docs || preset.docs || []).slice();
    function keepDocs() { if (!isNew) { c.docs = docs.slice(); save(); } }
    function drawDocs() {
      $('c-docs').innerHTML = docs.length ? docs.map(function (d, i) {
        return '<div class="doc"><span class="doc-ic">' + (d.tipo === 'pdf' ? 'PDF' : 'FOTO') + '</span>' +
          '<button type="button" class="doc-open" data-dopen="' + i + '">' + esc(d.nombre) + '<small>' + fmt(d.fecha) + '</small></button>' +
          '<button type="button" class="doc-del edit-only" data-ddel="' + i + '" aria-label="Quitar documento">✕</button></div>';
      }).join('') : '<p class="hint">Sin documentos adjuntos.</p>';
    }
    drawDocs();
    if ($('c-pay')) $('c-pay').onclick = function () {
      var fz = G.cobros.filter(function (x) { return x.contratoId === c.id && x.tipo === 'fianza' && !x.pagado; })[0];
      payDialog(tid, fz ? [fz.id] : []);
    };
    $('c-docs').onclick = function (e) {
      var o = e.target.closest('[data-dopen]'), d = e.target.closest('[data-ddel]');
      if (o) {
        var doc = docs[+o.getAttribute('data-dopen')], w = window.open('', '_blank');
        B.store.fetchDoc(doc.path).then(function (blob) {
          var u = URL.createObjectURL(blob);
          if (w) w.location.href = u; else window.location.href = u;
        }, function (err) { if (w) w.close(); if (err.status === 401) return A.expired(); A.alert(err.message); });
      }
      if (d && window.confirm('¿Quitar este documento del contrato?')) { docs.splice(+d.getAttribute('data-ddel'), 1); drawDocs(); keepDocs(); }
    };
    var readFile = readDocFile;
    $('c-doc-in').onchange = function () {
      var files = Array.prototype.slice.call(this.files || []), st = $('c-doc-st'), errs = [];
      this.value = '';
      if (!files.length) return;
      st.textContent = 'Subiendo ' + files.length + ' archivo' + (files.length > 1 ? 's' : '') + '…';
      files.reduce(function (p, file) {
        return p.then(function () {
          return readFile(file).then(function (f) {
            return B.store.uploadDoc(f.data).then(function (path) {
              docs.push({ id: uid(), nombre: file.name.slice(0, 120), tipo: f.tipo, path: path, fecha: today() });
              drawDocs();
            });
          }).catch(function (err) { if (err.status === 401) A.expired(); errs.push(err.message); });
        });
      }, Promise.resolve()).then(function () {
        keepDocs();
        st.textContent = errs.length ? errs.join(' ') : 'Listo. PDF o fotos, hasta 3 MB cada uno.';
      });
    };
    dlg.querySelector('.quick').onclick = function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return;
      var q = b.getAttribute('data-q');
      if (q === 'resto') { $('fx-desde').value = today(); $('fx-hasta').value = (y0 + 1) + '-07-31'; }
      else { var rg = B.periodRange('curso', +q); $('fx-desde').value = rg.from; $('fx-hasta').value = rg.to; }
      if (isNew) setPrecio();
      liveClash();
    };
    function setPrecio() { var r = room($('fx-habitacionId').value); if (!r) return; var p = B.priceFor(r, $('fx-desde').value || today()); $('fx-precio').value = p; $('fx-gastos').value = r.gastos; $('fx-fianza').value = p; }
    // Aviso al momento si la habitación ya tiene contrato en esas fechas (antes de pulsar el botón)
    function liveClash() {
      var h = $('fx-habitacionId').value, d1 = $('fx-desde').value, d2 = $('fx-hasta').value, p = $('fx-err');
      var cl = d1 && d2 && G.contratos.filter(function (o) { return o.id !== c.id && o.habitacionId === h && o.desde <= d2 && o.hasta >= d1; })[0];
      ['fx-habitacionId', 'fx-desde', 'fx-hasta'].forEach(function (k) { $(k).closest('label').classList.toggle('bad', !!cl); });
      var sb = dlg.querySelector('.dfoot [type=submit]'); if (sb) { sb.disabled = !!cl; sb.title = cl ? 'Fechas ocupadas por otro contrato' : ''; }
      if (cl) { $('fx-hasta').closest('label').after(p); p.style.gridColumn = '1 / -1'; p.textContent = 'Esa habitación ya tiene un contrato en esas fechas (' + fullName(tenant(cl.inquilinaId)) + ', ' + fmt(cl.desde) + ' → ' + fmt(cl.hasta) + '). Cambia la habitación o las fechas.'; p.hidden = false; }
      else if (/ya tiene un contrato/.test(p.textContent)) p.hidden = true;
    }
    liveClash();
    return f;
  }

  function viewTenant(id) {
    var t = tenant(id);
    if (!t) { detail = null; return viewTenants(); }
    var cs = G.contratos.filter(function (c) { return c.inquilinaId === id; }).sort(function (a, b) { return a.desde < b.desde ? 1 : -1; });
    var cids = cs.map(function (c) { return c.id; });
    var cob = G.cobros.filter(function (x) { return cids.indexOf(x.contratoId) >= 0 || x.inquilinaId === id; });
    var inc = G.incidencias.filter(function (x) { return x.inquilinaId === id; });
    var pend = cob.filter(function (x) { return !x.pagado; }).reduce(function (s, x) { return s + num(x.importe); }, 0);
    // Lo que toca pagar ya: vencido o que vence en 10 días (si no hay, el próximo cobro)
    var abiertos = cob.filter(function (x) { return !x.pagado; }).sort(function (a2, b2) { return a2.vence < b2.vence ? -1 : 1; });
    var ya = abiertos.filter(function (x) { return x.vence <= B.addDays(today(), 10); }); if (!ya.length && abiertos[0]) ya = [abiertos[0]];
    box.innerHTML = '<button type="button" class="back" id="back">← Inquilinas</button>' +
      '<div class="ghead"><h2>' + esc(fullName(t)) + '</h2><div class="gtools">' +
      (t.telefono ? '<a class="btn plain" href="https://wa.me/' + esc(String(t.telefono).replace(/\D/g, '').replace(/^(?!34)(\d{9})$/, '34$1')) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      '<button class="btn plain" type="button" id="edit-t">Editar datos</button><button class="btn edit-only" type="button" id="pay-t">💳 Solicitar pago</button></div></div>' +
      '<section class="card"><h3>Datos</h3><dl class="kv">' + TENANT_FIELDS.filter(function (f) { return t[f.k]; }).map(function (f) {
        var v = f.type === 'date' ? fmt(t[f.k]) : t[f.k];
        return '<div><dt>' + esc(f.label) + '</dt><dd>' + esc(v) + '</dd></div>';
      }).join('') + '</dl></section>' +
      '<section class="card"><div class="ch"><h3>Contratos</h3><button class="btn" type="button" id="new-c">+ Nuevo contrato</button></div>' +
      (cs.length ? cs.map(function (c) {
        var now = today(), st = c.hasta < now ? ['fin', 'Terminado'] : c.desde > now ? ['pendiente', 'Próximo'] : ['pagado', 'En curso'];
        return '<button type="button" class="crow" data-c="' + c.id + '"><span><b>' + esc(roomName(c.habitacionId)) + '</b><small>' + fmt(c.desde) + ' → ' + fmt(c.hasta) + ' · ' + money(c.precio) + ' + ' + money(c.gastos) + ' gastos · día ' + (c.diaPago || 5) + ((c.docs || []).length ? ' · 📎 ' + c.docs.length + ' doc.' : '') + '</small>' +
          '<small>Fianza ' + money(c.fianza) + ' · ' + esc({ pendiente: 'pendiente', cobrada: 'cobrada', devuelta: 'devuelta' }[c.fianzaEstado || 'pendiente']) + '</small>' +
          (c.creadoEn || c.editadoEn ? '<small class="stamp">' + (c.creadoEn ? 'Creado el ' + fmtDT(c.creadoEn) : '') + (c.editadoEn ? (c.creadoEn ? ' · ' : '') + 'Modificado el ' + fmtDT(c.editadoEn) : '') + '</small>' : '') + '</span>' + chip(st[0], st[1]) + '</button>';
      }).join('') : '<p class="empty">Sin contratos. Crea uno para asignarle habitación: la web la marcará ocupada y se generarán los cobros.</p>') + '</section>' +
      '<section class="card"><div class="ch"><h3>Cobros</h3><span class="hint">Pendiente: <b>' + money(pend) + '</b></span></div>' +
        ibanBox(t, ya.length ? ya.map(function (x) { return conc(x); }).join(' y ') : 'tu mensualidad', ya.reduce(function (s2, x) { return s2 + num(x.importe); }, 0)) + cobroRows(cob, false, 'cobT') + '</section>' +
      '<section class="card"><div class="ch"><h3>Incidencias</h3><button class="btn plain" type="button" id="new-i">+ Incidencia</button></div>' + incList(inc, 'incT') + '</section>' +
      '<div class="foot"><span class="hint">Alta: ' + (t.creadaEn ? fmtDT(t.creadaEn) : fmt(t.creada)) + '</span><button class="btn plain danger" type="button" id="del-t">Borrar inquilina</button></div>';
    $('back').onclick = function () { detail = null; show('inq'); };
    $('edit-t').onclick = function () {
      openForm({ title: 'Datos de ' + fullName(t), fields: TENANT_FIELDS, values: t, onSave: function (v) {
        if (!v.nombre) return 'Pon al menos el nombre.';
        Object.keys(v).forEach(function (k) { t[k] = v[k]; }); save(); refresh();
      } });
    };
    $('new-c').onclick = function () { contractForm(id, null); };
    $('pay-t').onclick = function () { payDialog(id, []); };
    box.querySelectorAll('[data-c]').forEach(function (b) { b.onclick = function () { contractForm(id, contract(b.getAttribute('data-c'))); }; });
    $('new-i').onclick = function () { incForm(null, { inquilinaId: id, habitacionId: (activeContract(id) || {}).habitacionId }); };
    bindInc(box); bindCobros(box);
    $('del-t').onclick = function () {
      confirmKey('Vas a borrar a ' + fullName(t) + ' con sus contratos y cobros. No se puede deshacer.').then(function (ok) { if (ok) delTenant(); });
    };
    function delTenant() {
      G.inquilinas = G.inquilinas.filter(function (x) { return x !== t; });
      G.contratos = G.contratos.filter(function (c) { return c.inquilinaId !== id; });
      G.cobros = G.cobros.filter(function (x) { return cids.indexOf(x.contratoId) < 0 && x.inquilinaId !== id; });
      G.incidencias.forEach(function (x) { if (x.inquilinaId === id) x.inquilinaId = ''; });
      syncRooms(); save(); detail = null; show('inq');
    }
  }

  /* ---------- Cobros ---------- */
  function viewCobros() {
    var f = box.dataset.cf || 'abiertos', sel = box.dataset.cm || 'cur';
    // Meses: de enero 2025 a diciembre de 2025 + 6 años (y cualquier otro mes que tenga cobros)
    var cur = today().slice(0, 7);
    var shift = function (ym, k) { var yy = +ym.slice(0, 4), mm = +ym.slice(5) + k; yy += Math.floor((mm - 1) / 12); mm = ((mm - 1) % 12 + 12) % 12 + 1; return yy + '-' + pad(mm); };
    var rel = { cur: cur, prev: shift(cur, -1), next: shift(cur, 1) };
    var meses = []; for (var ym = '2025-01'; ym <= '2031-12'; ym = shift(ym, 1)) meses.push(ym);
    var mesDe = function (x) { return x.mes || (x.vence || '').slice(0, 7); };
    G.cobros.forEach(function (x) { var m = mesDe(x); if (m && meses.indexOf(m) < 0) meses.push(m); }); meses.sort();
    if (sel === 'prox2') sel = 'cur';
    var lista = []; for (var k = 0; k <= 16; k++) lista.push(shift(cur, k));
    if (/^\d{4}-\d{2}$/.test(sel) && lista.indexOf(sel) < 0) lista.push(sel), lista.sort(); // mes elegido con el buscador
    var mesSel = rel[sel] || sel;
    var inMes = function (x) { return mesSel === 'todos' || mesDe(x) === mesSel; };
    var delMes = G.cobros.filter(inMes);
    var sum = function (arr) { return arr.reduce(function (s, x) { return s + num(x.importe); }, 0); };
    var prev = sum(delMes), cobrado = sum(delMes.filter(function (x) { return x.pagado; }));
    var vencidoTotal = sum(G.cobros.filter(function (x) { return cobroState(x) === 'vencido'; }));
    var list = delMes.filter(function (x) {
      var st = cobroState(x);
      return f === 'todos' || (f === 'abiertos' && st !== 'pagado') || f === st;
    });
    // Los vencidos de otros meses también salen en "Pendientes" para no perderlos de vista
    if (f === 'abiertos' || f === 'vencido') G.cobros.forEach(function (x) { if (!inMes(x) && cobroState(x) === 'vencido' && list.indexOf(x) < 0) list.push(x); });
    var opt = function (v, t) { return '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + t + '</option>'; };
    box.innerHTML = '<div class="ghead"><h2>Cobros</h2><div class="gtools"><select id="cm">' +
      opt('cur', 'Mes actual (' + mesLabel(rel.cur) + ')') + opt('prev', 'Mes pasado (' + mesLabel(rel.prev) + ')') + opt('next', 'Mes próximo (' + mesLabel(rel.next) + ')') +
      opt('todos', 'Todos los meses') + '<option disabled>──────────</option>' +
      // En el desplegable: el mes actual y los 16 siguientes (el buscador encuentra cualquier mes de 2025 a 2031)
      lista.map(function (m) { return opt(m, mesLabel(m) + (m === cur ? ' (mes actual)' : '')); }).join('') +
      '</select><span class="mq"><input type="search" id="cm-q" placeholder="Buscar mes: feb 2027…" autocomplete="off"><ul id="cm-l" class="mq-l" hidden></ul></span><button class="btn plain" type="button" id="new-x">+ Cobro manual</button><button class="btn edit-only" type="button" id="pay-x">💳 Solicitar pago</button></div></div>' +
      '<div class="tiles"><div><small>Previsto</small><b>' + money(prev) + '</b></div><div><small>Cobrado</small><b class="ok">' + money(cobrado) + '</b></div>' +
      '<div><small>Por cobrar</small><b>' + money(prev - cobrado) + '</b></div><div><small>Vencido (total)</small><b class="bad">' + money(vencidoTotal) + '</b></div></div>' +
      '<div class="seg2" id="cf">' + [['abiertos', 'Pendientes'], ['vencido', 'Vencidos'], ['pagado', 'Pagados'], ['todos', 'Todos']].map(function (o) {
        return '<button type="button" data-f="' + o[0] + '" aria-current="' + (o[0] === f) + '">' + o[1] + '</button>';
      }).join('') + '</div>' +
      ibanBox(null) + '<section class="card">' + cobroRows(list, true, 'cob') + '</section>';
    $('cm').onchange = function () { box.dataset.cm = this.value; PAGES.cob = 0; viewCobros(); };
    // Buscador de mes: «feb 2027», «febrero 27», «2027», «oct»…
    var nrm = function (t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
    var q = $('cm-q'), ul = $('cm-l');
    function hits() {
      var toks = nrm(q.value).split(/[\s\/.-]+/).filter(Boolean); if (!toks.length) return [];
      return meses.filter(function (m) {
        var words = nrm(mesLabel(m)).split(' '), yy = m.slice(0, 4);
        return toks.every(function (t) { return /^\d+$/.test(t) ? (yy.indexOf(t) === 0 || (t.length === 2 && yy.slice(2) === t) || +t === +m.slice(5)) : words.some(function (w) { return w.indexOf(t) === 0; }); });
      }).slice(0, 12);
    }
    function pick(m) { box.dataset.cm = m; PAGES.cob = 0; viewCobros(); }
    q.oninput = function () {
      var h = hits(); ul.hidden = !q.value.trim();
      ul.innerHTML = h.length ? h.map(function (m) { return '<li data-m="' + m + '">' + mesLabel(m) + (m === cur ? ' <small>(mes actual)</small>' : '') + '</li>'; }).join('') : '<li class="none">Ningún mes coincide</li>';
    };
    q.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); var h = hits(); if (h.length) pick(h[0]); } if (e.key === 'Escape') { q.value = ''; ul.hidden = true; } };
    ul.onmousedown = function (e) { var li = e.target.closest('[data-m]'); if (li) { e.preventDefault(); pick(li.getAttribute('data-m')); } };
    q.onblur = function () { setTimeout(function () { ul.hidden = true; }, 150); };
    $('cf').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) { box.dataset.cf = b.getAttribute('data-f'); PAGES.cob = 0; viewCobros(); } };
    $('pay-x').onclick = function () { payDialog(null, []); };
    $('new-x').onclick = function () {
      var opts = G.contratos.map(function (c) { return [c.id, fullName(tenant(c.inquilinaId)) + ' · ' + roomName(c.habitacionId)]; });
      if (!opts.length) { A.alert('Primero crea una inquilina con su contrato.'); return; }
      openForm({ title: 'Cobro manual', fields: [
        { k: 'contratoId', label: 'Inquilina', type: 'select', wide: true, opts: opts },
        { k: 'concepto', label: 'Concepto', wide: true, ph: 'Ej.: llave extra, reparación por daños…' },
        { k: 'importe', label: 'Importe (€)', type: 'number', step: '0.01' }, { k: 'vence', label: 'Vence', type: 'date' }],
        values: { vence: today() }, ok: 'Añadir',
        onSave: function (v) {
          if (!v.concepto || !v.importe) return 'Pon el concepto y el importe.';
          G.cobros.push({ id: uid(), contratoId: v.contratoId, tipo: 'otro', mes: v.vence.slice(0, 7), concepto: v.concepto, importe: v.importe, vence: v.vence, pagado: false, creadoEn: now() });
          save(); refresh();
        } });
    };
    bindCobros(box);
  }

  // PDF o foto → datos listos para subir (las fotos se reducen a 2000 px)
  function readDocFile(file) {
    return new Promise(function (res, rej) {
      var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf && !/^image\//.test(file.type)) return rej(new Error(file.name + ': solo PDF o fotos.'));
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('No se ha podido leer ' + file.name)); };
      fr.onload = function () {
        if (isPdf) {
          if (file.size > 3 * 1024 * 1024) return rej(new Error(file.name + ' pesa más de 3 MB.'));
          return res({ data: fr.result.replace(/^data:[^;]*;/, 'data:application/pdf;'), tipo: 'pdf' });
        }
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, 2000 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          res({ data: cv.toDataURL('image/jpeg', 0.82), tipo: 'img' });
        };
        img.onerror = function () { rej(new Error(file.name + ': formato de foto no admitido (usa JPG o PNG).')); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function openDoc(d) {
    var w = window.open('', '_blank');
    B.store.fetchDoc(d.path).then(function (blob) { var u = URL.createObjectURL(blob); if (w) w.location.href = u; else window.location.href = u; },
      function (e) { if (w) w.close(); if (e.status === 401) return A.expired(); A.alert(e.message); });
  }

  /* ---------- Consumos: facturas de suministros y reparto entre las inquilinas ---------- */
  var SUMIN = [['luz', 'Luz'], ['agua', 'Agua'], ['internet', 'Internet / fibra'], ['gas', 'Gas'], ['limpieza', 'Limpieza'], ['otro', 'Otro']];
  function supLabel(t) { return (SUMIN.filter(function (x) { return x[0] === t; })[0] || ['', 'Otro'])[1]; }
  function eachDay(a, b, fn) { for (var d = a; d <= b; d = B.addDays(d, 1)) fn(d); }
  function dayCount(a, b) { return Math.round((B.toDate(b) - B.toDate(a)) / 864e5) + 1; }
  function viewConsumos() {
    var cfg = G.consumosCfg, y0 = B.courseOf(today()), yDef = y0 !== null ? y0 : B.nextFullCourse(today()) - 1;
    var y = +(box.dataset.ky || yDef), P0 = y + '-09-01', P1 = (y + 1) + '-08-31';
    var modo = cfg.modo === 'habitaciones' ? 'habitaciones' : 'ocupantes';
    var cuotaFija = num(cfg.cuota) > 0 ? num(cfg.cuota) : null;
    var fact = G.consumos.filter(function (f) { return f.desde && f.hasta && f.desde <= P1 && f.hasta >= P0; })
      .sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
    var fijos = (cfg.fijos || []).filter(function (x) { return x && num(x.importe) > 0 && x.desde && x.desde <= P1 && (!x.hasta || x.hasta >= P0); });
    // Fecha de corte: hasta donde llegan las facturas subidas (para no comparar con cuotas de meses sin factura).
    // Si solo hay gastos fijos, hasta fin del mes en curso.
    var corte = fact.reduce(function (m, f) { return f.hasta > m ? f.hasta : m; }, '');
    if (!corte && fijos.length) { var hoy = today(); corte = hoy.slice(0, 8) + daysIn(+hoy.slice(0, 4), +hoy.slice(5, 7)); }
    if (corte > P1) corte = P1;
    // Los gastos fijos (limpieza, internet…) se convierten en una «factura» por mes, hasta la fecha de corte
    var gastos = fact.slice();
    if (corte) fijos.forEach(function (x) {
      for (var i = 0; i < 12; i++) {
        var yy = i < 4 ? y : y + 1, m = (i + 8) % 12 + 1, ini = yy + '-' + (m < 10 ? '0' : '') + m + '-01', fin = ini.slice(0, 8) + daysIn(yy, m);
        if (ini > corte || fin < x.desde || (x.hasta && ini > x.hasta)) continue;
        gastos.push({ tipo: x.tipo, importe: num(x.importe), desde: ini, hasta: fin, fijo: true, tope: corte });
      }
    });
    var nHab = rooms().filter(function (rm) { return rm.activa; }).length || 8;
    var conts = G.contratos.filter(function (c) { return c.desde <= P1 && c.hasta >= P0; });
    var per = {}; // por inquilina
    function slot(c) { var id = c.inquilinaId; return per[id] || (per[id] = { t: tenant(id), habs: [], dias: 0, aporta: 0, asignado: 0 }); }
    var sinAsignar = 0, totalPeriodo = 0, porTipo = {};
    var meses = {}; // 'YYYY-MM' -> { fact, sin, cuotas }
    function mm(d) { var k = d.slice(0, 7); return meses[k] || (meses[k] = { fact: 0, sin: 0, cuotas: 0 }); }
    gastos.forEach(function (f) {
      var bd = dayCount(f.desde, f.hasta), diario = num(f.importe) / bd;
      var a = f.desde < P0 ? P0 : f.desde, b = f.hasta > P1 ? P1 : f.hasta;
      if (f.fijo && b > f.tope) b = f.tope;
      eachDay(a, b, function (d) {
        totalPeriodo += diario; porTipo[f.tipo] = (porTipo[f.tipo] || 0) + diario;
        var md = mm(d); md.fact += diario;
        var occ = conts.filter(function (c) { return c.desde <= d && c.hasta >= d; });
        if (!occ.length) { sinAsignar += diario; md.sin += diario; return; }
        var parte = modo === 'habitaciones' ? diario / nHab : diario / occ.length;
        occ.forEach(function (c) { slot(c).asignado += parte; });
        if (modo === 'habitaciones') { sinAsignar += diario - parte * occ.length; md.sin += diario - parte * occ.length; }
      });
    });
    // Lo que cada una ha aportado con su cuota de gastos, día a día hasta la fecha de corte
    if (corte) conts.forEach(function (c) {
      var s0 = slot(c), cuota = cuotaFija != null ? cuotaFija : num(c.gastos);
      var rm = room(c.habitacionId); if (rm && s0.habs.indexOf(rm.nombre) < 0) s0.habs.push(rm.nombre);
      var a = c.desde < P0 ? P0 : c.desde, b = c.hasta < corte ? c.hasta : corte;
      if (a > b) return;
      eachDay(a, b, function (d) { var q = cuota / daysIn(+d.slice(0, 4), +d.slice(5, 7)); s0.dias++; s0.aporta += q; mm(d).cuotas += q; });
    });
    var filas = Object.keys(per).map(function (k) { var o = per[k]; o.id = k; o.dif = Math.round((o.aporta - o.asignado) * 100) / 100; return o; })
      .filter(function (o) { return o.dias || o.asignado; })
      .sort(function (a, b) { return a.dif - b.dif; });
    var totAporta = filas.reduce(function (t, o) { return t + o.aporta; }, 0);
    var r2 = function (n) { return Math.round(n * 100) / 100; };
    var ys = []; for (var k = 2025; k <= yDef + 1; k++) ys.push(k);
    // Aviso si una factura repite un gasto que ya está como fijo (se contaría dos veces)
    var dobles = fact.filter(function (f) { return fijos.some(function (x) { return x.tipo === f.tipo && f.hasta >= x.desde && (!x.hasta || f.desde <= x.hasta); }); });
    // Mes a mes del curso: facturas vs cuotas, con sobrante/faltante y acumulado (solo hasta la última factura)
    function tablaMeses() {
      if (!corte) return '';
      var acum = 0, rows = '';
      for (var i = 0; i < 12; i++) {
        var yy = i < 4 ? y : y + 1, m = (i + 8) % 12 + 1, key = yy + '-' + (m < 10 ? '0' : '') + m, o = meses[key] || { fact: 0, sin: 0, cuotas: 0 };
        var ini = key + '-01', fin = key + '-' + daysIn(yy, m), nombre = MES_LARGO[m - 1].charAt(0).toUpperCase() + MES_LARGO[m - 1].slice(1) + ' ' + yy;
        if (ini > corte) { rows += '<tr class="kfut"><td>' + nombre + '</td><td colspan="4">Sin facturas todavía</td></tr>'; continue; }
        var dif = r2(o.cuotas - (o.fact - o.sin)); acum = r2(acum + dif);
        rows += '<tr><td><b>' + nombre + '</b>' + (corte < fin ? '<small class="stamp">hasta el ' + fmt(corte) + '</small>' : '') + '</td>' +
          '<td class="r">' + money(r2(o.fact)) + (o.sin > 0.005 ? '<small class="stamp">' + money(r2(o.sin)) + ' sin repartir</small>' : '') + '</td>' +
          '<td class="r">' + money(r2(o.cuotas)) + '</td>' +
          '<td>' + (dif > 0.5 ? chip('pagado', 'Sobran ' + money(dif)) : dif < -0.5 ? chip('vencido', 'Faltan ' + money(-dif)) : chip('fin', 'En paz')) + '</td>' +
          '<td class="r"><b class="' + (acum >= 0 ? 'ok' : 'bad') + '">' + (acum > 0 ? '+' : '') + money(acum) + '</b></td></tr>';
      }
      return '<section class="card"><h3>Mes a mes</h3><div class="tscroll"><table class="kt"><thead><tr><th>Mes</th><th class="r">Gastos</th><th class="r">Ingresos por cuotas</th><th>Sobrante / faltante</th><th class="r">Acumulado</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="hint">«Facturas» = gastos fijos de cada mes más lo que toca a ese mes de cada factura, repartido por días. «Ingresos por cuotas» = lo que pagan de gastos ese mes (limpieza, luz, agua, internet…). «Sin repartir» lo asume la propiedad (días o habitaciones sin nadie).</p></section>';
    }
    box.innerHTML = '<div class="ghead"><h2>Consumos</h2><div class="gtools"><select id="ky">' + ys.map(function (c) { return '<option value="' + c + '"' + (c === y ? ' selected' : '') + '>Curso ' + B.courseLabel(c) + (c === y0 ? ' (actual)' : '') + '</option>'; }).join('') + '</select>' +
      '<button class="btn edit-only" type="button" id="k-new">+ Añadir factura</button></div></div>' +
      '<p class="hint">Sube las facturas de luz y agua, y deja puestos los gastos fijos de cada mes (limpieza, internet…). El total se reparte entre las inquilinas según los días que estuvo cada una, y se compara con lo que pagan de gastos. Periodo: 1 sep ' + y + ' – 31 ago ' + (y + 1) + '.</p>' +
      '<div class="tiles"><div><small>Gastos del periodo</small><b>' + money(r2(totalPeriodo)) + '</b><small>' + (SUMIN.filter(function (x) { return porTipo[x[0]]; }).map(function (x) { return x[1] + ' ' + money(r2(porTipo[x[0]])); }).join(' · ') || 'Sin facturas') + '</small></div>' +
      '<div><small>Aportado por cuotas</small><b>' + money(r2(totAporta)) + '</b><small>' + (corte ? 'hasta el ' + fmt(corte) + ' (última factura)' : '—') + '</small></div>' +
      '<div><small>Diferencia</small><b class="' + (totAporta - (totalPeriodo - sinAsignar) >= 0 ? 'ok' : 'bad') + '">' + money(r2(totAporta - (totalPeriodo - sinAsignar))) + '</b><small>' + (totAporta - (totalPeriodo - sinAsignar) >= 0 ? 'Las cuotas cubren los consumos' : 'Los consumos superan las cuotas') + '</small></div>' +
      '<div><small>Sin repartir</small><b>' + money(r2(sinAsignar)) + '</b><small>' + (modo === 'habitaciones' ? 'habitaciones vacías (propiedad)' : 'días sin nadie en la casa') + '</small></div></div>' +
      (dobles.length ? '<p class="kwarn">Ojo: ' + dobles.length + (dobles.length > 1 ? ' facturas de ' : ' factura de ') + dobles.map(function (f) { return supLabel(f.tipo); }).filter(function (v, i, a2) { return a2.indexOf(v) === i; }).join(', ') +
        (dobles.length > 1 ? ' coinciden' : ' coincide') + ' con un gasto fijo del mismo concepto y se ' + (dobles.length > 1 ? 'están' : 'está') + ' contando dos veces. Borra la factura o ajusta las fechas del gasto fijo.</p>' : '') +
      tablaMeses() +
      '<section class="card"><h3>Reparto por inquilina</h3>' +
      (filas.length ? '<div class="tscroll"><table class="kt"><thead><tr><th>Inquilina</th><th>Habitación</th><th class="r">Días</th><th class="r">Ha aportado</th><th class="r">Le corresponde</th><th>Resultado</th><th></th></tr></thead><tbody>' +
        filas.map(function (o) {
          var debe = o.dif < -0.5, sobra = o.dif > 0.5;
          return '<tr><td><b>' + esc(fullName(o.t)) + '</b></td><td>' + esc(o.habs.join(', ')) + '</td><td class="r">' + o.dias + '</td><td class="r">' + money(r2(o.aporta)) + '</td><td class="r">' + money(r2(o.asignado)) + '</td>' +
            '<td>' + (debe ? chip('vencido', 'Debe ' + money(-o.dif)) : sobra ? chip('pagado', 'Le sobran ' + money(o.dif)) : chip('fin', 'En paz')) + '</td>' +
            '<td class="r">' + (debe && o.t ? '<button type="button" class="mini edit-only" data-kcob="' + esc(o.id) + '" data-kimp="' + (-o.dif) + '">Crear cobro</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">' + (corte ? 'No hay inquilinas con contrato en este periodo.' : 'Añade la primera factura para ver el reparto.') + '</p>') +
      '<p class="hint">«Ha aportado» = su cuota de gastos por los días que ha estado, hasta la fecha de la última factura subida. «Le corresponde» = su parte de los gastos por los días que estuvo.</p></section>' +
      '<section class="card"><h3>Gastos fijos cada mes</h3>' + ((cfg.fijos || []).length ? '<div class="tscroll"><table class="kt"><thead><tr><th>Concepto</th><th class="r">€/mes</th><th>Desde</th><th>Hasta</th><th></th></tr></thead><tbody>' +
        cfg.fijos.map(function (x) {
          return '<tr><td><b>' + esc(supLabel(x.tipo)) + '</b>' + (x.nota ? '<small class="stamp">' + esc(x.nota) + '</small>' : '') + '</td><td class="r"><b>' + money(x.importe) + '</b></td><td>' + fmt(x.desde) + '</td><td>' + (x.hasta ? fmt(x.hasta) : 'Sin fin') + '</td>' +
            '<td class="r"><button type="button" class="mini edit-only" data-kfijo="' + esc(x.id) + '">Editar</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Sin gastos fijos.</p>') +
      '<p class="hint">Se cuentan solos cada mes, sin subir factura. <button type="button" class="linkbtn edit-only" id="k-fijo">+ Añadir gasto fijo</button></p></section>' +
      '<section class="card"><h3>Facturas</h3>' + (fact.length ? '<div class="tscroll"><table class="kt"><thead><tr><th>Concepto</th><th>Periodo</th><th class="r">Importe</th><th>Archivos</th><th></th></tr></thead><tbody>' +
        fact.map(function (f) {
          return '<tr><td><b>' + esc(supLabel(f.tipo)) + '</b>' + (f.nota ? '<small class="stamp">' + esc(f.nota) + '</small>' : '') + '</td><td>' + fmt(f.desde) + ' → ' + fmt(f.hasta) + '<small class="stamp">' + dayCount(f.desde, f.hasta) + ' días</small></td>' +
            '<td class="r"><b>' + money(f.importe) + '</b></td><td>' + (f.docs || []).map(function (d, i) { return '<button type="button" class="mini" data-kdoc="' + esc(f.id) + ':' + i + '">' + (d.tipo === 'pdf' ? 'PDF' : 'Foto') + ' ' + (i + 1) + '</button>'; }).join(' ') + '</td>' +
            '<td class="r"><button type="button" class="mini edit-only" data-kedit="' + esc(f.id) + '">Editar</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Todavía no hay facturas en este curso.</p>') + '</section>' +
      '<section class="card edit-only" id="k-aju"><h3>Ajustes del reparto</h3><div class="grid">' +
      '<label>Cuota de gastos por inquilina (€/mes)<input type="number" min="0" step="1" id="k-cuota" value="' + esc(cfg.cuota || '') + '" placeholder="Los gastos de cada contrato"></label>' +
      '<label>Cómo se reparte<select id="k-modo"><option value="ocupantes"' + (modo === 'ocupantes' ? ' selected' : '') + '>Entre las inquilinas que hay cada día</option><option value="habitaciones"' + (modo === 'habitaciones' ? ' selected' : '') + '>Entre las ' + nHab + ' habitaciones (las vacías las asume la propiedad)</option></select></label>' +
      '</div><p class="hint">Lo que paga cada inquilina de gastos al mes (incluye limpieza, luz, agua, internet…). Vacío = se usa el importe de gastos de cada contrato.</p></section>';
    $('ky').onchange = function () { box.dataset.ky = this.value; viewConsumos(); };
    $('k-new').onclick = function () { facturaForm(null); };
    $('k-fijo').onclick = function () { fijoForm(null); };
    box.querySelectorAll('[data-kfijo]').forEach(function (b) { b.onclick = function () { fijoForm(cfg.fijos.filter(function (x) { return x.id === b.getAttribute('data-kfijo'); })[0]); }; });
    box.querySelectorAll('[data-kedit]').forEach(function (b) { b.onclick = function () { facturaForm(G.consumos.filter(function (f) { return f.id === b.getAttribute('data-kedit'); })[0]); }; });
    box.querySelectorAll('[data-kdoc]').forEach(function (b) { b.onclick = function () { var p = b.getAttribute('data-kdoc').split(':'), f = G.consumos.filter(function (x) { return x.id === p[0]; })[0]; if (f) openDoc(f.docs[+p[1]]); }; });
    var kc = $('k-cuota'); if (kc) kc.onchange = function () { cfg.cuota = num(this.value) || ''; save(); viewConsumos(); };
    var km = $('k-modo'); if (km) km.onchange = function () { cfg.modo = this.value; save(); viewConsumos(); };
    box.querySelectorAll('[data-kcob]').forEach(function (b) {
      b.onclick = function () {
        var tid = b.getAttribute('data-kcob'), imp = Math.round(num(b.getAttribute('data-kimp')) * 100) / 100, ref = 'consumos-' + y;
        var c = activeContract(tid) || G.contratos.filter(function (x) { return x.inquilinaId === tid; })[0];
        var ya = G.cobros.filter(function (x) { return x.consumoRef === ref && x.inquilinaId === tid && !x.pagado; })[0];
        if (ya) { ya.importe = imp; ya.concepto = 'Exceso de consumos curso ' + B.courseLabel(y) + ' (hasta ' + fmt(corte) + ')'; ya.editadoEn = now(); }
        else G.cobros.push({ id: uid(), contratoId: c ? c.id : '', inquilinaId: tid, tipo: 'otro', consumoRef: ref, mes: today().slice(0, 7), concepto: 'Exceso de consumos curso ' + B.courseLabel(y) + ' (hasta ' + fmt(corte) + ')', importe: imp, vence: B.addDays(today(), 10), pagado: false, creadoEn: now() });
        save(); A.alert((ya ? 'Cobro actualizado: ' : 'Cobro creado en Cobros: ') + money(imp) + ' para ' + fullName(tenant(tid)) + '.'); viewConsumos();
      };
    });
  }
  function fijoForm(x) {
    var isNew = !x, cfg = G.consumosCfg; x = x || { tipo: 'limpieza' };
    openForm({
      title: isNew ? 'Añadir gasto fijo' : 'Gasto fijo: ' + supLabel(x.tipo),
      fields: [
        { k: 'tipo', label: 'Concepto', type: 'select', opts: SUMIN },
        { k: 'importe', label: 'Importe cada mes (€)', type: 'number', step: '0.01' },
        { k: 'desde', label: 'Desde', type: 'date' }, { k: 'hasta', label: 'Hasta (vacío = sin fin)', type: 'date' },
        { k: 'nota', label: 'Compañía o nota', wide: true, ph: 'Ej.: Digi, empresa de limpieza…' }
      ],
      values: { tipo: x.tipo, importe: x.importe, desde: x.desde || (B.courseOf(today()) !== null ? B.courseOf(today()) : B.nextFullCourse(today())) + '-09-01', hasta: x.hasta || '', nota: x.nota || '' },
      ok: isNew ? 'Guardar gasto fijo' : 'Guardar',
      onSave: function (v) {
        if (!(num(v.importe) > 0)) return 'Pon el importe de cada mes.';
        if (!v.desde || (v.hasta && v.hasta < v.desde)) return 'Revisa las fechas.';
        Object.keys(v).forEach(function (k) { x[k] = v[k]; });
        cfg.fijos = cfg.fijos || [];
        if (isNew) { x.id = uid(); x.creadoEn = now(); cfg.fijos.push(x); } else x.editadoEn = now();
        save(); refresh();
      },
      needKey: isNew ? null : 'Vas a borrar el gasto fijo de ' + supLabel(x.tipo) + ' (' + money(x.importe) + ' al mes).',
      onDelete: isNew ? null : function () { cfg.fijos = cfg.fijos.filter(function (o) { return o !== x; }); save(); refresh(); }
    });
  }
  function facturaForm(f) {
    var isNew = !f; f = f || { tipo: 'luz', docs: [] };
    var docs = (f.docs || []).slice();
    openForm({
      title: isNew ? 'Añadir factura' : 'Factura de ' + supLabel(f.tipo),
      fields: [
        { k: 'tipo', label: 'Concepto', type: 'select', opts: SUMIN },
        { k: 'importe', label: 'Importe total (€)', type: 'number', step: '0.01' },
        { k: 'desde', label: 'Periodo: desde', type: 'date' }, { k: 'hasta', label: 'Periodo: hasta', type: 'date' },
        { k: 'nota', label: 'Compañía o nota', wide: true, ph: 'Ej.: Endesa, factura nº…' },
        { k: 'docs', type: 'html', html: '<div class="docs"><h4 class="subh">PDF o foto de la factura</h4><div id="k-docs"></div>' +
          '<label class="btn plain sm doc-add">+ Adjuntar PDF o fotos<input type="file" id="k-doc-in" accept="application/pdf,image/*" multiple hidden></label><p class="hint" id="k-doc-st">El importe y el periodo los escribes tú arriba (vienen en la factura).</p></div>' }
      ],
      values: { tipo: f.tipo, importe: f.importe, desde: f.desde || '', hasta: f.hasta || '', nota: f.nota || '' },
      ok: isNew ? 'Guardar factura' : 'Guardar',
      onSave: function (v) {
        if (!(num(v.importe) > 0)) return 'Pon el importe de la factura.';
        if (!v.desde || !v.hasta || v.desde > v.hasta) return 'Pon el periodo que cubre la factura (desde y hasta).';
        delete v.docs; Object.keys(v).forEach(function (k) { f[k] = v[k]; }); f.docs = docs;
        if (isNew) { f.id = uid(); f.creadoEn = now(); G.consumos.push(f); } else f.editadoEn = now();
        save(); refresh();
      },
      needKey: isNew ? null : 'Vas a borrar esta factura de ' + supLabel(f.tipo) + ' (' + money(f.importe) + ').',
      onDelete: isNew ? null : function () { G.consumos = G.consumos.filter(function (x) { return x !== f; }); save(); refresh(); }
    });
    function drawDocs() {
      $('k-docs').innerHTML = docs.length ? docs.map(function (d, i) { return '<span class="doc"><button type="button" class="linkbtn" data-o="' + i + '">' + (d.tipo === 'pdf' ? '📄 ' : '🖼️ ') + esc(d.nombre) + '</button> <button type="button" class="mini" data-x="' + i + '">Quitar</button></span>'; }).join('') : '<p class="hint">Sin archivos.</p>';
    }
    drawDocs();
    $('k-docs').onclick = function (e) {
      var o = e.target.closest('[data-o]'), x = e.target.closest('[data-x]');
      if (o) openDoc(docs[+o.getAttribute('data-o')]);
      if (x) { docs.splice(+x.getAttribute('data-x'), 1); drawDocs(); }
    };
    $('k-doc-in').onchange = function () {
      var files = Array.prototype.slice.call(this.files || []), st = $('k-doc-st'), errs = [];
      this.value = ''; if (!files.length) return;
      st.textContent = 'Subiendo ' + files.length + ' archivo' + (files.length > 1 ? 's' : '') + '…';
      files.reduce(function (p, file) {
        return p.then(function () {
          return readDocFile(file).then(function (fd) {
            return B.store.uploadDoc(fd.data).then(function (path) { docs.push({ id: uid(), nombre: file.name.slice(0, 120), tipo: fd.tipo, path: path, fecha: today() }); drawDocs(); });
          }).catch(function (err) { if (err.status === 401) A.expired(); errs.push(err.message); });
        });
      }, Promise.resolve()).then(function () { st.textContent = errs.length ? errs.join(' ') : 'Listo. Pulsa «Guardar» para guardar la factura.'; });
    };
  }

  /* ---------- Incidencias ---------- */
  var INC_ST = { abierta: ['vencido', 'Abierta'], curso: ['pendiente', 'En curso'], resuelta: ['pagado', 'Resuelta'] };
  function incList(list, key) {
    if (!list.length) return '<p class="empty">Sin incidencias.</p>';
    list.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
    var total = list.length;
    return pageOf(list, key).map(function (x) {
      var s = INC_ST[x.estado] || INC_ST.abierta;
      return '<button type="button" class="crow" data-i="' + x.id + '"><span><b>' + esc(x.titulo) + '</b><small>' + fmt(x.fecha) + ' · ' + esc(roomName(x.habitacionId)) +
        (x.inquilinaId ? ' · ' + esc(fullName(tenant(x.inquilinaId))) : '') + (num(x.coste) ? ' · ' + money(x.coste) : '') + '</small>' +
        (x.detalle ? '<small>' + esc(x.detalle.slice(0, 140)) + '</small>' : '') +
        (x.creadaEn || x.editadaEn ? '<small class="stamp">' + (x.creadaEn ? 'Registrada el ' + fmtDT(x.creadaEn) : '') + (x.editadaEn ? (x.creadaEn ? ' · ' : '') + 'Modificada el ' + fmtDT(x.editadaEn) : '') + '</small>' : '') + '</span>' + chip(s[0], s[1]) + '</button>';
    }).join('') + pager(key, total);
  }
  function bindInc(root) {
    root.querySelectorAll('[data-i]').forEach(function (b) {
      b.onclick = function () { incForm(G.incidencias.filter(function (x) { return x.id === b.getAttribute('data-i'); })[0]); };
    });
  }
  function incForm(x, preset) {
    var isNew = !x; x = x || {};
    var v0 = isNew ? Object.assign({ fecha: today(), estado: 'abierta' }, preset || {}) : x;
    openForm({ title: isNew ? 'Nueva incidencia' : 'Incidencia', fields: [
      { k: 'titulo', label: 'Qué pasa', wide: true, ph: 'Ej.: no funciona el aire del salón' },
      { k: 'habitacionId', label: 'Dónde', type: 'select', opts: [['comun', 'Zonas comunes']].concat(rooms().map(function (r) { return [r.id, 'Nº ' + r.num + ' · ' + r.nombre]; })) },
      { k: 'inquilinaId', label: 'Quién avisa', type: 'select', opts: [['', '—']].concat(G.inquilinas.map(function (t) { return [t.id, fullName(t)]; })) },
      { k: 'fecha', label: 'Fecha', type: 'date' },
      { k: 'estado', label: 'Estado', type: 'select', opts: [['abierta', 'Abierta'], ['curso', 'En curso'], ['resuelta', 'Resuelta']] },
      { k: 'coste', label: 'Coste (€)', type: 'number', step: '0.01' },
      { k: 'detalle', label: 'Detalle, quién lo arregla…', type: 'textarea' }],
      values: v0, ok: isNew ? 'Crear' : 'Guardar',
      onSave: function (v) {
        if (!v.titulo) return 'Describe brevemente la incidencia.';
        if (v.estado === 'resuelta' && x.estado !== 'resuelta') v.cierre = today();
        Object.keys(v).forEach(function (k) { x[k] = v[k]; });
        if (isNew) { x.id = uid(); x.creadaEn = now(); G.incidencias.push(x); } else x.editadaEn = now();
        save(); refresh();
      },
      onDelete: isNew ? null : function () { G.incidencias = G.incidencias.filter(function (o) { return o !== x; }); save(); refresh(); }
    });
  }
  function viewIncidencias() {
    var f = box.dataset.inf || 'abiertas';
    var list = G.incidencias.filter(function (x) { return f === 'todas' || (f === 'abiertas' ? x.estado !== 'resuelta' : x.estado === 'resuelta'); });
    var coste = G.incidencias.filter(function (x) { return (x.fecha || '').slice(0, 4) === today().slice(0, 4); }).reduce(function (s, x) { return s + num(x.coste); }, 0);
    box.innerHTML = '<div class="ghead"><h2>Incidencias</h2><div class="gtools"><span class="hint">Coste este año: <b>' + money(coste) + '</b></span><button class="btn" type="button" id="new-i">+ Nueva incidencia</button></div></div>' +
      '<div class="seg2" id="inf">' + [['abiertas', 'Abiertas'], ['resueltas', 'Resueltas'], ['todas', 'Todas']].map(function (o) {
        return '<button type="button" data-f="' + o[0] + '" aria-current="' + (o[0] === f) + '">' + o[1] + '</button>';
      }).join('') + '</div><section class="card">' + incList(list, 'inc') + '</section>';
    $('inf').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) { box.dataset.inf = b.getAttribute('data-f'); PAGES.inc = 0; viewIncidencias(); } };
    $('new-i').onclick = function () { incForm(null); };
    bindInc(box);
  }

  /* ---------- Ocupación: cuadro de todas las habitaciones por curso ---------- */
  function viewOcupacion() {
    var y = +(box.dataset.oy || B.courseOf(today()) || B.nextFullCourse(today()));
    var start = y + '-09-01', end = (y + 1) + '-08-31', total = (B.toDate(end) - B.toDate(start)) / 864e5 + 1;
    var pos = function (iso) { return Math.max(0, Math.min(100, ((B.toDate(iso) - B.toDate(start)) / 864e5) / total * 100)); };
    var months = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7];
    var t = today(), libresHoy = [];
    var rows = rooms().map(function (r) {
      var bars = G.contratos.filter(function (c) { return c.habitacionId === r.id && c.desde <= end && c.hasta >= start; }).map(function (c) {
        var a = pos(c.desde < start ? start : c.desde), b = pos(B.addDays(c.hasta > end ? end : c.hasta, 1));
        var te = tenant(c.inquilinaId);
        return '<span class="obar" style="left:' + a + '%;width:' + Math.max(1, b - a) + '%" title="' + esc(fullName(te) + ' · ' + fmt(c.desde) + ' → ' + fmt(c.hasta)) + '">' + esc(te ? te.nombre : '') + '</span>';
      }).join('');
      // Tramos ocupados marcados a mano (respetando los "libre" que se añadieron después)
      var only = { intervalos: (r.intervalos || []).filter(function (i) { return !i.origen; }) }, runs = [], cur = null;
      for (var d = start; d <= end; d = B.addDays(d, 1)) {
        if (B.dayState(only, d) === 'ocupada') { if (!cur) { cur = { a: d }; runs.push(cur); } cur.b = d; } else cur = null;
      }
      var manual = runs.map(function (x) {
        var a = pos(x.a), b = pos(B.addDays(x.b, 1));
        return '<span class="obar man" style="left:' + a + '%;width:' + Math.max(1, b - a) + '%" title="Marcada a mano en Habitaciones">Ocupada</span>';
      }).join('');
      if (B.dayState(r, t) !== 'ocupada' && r.activa) libresHoy.push('Nº ' + r.num);
      // Solicitudes pendientes y admitidas sin contrato: solo se ven aquí, no ocupan la habitación en la web
      var sols = (SOL || []).filter(function (x) {
        if (x.habitacionId !== r.id || !x.periodo || !x.periodo.desde || !x.periodo.hasta) return false;
        if (x.periodo.desde > end || x.periodo.hasta < start) return false;
        if (x.estado === 'nueva') return true;
        return x.estado === 'aceptada' && !G.contratos.some(function (c) { return c.inquilinaId === x.inquilinaId; });
      }).sort(function (a2, b2) { return a2.periodo.desde < b2.periodo.desde ? -1 : 1; });
      var lanes = [], solBars = sols.map(function (x) {
        var a = pos(x.periodo.desde < start ? start : x.periodo.desde), b = pos(B.addDays(x.periodo.hasta > end ? end : x.periodo.hasta, 1));
        var ln = 0; while (lanes[ln] != null && lanes[ln] > a) ln++; lanes[ln] = b;
        var adm = x.estado === 'aceptada';
        return '<span class="obar sol ' + (adm ? 'adm' : 'pen') + '" data-sol="' + esc(x.id) + '" role="button" tabindex="0" style="left:' + a + '%;width:' + Math.max(1, b - a) + '%;top:' + (34 + ln * 26) + 'px" title="' +
          esc((adm ? 'Admitida, sin contrato' : 'Pendiente de admisión') + ' · ' + x.nombre + ' ' + x.apellidos + ' · ' + fmt(x.periodo.desde) + ' → ' + fmt(x.periodo.hasta)) + '">' + (adm ? '✓ ' : '? ') + esc(x.nombre) + '</span>';
      }).join('');
      var h = lanes.length ? ' style="height:' + (34 + lanes.length * 26 + 4) + 'px"' : '';
      return '<div class="orow"><span class="olab">Nº ' + r.num + '<small>' + esc(r.nombre) + '</small></span><div class="otrack' + (lanes.length ? ' two' : '') + '"' + h + '>' + manual + bars + solBars +
        (t >= start && t <= end ? '<i class="onow" style="left:' + pos(t) + '%"></i>' : '') + '</div></div>';
    }).join('');
    var ys = []; for (var k = -2; k <= 3; k++) ys.push((B.courseOf(today()) || B.nextFullCourse(today()) - 1) + k);
    box.innerHTML = '<div class="ghead"><h2>Ocupación</h2><div class="gtools"><select id="oy">' + ys.map(function (c) { return '<option value="' + c + '"' + (c === y ? ' selected' : '') + '>Curso ' + B.courseLabel(c) + '</option>'; }).join('') + '</select></div></div>' +
      '<p class="hint">Libres hoy: <b>' + (libresHoy.length ? libresHoy.join(', ') : 'ninguna') + '</b></p>' +
      '<section class="card"><div class="tscroll"><div class="occgrid"><div class="orow ohead"><span class="olab"></span><div class="otrack">' +
      months.map(function (m) { return '<span>' + B.MESES[m] + '</span>'; }).join('') + '</div></div>' + rows + '</div></div>' +
      '<p class="legend2"><span><i class="bar-s"></i>Contrato (nombre de la inquilina)</span><span><i class="bar-s man"></i>Ocupada a mano</span>' +
      '<span><i class="bar-s adm"></i>Admitida, sin contrato</span><span><i class="bar-s pen"></i>Pendiente de admisión</span><span><i class="now-s"></i>Hoy</span></p>' +
      '<p class="hint"><b>Solo el contrato y la ocupación a mano ocupan la habitación en la web.</b> Las admitidas sin contrato y las pendientes se ven aquí para organizarte, pero no la bloquean. Pulsa una solicitud para abrirla.</p></section>';
    $('oy').onchange = function () { box.dataset.oy = this.value; viewOcupacion(); };
    bindSol();
    if (SOL === null) loadSol();
  }

  /* ---------- Ajustes ---------- */
  function viewAjustes() {
    var d = A.data(); d.ajustes = d.ajustes || {};
    var aj = d.ajustes, yn = B.nextFullCourse(today()), vis = B.visibleCourses(aj, today());
    // Siempre el curso actual y los 3 siguientes (se actualiza solo cada año)
    var y0 = B.courseOf(today()), base = y0 !== null ? y0 : yn, cands = [base, base + 1, base + 2, base + 3];
    box.innerHTML = '<div class="ghead"><h2>Ajustes</h2></div>' +
      '<section class="card"><h3>Cursos que se ven en la web</h3><p class="hint">Marca los cursos que las chicas pueden reservar. El primer curso completo marcado sale como «Principal». Siempre salen el curso actual y los 3 siguientes.</p>' +
      '<div class="checks">' + cands.map(function (y) {
        if (y === y0) return '<label class="switch"><input type="checkbox" id="aj-ya"' + (aj.entrarYa !== false ? ' checked' : '') + '> Curso ' + B.courseLabel(y) + ' <b>(actual)</b> <small>resto del curso: habitaciones libres ya o que quedan libres antes del 31 jul ' + (y + 1) + '</small></label>';
        return '<label class="switch"><input type="checkbox" data-y="' + y + '"' + (vis.indexOf(y) >= 0 ? ' checked' : '') + '> Curso ' + B.courseLabel(y) + ' <small>(1 sep ' + y + ' – 31 jul ' + (y + 1) + ')</small></label>';
      }).join('') + '</div></section>' +
      '<section class="card" id="backup-card"><h3>Copia de seguridad</h3><p class="hint">Descarga en un archivo todas las habitaciones, inquilinas, contratos, cobros e incidencias. Guárdalo en un sitio seguro: contiene datos personales.</p>' +
      '<div><button class="btn plain" type="button" id="backup">Descargar copia</button></div></section>' +
      '<section class="card" id="export-card"><h3>Descargar todo en una carpeta</h3><p class="hint">Un archivo ZIP con un <b>Excel</b> (habitaciones, inquilinas, contratos, cobros, incidencias y solicitudes), las <b>fotos de cada habitación</b> y los <b>documentos</b> (DNI, contratos…) de cada inquilina y solicitud, con nombres claros. Contiene datos personales: guárdalo en un sitio seguro.</p>' +
      '<div><button class="btn" type="button" id="export-all">📦 Descargar carpeta completa</button> <span class="hint" id="export-st"></span></div></section>';
    box.querySelectorAll('[data-y]').forEach(function (c) {
      c.onchange = function () {
        var ys = []; box.querySelectorAll('[data-y]').forEach(function (x) { if (x.checked) ys.push(+x.getAttribute('data-y')); });
        if (!ys.length) { this.checked = true; A.alert('Tiene que quedar al menos un curso visible.'); return; }
        aj.cursos = ys; A.saveRooms();
      };
    });
    if ($('aj-ya')) $('aj-ya').onchange = function () { aj.entrarYa = this.checked; A.saveRooms(); };
    $('export-all').onclick = function () { exportAll(this, $('export-st')); };
    $('backup').onclick = function () {
      var blob = new Blob([JSON.stringify({ fecha: new Date().toISOString(), habitaciones: A.data(), gestion: G }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bsl-copia-' + today() + '.json';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
  }

  /* ---------- Descarga completa: ZIP con Excel + fotos + documentos ---------- */
  function loadLib(url, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok, ko) { var sc = document.createElement('script'); sc.src = url; sc.onload = function () { ok(); }; sc.onerror = function () { ko(new Error('No se ha podido cargar ' + url.split('/').pop())); }; document.head.appendChild(sc); });
  }
  // Nombre de archivo limpio: MAYÚSCULAS, sin tildes ni símbolos raros
  function fname(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ºª]/g, '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toUpperCase().slice(0, 60) || 'SIN_NOMBRE'; }
  function extOf(blob, path) {
    var t = (blob && blob.type) || '', m = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[t];
    if (m) return m; var e = /\.(\w{2,4})(?:$|\?)/.exec(path || ''); return e ? e[1].toLowerCase() : 'bin';
  }
  function dd(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; }
  function exportAll(btn, st) {
    var hoy = today(), root = 'BSL_' + hoy, fails = [];
    btn.disabled = true; var say = function (t) { st.textContent = t; };
    say('Cargando herramientas…');
    Promise.all([
      loadLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', function () { return !!window.JSZip; }),
      loadLib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', function () { return !!window.XLSX; }),
      SOL ? Promise.resolve(SOL) : B.store.loadSolicitudes().then(function (l) { SOL = l; return l; })
    ]).then(function () {
      var zip = new JSZip(), top = zip.folder(root), rs = rooms();
      var hab = function (id) { var rm = room(id); return rm ? 'Nº ' + rm.num + ' · ' + rm.nombre : (id === 'comun' ? 'Zonas comunes' : ''); };
      var who = function (x) { var t = tenantOfCobro(x); return t ? fullName(t) : ''; };
      // 1) Excel
      var wb = XLSX.utils.book_new();
      function sheet(name, rows) { var ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'Sin datos' }]);
        ws['!cols'] = Object.keys(rows[0] || { '': 1 }).map(function (k) { return { wch: Math.min(50, Math.max(10, k.length + 2, ...rows.map(function (o) { return String(o[k] == null ? '' : o[k]).length + 1; }))) }; });
        XLSX.utils.book_append_sheet(wb, ws, name); }
      sheet('Habitaciones', rs.map(function (rm) { return { 'Nº': rm.num, 'Nombre': rm.nombre, 'Activa': rm.activa ? 'Sí' : 'No', 'Alquiler €/mes': num(rm.precio), 'Precio por curso': Object.keys(rm.preciosCurso || {}).sort().map(function (k) { return B.courseLabel(+k) + ': ' + rm.preciosCurso[k] + ' €'; }).join(' · '), 'Gastos €/mes': num(rm.gastos), 'm²': rm.m2 || '', 'Cama (cm)': rm.cama || '', 'Descripción': rm.descripcion || '', 'Nº fotos': (rm.fotos || []).length }; }));
      sheet('Inquilinas', G.inquilinas.map(function (t) { var c = activeContract(t.id), o = { 'Nombre completo': fullName(t) };
        TENANT_FIELDS.forEach(function (f) { var v = t[f.k] || ''; o[f.label] = f.type === 'date' ? dd(v) : v; });
        o['Habitación actual'] = c ? hab(c.habitacionId) : ''; o['Debe (€)'] = debt(t.id) || 0; o['Alta'] = t.creadaEn ? fmtDT(t.creadaEn) : dd(t.creada); return o; }));
      sheet('Contratos', G.contratos.slice().sort(function (a, b) { return a.desde < b.desde ? -1 : 1; }).map(function (c) { return { 'Inquilina': fullName(tenant(c.inquilinaId)), 'Habitación': hab(c.habitacionId), 'Entrada': dd(c.desde), 'Salida': dd(c.hasta),
        'Alquiler €/mes': num(c.precio), 'Gastos €/mes': num(c.gastos), 'Fianza €': num(c.fianza), 'Estado fianza': c.fianzaEstado || 'pendiente', 'Día de pago': c.diaPago || '', 'Notas': c.notas || '', 'Nº documentos': (c.docs || []).length, 'Creado': fmtDT(c.creadoEn) }; }));
      sheet('Cobros', G.cobros.slice().sort(function (a, b) { return a.vence < b.vence ? -1 : 1; }).map(function (x) { var c = contract(x.contratoId), stt = cobroState(x); return { 'Vence': dd(x.vence), 'Inquilina': who(x), 'Habitación': c ? hab(c.habitacionId) : '',
        'Concepto': x.concepto, 'Tipo': x.tipo, 'Importe €': num(x.importe), 'Estado': stt === 'pagado' ? 'Pagado' : stt === 'vencido' ? 'Vencido' : 'Pendiente', 'Fecha de pago': dd(x.fechaPago), 'Forma de pago': x.metodo || '',
        'Registrado': fmtDT(x.cobradoEn), 'Enlace de pago': x.pago ? x.pago.url : '', 'Nota': x.nota || '' }; }));
      sheet('Incidencias', G.incidencias.map(function (x) { return { 'Fecha': dd(x.fecha), 'Título': x.titulo || '', 'Habitación': hab(x.habitacionId), 'Inquilina': x.inquilinaId ? fullName(tenant(x.inquilinaId)) : '', 'Estado': x.estado || '', 'Coste €': num(x.coste), 'Detalle': x.detalle || '', 'Cierre': dd(x.cierre) }; }));
      sheet('Solicitudes', (SOL || []).map(function (x) { return { 'Recibida': fmtDT(x.fecha), 'Estado': (PRE_ST[x.estado] || PRE_ST.nueva)[1], 'Nombre': x.nombre, 'Apellidos': x.apellidos, 'Edad': x.edad || edad(x.nacimiento) || '', 'Teléfono': x.telefono || '', 'Email': x.email || '',
        'País': x.pais || '', 'Ciudad': x.provincia || '', 'Estudia': x.universidad || '', 'Habitación': x.habitacion || '', 'Pidió al principio': x.habitacionOriginal || '', 'Periodo': x.periodo && x.periodo.titulo || '',
        'Desde': dd(x.periodo && x.periodo.desde), 'Hasta': dd(x.periodo && x.periodo.hasta), 'Precio €/mes': num(x.precio), 'Mensaje': x.mensaje || '', 'Admitida': fmtDT(x.admitida) }; }));
      sheet('Consumos', (G.consumos || []).slice().sort(function (a, b) { return a.desde < b.desde ? -1 : 1; }).map(function (f) { return { 'Concepto': supLabel(f.tipo), 'Desde': dd(f.desde), 'Hasta': dd(f.hasta), 'Importe €': num(f.importe), 'Compañía o nota': f.nota || '', 'Nº archivos': (f.docs || []).length }; }));
      sheet('Gastos fijos', ((G.consumosCfg || {}).fijos || []).map(function (x) { return { 'Concepto': supLabel(x.tipo), 'Importe €/mes': num(x.importe), 'Desde': dd(x.desde), 'Hasta': x.hasta ? dd(x.hasta) : 'Sin fin', 'Compañía o nota': x.nota || '' }; }));
      top.file(root + '_DATOS.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
      top.file(root + '_COPIA_RESTAURAR.json', JSON.stringify({ fecha: new Date().toISOString(), habitaciones: A.data(), gestion: G, solicitudes: SOL }, null, 2));
      // 2) Lista de archivos a descargar
      var jobs = [];
      rs.forEach(function (rm) { (rm.fotos || []).forEach(function (u, i) { jobs.push({ dir: '01_HABITACIONES/N' + rm.num + '_' + fname(rm.nombre), base: 'N' + rm.num + '_' + fname(rm.nombre) + '_FOTO_' + ('0' + (i + 1)).slice(-2), get: function () { return fetch(u).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); }); }, path: u }); }); });
      G.contratos.forEach(function (c) {
        var t = tenant(c.inquilinaId), rm = room(c.habitacionId), dir = '02_INQUILINAS/' + fname(fullName(t));
        (c.docs || []).forEach(function (d, i) { jobs.push({ dir: dir, base: fname(fullName(t)) + '_CONTRATO_' + (rm ? 'N' + rm.num + '_' + fname(rm.nombre) : '') + '_' + (c.desde || '') + '_DOC' + (i + 1) + '_' + fname(String(d.nombre || '').replace(/\.\w{2,4}$/, '')), get: function () { return B.store.fetchDoc(d.path); }, path: d.path }); });
      });
      (SOL || []).forEach(function (x) {
        var dir = '03_SOLICITUDES/' + (x.fecha || '').slice(0, 10) + '_' + fname(x.nombre + ' ' + x.apellidos);
        docsOf(x).forEach(function (d, i) { jobs.push({ dir: dir, base: fname(x.nombre + ' ' + x.apellidos) + '_SOLICITUD_' + fname(x.tipoDoc || 'DOCUMENTO') + '_' + (i + 1), get: function () { return B.store.fetchDoc(d.path); }, path: d.path }); });
      });
      (G.consumos || []).forEach(function (f) {
        (f.docs || []).forEach(function (d, i) { jobs.push({ dir: '04_CONSUMOS', base: (f.desde || '') + '_' + fname(supLabel(f.tipo)) + '_' + String(num(f.importe)).replace('.', ',') + 'EUR_' + (i + 1), get: function () { return B.store.fetchDoc(d.path); }, path: d.path }); });
      });
      // Carpeta vacía de cada inquilina aunque no tenga documentos (así se ve quién está)
      G.inquilinas.forEach(function (t) { top.folder('02_INQUILINAS/' + fname(fullName(t))); });
      var done = 0;
      function next(i) {
        if (i >= jobs.length) return Promise.resolve();
        var j = jobs[i]; say('Descargando archivos… ' + (done + 1) + ' de ' + jobs.length);
        return j.get().then(function (blob) { top.folder(j.dir).file(j.base + '.' + extOf(blob, j.path), blob); }, function () { fails.push(j.dir + '/' + j.base); })
          .then(function () { done++; return next(i + 1); });
      }
      return next(0).then(function () {
        top.file('LEEME.txt', 'Copia completa de BSL · Boutique Student Living · ' + fmtDT(new Date().toISOString()) + '\r\n\r\n' +
          root + '_DATOS.xlsx  → Excel con una hoja por apartado (Habitaciones, Inquilinas, Contratos, Cobros, Incidencias, Solicitudes).\r\n' +
          '01_HABITACIONES  → fotos de cada habitación (N1_AZAHAR_FOTO_01…).\r\n' +
          '02_INQUILINAS    → una carpeta por inquilina con los documentos de sus contratos (DNI, contrato firmado…).\r\n' +
          '03_SOLICITUDES   → documentos que enviaron con la solicitud, por fecha y nombre.\r\n' +
          '04_CONSUMOS      → facturas de luz, agua, internet… (fecha_SUMINISTRO_importe).\r\n' +
          root + '_COPIA_RESTAURAR.json → copia técnica para poder recuperar el panel si hiciera falta.\r\n' +
          (fails.length ? '\r\nNo se pudieron descargar ' + fails.length + ' archivo(s):\r\n' + fails.join('\r\n') + '\r\n' : '') +
          '\r\nContiene datos personales: guárdalo en un sitio seguro.\r\n');
        say('Comprimiendo…');
        return zip.generateAsync({ type: 'blob' }, function (m) { say('Comprimiendo… ' + Math.round(m.percent) + ' %'); });
      }).then(function (blob) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = root + '.zip';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        say('✓ Descargado' + (jobs.length ? ' (' + (jobs.length - fails.length) + ' archivos' + (fails.length ? ', ' + fails.length + ' no se pudieron bajar' : '') + ')' : '') + '.');
        btn.disabled = false;
      });
    }).catch(function (e) { btn.disabled = false; if (e && e.status === 401) return A.expired(); say('No se ha podido preparar: ' + (e && e.message || e)); });
  }

  /* ---------- Cambios preparados por Claude ---------- */
  var PEND = [];
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function roomByNum(n) {
    var r = A.data().rooms.filter(function (x) { return x.num === +n; })[0];
    if (!r) throw new Error('No existe la habitación nº ' + n + '.');
    return r;
  }
  function tenantByName(name) {
    var q = norm(name), list = G.inquilinas.filter(function (t) { return norm(fullName(t)) === q; });
    if (!list.length) list = G.inquilinas.filter(function (t) { return norm(fullName(t)).indexOf(q) === 0; });
    if (list.length !== 1) throw new Error(list.length ? 'Hay varias inquilinas llamadas "' + name + '".' : 'No encuentro a la inquilina "' + name + '".');
    return list[0];
  }
  function describe(op) {
    var r = op.num && op.num !== 'comun' ? (A.data().rooms.filter(function (x) { return x.num === +op.num; })[0] || {}) : null;
    var rn = op.num === 'comun' ? 'zonas comunes' : r ? 'Nº ' + op.num + ' ' + (r.nombre || '') : '';
    var sets = function (o) { return Object.keys(o || {}).map(function (k) { return k + ': ' + (Array.isArray(o[k]) ? o[k].join(', ') : o[k]); }).join(' · '); };
    switch (op.tipo) {
      case 'habitacion': return 'Habitación ' + rn + ' → ' + sets(op.set);
      case 'intervalo': return (op.accion === 'quitar' ? 'Quitar' : 'Marcar') + ' ' + (op.estado || 'ocupada') + ' en ' + rn + ': ' + fmt(op.desde) + ' → ' + fmt(op.hasta);
      case 'inquilina': return 'Inquilina ' + ((op.nombre || '') + ' ' + (op.apellidos || '')).trim() + (op.telefono ? ' · ' + op.telefono : '') + (op.universidad ? ' · ' + op.universidad : '');
      case 'contrato': return 'Contrato de ' + op.inquilina + ' en ' + rn + ': ' + fmt(op.desde) + ' → ' + fmt(op.hasta) + (op.precio != null ? ' · ' + money(op.precio) : '');
      case 'fin-contrato': return 'Salida de ' + op.inquilina + (rn ? ' (' + rn + ')' : '') + ' el ' + fmt(op.hasta);
      case 'cobro-pagado': return 'Cobro pagado: ' + op.inquilina + ' · ' + op.concepto + (op.metodo ? ' · ' + op.metodo : '') + (op.fecha ? ' · ' + fmt(op.fecha) : '');
      case 'incidencia': return 'Incidencia en ' + (rn || 'zonas comunes') + ': ' + op.titulo;
      case 'factura': return 'Factura de ' + supLabel(op.suministro) + ': ' + money(op.importe) + ' · ' + fmt(op.desde) + ' → ' + fmt(op.hasta) + (op.nota ? ' · ' + op.nota : '');
      case 'borrar-factura': return 'Borrar factura de ' + supLabel(op.suministro) + ' ' + fmt(op.desde) + ' → ' + fmt(op.hasta) + (op.motivo ? ' · ' + op.motivo : '');
      case 'gasto-fijo': return 'Gasto fijo de ' + supLabel(op.concepto) + ': ' + money(op.importe) + ' al mes desde ' + fmt(op.desde) + (op.hasta ? ' hasta ' + fmt(op.hasta) : '') + (op.nota ? ' · ' + op.nota : '');
      case 'ajustes': return 'Ajustes → ' + sets(op.set);
      default: return 'Operación desconocida: ' + op.tipo;
    }
  }
  var ROOM_KEYS = ['nombre', 'precio', 'gastos', 'm2', 'cama', 'descripcion', 'activa', 'equipamiento', 'fotos', 'fotosIA'];
  function runOp(op) {
    var t, r, c;
    switch (op.tipo) {
      case 'habitacion':
        r = roomByNum(op.num);
        Object.keys(op.set || {}).forEach(function (k) { if (ROOM_KEYS.indexOf(k) >= 0) r[k] = op.set[k]; });
        return;
      case 'intervalo':
        r = roomByNum(op.num); r.intervalos = r.intervalos || [];
        if (op.accion === 'quitar') {
          var before = r.intervalos.length;
          r.intervalos = r.intervalos.filter(function (i) { return i.origen || !(i.desde === op.desde && i.hasta === op.hasta && i.estado === (op.estado || i.estado)); });
          if (r.intervalos.length === before) throw new Error('No encuentro ese intervalo en la habitación nº ' + op.num + '.');
        } else r.intervalos.push({ desde: op.desde, hasta: op.hasta, estado: op.estado === 'libre' ? 'libre' : 'ocupada' });
        return;
      case 'inquilina':
        var fields = {}; TENANT_FIELDS.forEach(function (f) { if (op[f.k] != null) fields[f.k] = op[f.k]; });
        if (!fields.nombre) throw new Error('Falta el nombre de la inquilina.');
        var q = norm(fields.nombre + ' ' + (fields.apellidos || ''));
        t = G.inquilinas.filter(function (x) { return norm(fullName(x)) === q; })[0];
        if (t) Object.keys(fields).forEach(function (k) { t[k] = fields[k]; });
        else { fields.id = uid(); fields.creada = today(); G.inquilinas.push(fields); }
        return;
      case 'contrato':
        t = tenantByName(op.inquilina); r = roomByNum(op.num);
        if (!op.desde || !op.hasta || op.desde > op.hasta) throw new Error('Fechas de contrato no válidas.');
        var clash = G.contratos.filter(function (o) { return o.habitacionId === r.id && o.desde <= op.hasta && o.hasta >= op.desde; })[0];
        if (clash) throw new Error('La habitación nº ' + op.num + ' ya tiene contrato en esas fechas (' + fullName(tenant(clash.inquilinaId)) + ').');
        c = { id: uid(), inquilinaId: t.id, habitacionId: r.id, desde: op.desde, hasta: op.hasta,
          precio: op.precio != null ? op.precio : B.priceFor(r, op.desde), gastos: op.gastos != null ? op.gastos : r.gastos,
          fianza: op.fianza != null ? op.fianza : B.priceFor(r, op.desde), fianzaEstado: op.fianzaEstado || 'pendiente',
          diaPago: op.diaPago || 5, notas: op.notas || '' };
        G.contratos.push(c); genCobros(c);
        return;
      case 'fin-contrato':
        t = tenantByName(op.inquilina);
        var cs = G.contratos.filter(function (x) { return x.inquilinaId === t.id && (!op.num || x.habitacionId === roomByNum(op.num).id); })
          .sort(function (a, b) { return a.desde < b.desde ? 1 : -1; });
        if (!cs.length) throw new Error('No encuentro el contrato de ' + op.inquilina + '.');
        c = cs[0]; if (op.hasta < c.desde) throw new Error('La salida es anterior a la entrada.');
        var clash2 = G.contratos.filter(function (o) { return o !== c && o.habitacionId === c.habitacionId && o.desde <= op.hasta && o.hasta >= c.desde; })[0];
        if (clash2) throw new Error('Con esa salida se pisaría con el contrato de ' + fullName(tenant(clash2.inquilinaId)) + ' (' + fmt(clash2.desde) + ' → ' + fmt(clash2.hasta) + ').');
        c.hasta = op.hasta; genCobros(c);
        return;
      case 'cobro-pagado':
        t = tenantByName(op.inquilina);
        var ids = G.contratos.filter(function (x) { return x.inquilinaId === t.id; }).map(function (x) { return x.id; });
        var x = G.cobros.filter(function (k) { return !k.pagado && ids.indexOf(k.contratoId) >= 0 && norm(k.concepto).indexOf(norm(op.concepto)) === 0; })[0];
        if (!x) throw new Error('No encuentro el cobro pendiente "' + op.concepto + '" de ' + op.inquilina + '.');
        x.pagado = true; x.fechaPago = op.fecha || today(); x.metodo = op.metodo || 'Transferencia';
        return;
      case 'factura':
        if (!(num(op.importe) > 0) || !op.desde || !op.hasta || op.desde > op.hasta) throw new Error('Factura sin importe o con fechas no válidas.');
        G.consumos = G.consumos || [];
        if (G.consumos.some(function (f) { return f.tipo === op.suministro && f.desde === op.desde && f.hasta === op.hasta && num(f.importe) === num(op.importe); })) return; // ya estaba
        G.consumos.push({ id: uid(), tipo: SUMIN.some(function (x) { return x[0] === op.suministro; }) ? op.suministro : 'otro', importe: num(op.importe), desde: op.desde, hasta: op.hasta, nota: op.nota || '', docs: [], creadoEn: now() });
        return;
      case 'borrar-factura':
        G.consumos = (G.consumos || []).filter(function (f) {
          var tipoOk = f.tipo === op.suministro || (f.tipo === 'otro' && op.suministro === 'limpieza' && /limpi/.test(norm(f.nota || '')));
          return !(tipoOk && f.desde === op.desde && f.hasta === op.hasta);
        });
        return; // si ya no estaba, no pasa nada
      case 'gasto-fijo':
        if (!(num(op.importe) > 0) || !op.desde) throw new Error('Gasto fijo sin importe o sin fecha de inicio.');
        G.consumosCfg.fijos = G.consumosCfg.fijos || [];
        if (G.consumosCfg.fijos.some(function (x) { return x.tipo === op.concepto && x.desde === op.desde && num(x.importe) === num(op.importe); })) return; // ya estaba
        G.consumosCfg.fijos.push({ id: uid(), tipo: SUMIN.some(function (x) { return x[0] === op.concepto; }) ? op.concepto : 'otro', importe: num(op.importe), desde: op.desde, hasta: op.hasta || '', nota: op.nota || '', creadoEn: now() });
        return;
      case 'incidencia':
        if (!op.titulo) throw new Error('Falta el título de la incidencia.');
        G.incidencias.push({ id: uid(), fecha: op.fecha || today(), habitacionId: op.num === 'comun' || !op.num ? 'comun' : roomByNum(op.num).id,
          inquilinaId: op.inquilina ? tenantByName(op.inquilina).id : '', titulo: op.titulo, detalle: op.detalle || '', estado: op.estado || 'abierta', coste: num(op.coste) });
        return;
      case 'ajustes':
        var aj = A.data().ajustes = A.data().ajustes || {};
        Object.keys(op.set || {}).forEach(function (k) { aj[k] = op.set[k]; });
        return;
      default: throw new Error('Operación desconocida: ' + op.tipo);
    }
  }
  function applyChange(ch) {
    var backupG = JSON.stringify(G), backupR = JSON.stringify(A.data().rooms), backupA = JSON.stringify(A.data().ajustes || {});
    try { (ch.ops || []).forEach(runOp); }
    catch (e) {
      G = JSON.parse(backupG); A.data().rooms = JSON.parse(backupR); A.data().ajustes = JSON.parse(backupA);
      return e.message;
    }
    G.cambios = G.cambios || []; G.cambios.push({ id: ch.id, estado: 'aplicado', fecha: today() });
    syncRooms(); save(); return null;
  }
  function renderPend() {
    var el = $('pend'), done = (G.cambios || []).map(function (x) { return x.id; });
    var list = PEND.filter(function (ch) { return ch && ch.id && done.indexOf(ch.id) < 0; });
    el.hidden = !list.length;
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<h2>Cambios preparados por Claude (' + list.length + ')</h2><p class="hint">Revisa cada uno. No se aplica nada hasta que pulses <b>Aplicar</b>.</p>' +
      list.map(function (ch) {
        var lines; try { lines = (ch.ops || []).map(function (op) { return '<li>' + esc(describe(op)) + '</li>'; }).join(''); } catch (e) { lines = '<li>' + esc(e.message) + '</li>'; }
        return '<div class="pc" data-ch="' + esc(ch.id) + '"><b>' + esc(ch.resumen || ch.id) + '</b>' + (ch.fecha ? '<small class="hint">Preparado el ' + fmt(ch.fecha) + '</small>' : '') +
          '<ul>' + lines + '</ul><p class="perr" hidden></p><div class="row"><button type="button" class="btn" data-ok>Aplicar</button><button type="button" class="btn plain" data-no>Descartar</button></div></div>';
      }).join('');
    el.querySelectorAll('.pc').forEach(function (card) {
      var ch = list.filter(function (x) { return x.id === card.getAttribute('data-ch'); })[0];
      card.querySelector('[data-ok]').onclick = function () {
        var err = applyChange(ch);
        if (err) { var p = card.querySelector('.perr'); p.textContent = 'No se ha aplicado: ' + err; p.hidden = false; return; }
        A.alert('Cambio aplicado: ' + (ch.resumen || ch.id)); renderPend(); A.refresh(); refresh();
      };
      card.querySelector('[data-no]').onclick = function () {
        if (this.dataset.sure !== '1') { this.dataset.sure = '1'; this.textContent = 'Pulsa otra vez para descartar'; return; }
        G.cambios = G.cambios || []; G.cambios.push({ id: ch.id, estado: 'descartado', fecha: today() }); save(); renderPend();
      };
    });
  }

  /* ---------- Arranque ---------- */
  window.BSLGestion = {
    confirmKey: confirmKey,
    start: function (admin) {
      A = admin; box = $('tab-g'); dlg = $('gdlg');
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pg]'); if (!b || b.disabled) return;
        var holder = b.closest('.card'), top = holder ? holder.getBoundingClientRect().top + window.scrollY - 130 : 0;
        PAGES[b.getAttribute('data-pgk')] = +b.getAttribute('data-pg');
        show(tab); window.scrollTo(0, Math.max(0, top));
      });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
      $('tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { detail = null; show(b.getAttribute('data-t')); if (b.getAttribute('data-t') === 'sol') loadSol(); } };
      return B.store.loadGestion().then(function (g) {
        G = g; G.cambios = G.cambios || []; G.consumos = G.consumos || []; G.consumosCfg = G.consumosCfg || {};
        // Limpieza: cobros pendientes que se quedaron sin inquilina ni contrato (de fichas borradas)
        var huerf = G.cobros.filter(function (x) { return !x.pagado && !contract(x.contratoId) && !tenant(x.inquilinaId); });
        if (huerf.length && !document.body.classList.contains('ro')) { G.cobros = G.cobros.filter(function (x) { return huerf.indexOf(x) < 0; }); save(); }
        // Facturas y gastos fijos que se metieron como «Otro» con nota de limpieza → categoría Limpieza
        var reca = G.consumos.concat(G.consumosCfg.fijos || []).filter(function (x) { return x && x.tipo === 'otro' && /limpi/.test(norm(x.nota || '')); });
        if (reca.length && !document.body.classList.contains('ro')) { reca.forEach(function (x) { x.tipo = 'limpieza'; x.editadoEn = now(); }); save(); }
        renderTabs(); show(tab);
        B.store.loadCambios().then(function (list) { PEND = list; renderPend(); });
        loadSol();
      }, function (err) {
        if (err.status === 401) return A.expired();
        G = { inquilinas: [], contratos: [], cobros: [], incidencias: [] }; renderTabs();
        A.alert('No se han podido cargar los datos de gestión: ' + err.message);
      });
    },
    tenantForOrigin: function (origen) {
      if (!G || !origen) return null;
      var c = contract(origen.slice(2)); return c ? fullName(tenant(c.inquilinaId)) : null;
    }
  };
})();
