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
  function genCobros(c) {
    var paid = {};
    G.cobros.forEach(function (x) { if (x.contratoId === c.id && x.pagado) paid[x.tipo === 'fianza' ? 'fianza' : x.mes] = true; });
    G.cobros = G.cobros.filter(function (x) { return x.contratoId !== c.id || x.pagado || x.tipo === 'otro'; });
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
    if (num(c.fianza) > 0 && !paid.fianza) G.cobros.push({ id: uid(), contratoId: c.id, tipo: 'fianza', mes: c.desde.slice(0, 7), concepto: 'Fianza', importe: num(c.fianza), vence: c.desde, pagado: false });
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
      o.fields.forEach(function (f) { var el = $('fx-' + f.k); if (el) out[f.k] = f.type === 'number' ? num(el.value) : el.value.trim(); });
      return out;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = o.onSave(read());
      if (err) { var p = $('fx-err'); p.textContent = err; p.hidden = false; return; }
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
  var TABS = [['res', 'Panel de control'], ['hab', 'Habitaciones'], ['inq', 'Inquilinas'], ['cob', 'Cobros'], ['inc', 'Incidencias'], ['ocu', 'Ocupación'], ['aju', 'Ajustes']];
  function renderTabs() {
    $('tabs').innerHTML = TABS.map(function (t) {
      var badge = '';
      if (t[0] === 'cob') { var n = G.cobros.filter(function (x) { return cobroState(x) === 'vencido'; }).length; if (n) badge = '<i>' + n + '</i>'; }
      if (t[0] === 'inc') { var k = G.incidencias.filter(function (x) { return x.estado !== 'resuelta'; }).length; if (k) badge = '<i>' + k + '</i>'; }
      return '<button type="button" data-t="' + t[0] + '" aria-current="' + (t[0] === tab) + '">' + t[1] + badge + '</button>';
    }).join('');
  }
  function show(t) {
    tab = t; detail = t === 'inq' ? detail : null;
    renderTabs();
    $('tab-hab').hidden = t !== 'hab'; box.hidden = t === 'hab';
    if (t === 'hab') { A.refresh(); return; }
    ({ res: viewResumen, inq: viewTenants, cob: viewCobros, inc: viewIncidencias, ocu: viewOcupacion, aju: viewAjustes })[t]();
    window.scrollTo(0, 0);
  }
  function refresh() { renderTabs(); if (tab !== 'hab') show(tab); }


  /* ---------- Panel de control: todo de un vistazo ---------- */
  function viewResumen() {
    var t = today(), ym = t.slice(0, 7), act = rooms().filter(function (r) { return r.activa; });
    var y = B.courseOf(t); if (y === null) y = B.nextFullCourse(t);
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
    var months = []; for (var i = 0; i < 11; i++) { var mm = (8 + i) % 12 + 1, yy = mm >= 9 ? y : y + 1; months.push(yy + '-' + pad(mm)); }
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
    var lim = B.addDays(t, 45), moves = [];
    G.contratos.forEach(function (c) {
      if (c.desde >= t && c.desde <= lim) moves.push({ d: c.desde, k: 'Entra', c: c });
      if (c.hasta >= t && c.hasta <= lim) moves.push({ d: c.hasta, k: 'Sale', c: c });
    });
    moves.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var prox = G.cobros.filter(function (x) { return !x.pagado && x.vence >= t && x.vence <= B.addDays(t, 10); }).sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
    function who(x) { var c = contract(x.contratoId); return esc(fullName(tenantOfCobro(x))) + (c ? ' · ' + esc(room(c.habitacionId) ? room(c.habitacionId).nombre : '') : ''); }
    function list(items, empty) { return items.length ? items.join('') : '<p class="empty">' + empty + '</p>'; }
    var circ = 2 * Math.PI * 34;
    box.innerHTML = '<div class="ghead"><h2>Panel de control</h2><span class="hint">' + fmt(t) + ' · Curso ' + B.courseLabel(y) + '</span></div>' +
      '<div class="kpis">' +
        '<button type="button" class="kpi" data-go="ocu"><svg class="ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34"/><circle class="on" cx="40" cy="40" r="34" style="stroke-dasharray:' + (circ * pct / 100) + ' ' + circ + '"/></svg>' +
          '<span><small>Ocupación hoy</small><b>' + occ.length + '<em>/' + act.length + '</em></b><small>' + (free.length ? 'Libre: ' + esc(free.map(function (r) { return r.nombre; }).join(', ')) : 'Casa completa') + '</small></span></button>' +
        '<button type="button" class="kpi" data-go="cob"><span><small>Cobrado en ' + MES_LARGO[+ym.slice(5) - 1] + '</small><b>' + money(mesOk) + '</b><small>de ' + money(mesTot) + ' previstos</small><i class="kbar"><i style="width:' + (mesTot ? mesOk * 100 / mesTot : 0) + '%"></i></i></span></button>' +
        '<button type="button" class="kpi' + (venc.length ? ' bad' : '') + '" data-go="cob"><span><small>Vencido sin cobrar</small><b>' + money(vencTot) + '</b><small>' + (venc.length ? venc.length + ' cobro' + (venc.length > 1 ? 's' : '') + ' atrasado' + (venc.length > 1 ? 's' : '') : 'Todo al día') + '</small></span></button>' +
        '<button type="button" class="kpi' + (incA.length ? ' warn' : '') + '" data-go="inc"><span><small>Incidencias abiertas</small><b>' + incA.length + '</b><small>' + (incA.length ? 'Pendientes de resolver' : 'Nada pendiente') + '</small></span></button>' +
      '</div>' +
      '<div class="rgrid">' +
        '<section class="card"><h3>Ocupación del curso</h3><p class="hint">Habitaciones ocupadas cada mes (a día 15).</p>' + occChart + '</section>' +
        '<section class="card"><h3>Cobros del curso</h3><p class="hint">Mensualidades por mes, en miles de euros.</p>' + payChart +
          '<p class="legend2"><span><i class="lg ok"></i>Cobrado</span><span><i class="lg pe"></i>Pendiente</span><span><i class="lg ve"></i>Vencido</span></p></section>' +
      '</div>' +
      '<div class="rgrid r3">' +
        '<section class="card"><h3>Cobros atrasados</h3>' + list(venc.slice(0, 5).map(function (x) {
          return '<button type="button" class="crow" data-go="cob"><span><b>' + who(x) + '</b><small>' + esc(x.concepto) + ' · venció ' + fmt(x.vence) + '</small></span>' + chip('vencido', money(x.importe)) + '</button>';
        }), 'Nadie debe nada.') + (venc.length > 5 ? '<button type="button" class="btn plain sm rmore" data-go="cob">Ver los ' + venc.length + ' atrasados</button>' : '') + (prox.length ? '<h4 class="rsub">Vencen en 10 días</h4>' + prox.slice(0, 4).map(function (x) {
          return '<button type="button" class="crow" data-go="cob"><span><b>' + who(x) + '</b><small>' + esc(x.concepto) + ' · ' + fmt(x.vence) + '</small></span>' + chip('pendiente', money(x.importe)) + '</button>';
        }).join('') : '') + '</section>' +
        '<section class="card"><h3>Entradas y salidas</h3><p class="hint">Próximos 45 días.</p>' + list(moves.slice(0, 8).map(function (m) {
          var te = tenant(m.c.inquilinaId), rm = room(m.c.habitacionId);
          return '<button type="button" class="crow" data-ten="' + (te ? te.id : '') + '"><span><b>' + esc(fullName(te)) + '</b><small>' + fmt(m.d) + ' · ' + esc(rm ? rm.nombre : '') + '</small></span>' + chip(m.k === 'Entra' ? 'pagado' : 'fin', m.k) + '</button>';
        }), 'Sin entradas ni salidas.') + '</section>' +
        '<section class="card"><h3>Incidencias</h3>' + list(incA.slice(0, 6).map(function (x) {
          var s = INC_ST[x.estado] || INC_ST.abierta;
          return '<button type="button" class="crow" data-i="' + x.id + '"><span><b>' + esc(x.titulo) + '</b><small>' + fmt(x.fecha) + ' · ' + esc(roomName(x.habitacionId)) + '</small></span>' + chip(s[0], s[1]) + '</button>';
        }), 'Sin incidencias abiertas.') + '</section>' +
      '</div>';
    box.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { show(b.getAttribute('data-go')); }; });
    box.querySelectorAll('[data-ten]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-ten'); if (id) { detail = id; show('inq'); } }; });
    bindInc(box);
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
      .sort(function (a, b) { return fullName(a).localeCompare(fullName(b)); });
    box.innerHTML = '<div class="ghead"><h2>Inquilinas</h2><div class="gtools"><input type="search" id="q" placeholder="Buscar por nombre, teléfono o DNI" value="' + esc(box.dataset.q || '') + '"><button class="btn" type="button" id="new-t">+ Nueva inquilina</button></div></div>' +
      (list.length ? '<div class="tlist">' + pageOf(list, 'inq', 12).map(function (t) {
        var c = activeContract(t.id), d = debt(t.id);
        return '<button type="button" class="tcard" data-id="' + t.id + '"><b>' + esc(fullName(t)) + '</b>' +
          '<small>' + (c ? esc(roomName(c.habitacionId)) + ' · ' + fmt(c.desde) + ' → ' + fmt(c.hasta) : 'Sin contrato en curso') + '</small>' +
          (t.universidad ? '<small>' + esc(t.universidad) + '</small>' : '') +
          (d ? chip('vencido', 'Debe ' + money(d)) : chip('pagado', 'Al día')) + '</button>';
      }).join('') + '</div>' + pager('inq', list.length, 12) : '<p class="empty">Todavía no hay inquilinas. Pulsa <b>+ Nueva inquilina</b> para dar de alta la primera.</p>');
    $('q').oninput = function () { box.dataset.q = this.value; PAGES.inq = 0; var pos = this.selectionStart; viewTenants(); $('q').focus(); $('q').setSelectionRange(pos, pos); };
    $('new-t').onclick = function () {
      openForm({ title: 'Nueva inquilina', fields: TENANT_FIELDS, values: {}, ok: 'Crear', onSave: function (v) {
        if (!v.nombre) return 'Pon al menos el nombre.';
        v.id = uid(); v.creada = today(); G.inquilinas.push(v); save(); detail = v.id; show('inq');
      } });
    };
    box.querySelectorAll('.tcard').forEach(function (b) { b.onclick = function () { detail = b.getAttribute('data-id'); PAGES.cobT = 0; PAGES.incT = 0; show('inq'); }; });
  }

  function cobroRows(list, showWho, key) {
    if (!list.length) return '<p class="empty">No hay cobros.</p>';
    list.sort(function (a, b) { return a.vence < b.vence ? -1 : 1; });
    var total = list.length, shown = pageOf(list, key);
    return '<table class="gt"><thead><tr><th>Vence</th>' + (showWho ? '<th>Inquilina</th><th>Habitación</th>' : '') + '<th>Concepto</th><th class="r">Importe</th><th>Estado</th><th></th></tr></thead><tbody>' +
      shown.map(function (x) {
        var st = cobroState(x), c = contract(x.contratoId), t = tenantOfCobro(x);
        var meta = 'Vence ' + fmt(x.vence) + (showWho ? ' · ' + fullName(t) + ' · ' + (c ? roomName(c.habitacionId) : '—') : '');
        return '<tr><td class="c-v">' + fmt(x.vence) + '</td>' + (showWho ? '<td class="c-q">' + esc(fullName(t)) + '</td><td class="c-h">' + esc(c ? roomName(c.habitacionId) : '—') + '</td>' : '') +
          '<td class="c-c">' + esc(x.concepto) + '</td><td class="c-m">' + esc(meta) + '</td><td class="r c-i">' + money(x.importe) + '</td>' +
          '<td class="c-e">' + chip(st, st === 'pagado' ? 'Pagado ' + fmt(x.fechaPago) + (x.metodo ? ' · ' + x.metodo : '') : st === 'vencido' ? 'Vencido' : 'Pendiente') + '</td>' +
          '<td class="r c-a"><button type="button" class="mini" data-cobro="' + x.id + '">' + (x.pagado ? 'Editar' : 'Cobrado') + '</button></td></tr>';
      }).join('') + '</tbody></table>' + pager(key, total);
  }
  function bindCobros(root) {
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
            x.pagado = v.pagado === 'si'; x.fechaPago = x.pagado ? v.fechaPago : ''; x.metodo = x.pagado ? v.metodo : '';
            x.importe = v.importe; x.vence = v.vence; x.nota = v.nota; save(); refresh();
          },
          onDelete: function () { G.cobros = G.cobros.filter(function (c) { return c !== x; }); save(); refresh(); }
        });
      };
    });
  }

  function contractForm(tid, c) {
    var isNew = !c; c = c || {};
    var y0 = B.courseOf(today()), yn = B.nextFullCourse(today());
    var r0 = c.habitacionId ? room(c.habitacionId) : rooms()[0];
    var quick = '<div class="quick"><span class="hint">Rellenar fechas:</span>' +
      [yn, yn + 1].map(function (y) { return '<button type="button" data-q="' + y + '">Curso ' + B.courseLabel(y) + '</button>'; }).join('') +
      (y0 !== null ? '<button type="button" data-q="resto">Desde hoy hasta 31 jul ' + (y0 + 1) + '</button>' : '') + '</div>';
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
        { k: 'notas', label: 'Notas del contrato', type: 'textarea' }
      ],
      values: {
        habitacionId: c.habitacionId || (r0 && r0.id), desde: c.desde || '', hasta: c.hasta || '',
        precio: c.precio != null ? c.precio : r0 && r0.precio, gastos: c.gastos != null ? c.gastos : r0 && r0.gastos,
        fianza: c.fianza != null ? c.fianza : r0 && r0.precio, fianzaEstado: c.fianzaEstado || 'pendiente', diaPago: c.diaPago || 5, notas: c.notas || ''
      },
      ok: isNew ? 'Crear contrato' : 'Guardar',
      onChange: function (e) {
        if (e.target.id === 'fx-habitacionId' && isNew) { var r = room(e.target.value); if (r) { $('fx-precio').value = r.precio; $('fx-gastos').value = r.gastos; $('fx-fianza').value = r.precio; } }
      },
      onSave: function (v) {
        if (!v.desde || !v.hasta || v.desde > v.hasta) return 'Pon la fecha de entrada y la de salida (la salida después de la entrada).';
        var clash = G.contratos.filter(function (o) { return o.id !== c.id && o.habitacionId === v.habitacionId && o.desde <= v.hasta && o.hasta >= v.desde; })[0];
        if (clash) return 'Esa habitación ya tiene un contrato en esas fechas (' + fullName(tenant(clash.inquilinaId)) + ', ' + fmt(clash.desde) + ' → ' + fmt(clash.hasta) + ').';
        delete v.q;
        Object.keys(v).forEach(function (k) { c[k] = v[k]; });
        c.diaPago = Math.min(28, Math.max(1, num(v.diaPago) || 5));
        if (isNew) { c.id = uid(); c.inquilinaId = tid; G.contratos.push(c); }
        if (c.fianzaEstado === 'cobrada') G.cobros.forEach(function (x) { if (x.contratoId === c.id && x.tipo === 'fianza' && !x.pagado) { x.pagado = true; x.fechaPago = today(); } });
        genCobros(c); syncRooms(); save(); refresh();
      },
      needKey: 'Vas a borrar este contrato: la habitación quedará libre en la web y se quitarán sus cobros pendientes.',
      onDelete: isNew ? null : function () {
        G.contratos = G.contratos.filter(function (o) { return o !== c; });
        G.cobros = G.cobros.filter(function (x) { return x.contratoId !== c.id || x.pagado; });
        syncRooms(); save(); refresh();
      }
    });
    dlg.querySelector('.quick').onclick = function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return;
      var q = b.getAttribute('data-q');
      if (q === 'resto') { $('fx-desde').value = today(); $('fx-hasta').value = (y0 + 1) + '-07-31'; }
      else { var rg = B.periodRange('curso', +q); $('fx-desde').value = rg.from; $('fx-hasta').value = rg.to; }
    };
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
    box.innerHTML = '<button type="button" class="back" id="back">← Inquilinas</button>' +
      '<div class="ghead"><h2>' + esc(fullName(t)) + '</h2><div class="gtools">' +
      (t.telefono ? '<a class="btn plain" href="https://wa.me/' + esc(String(t.telefono).replace(/\D/g, '').replace(/^(?!34)(\d{9})$/, '34$1')) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      '<button class="btn plain" type="button" id="edit-t">Editar datos</button></div></div>' +
      '<section class="card"><h3>Datos</h3><dl class="kv">' + TENANT_FIELDS.filter(function (f) { return t[f.k]; }).map(function (f) {
        var v = f.type === 'date' ? fmt(t[f.k]) : t[f.k];
        return '<div><dt>' + esc(f.label) + '</dt><dd>' + esc(v) + '</dd></div>';
      }).join('') + '</dl></section>' +
      '<section class="card"><div class="ch"><h3>Contratos</h3><button class="btn" type="button" id="new-c">+ Nuevo contrato</button></div>' +
      (cs.length ? cs.map(function (c) {
        var now = today(), st = c.hasta < now ? ['fin', 'Terminado'] : c.desde > now ? ['pendiente', 'Próximo'] : ['pagado', 'En curso'];
        return '<button type="button" class="crow" data-c="' + c.id + '"><span><b>' + esc(roomName(c.habitacionId)) + '</b><small>' + fmt(c.desde) + ' → ' + fmt(c.hasta) + ' · ' + money(c.precio) + ' + ' + money(c.gastos) + ' gastos · día ' + (c.diaPago || 5) + '</small>' +
          '<small>Fianza ' + money(c.fianza) + ' · ' + esc({ pendiente: 'pendiente', cobrada: 'cobrada', devuelta: 'devuelta' }[c.fianzaEstado || 'pendiente']) + '</small></span>' + chip(st[0], st[1]) + '</button>';
      }).join('') : '<p class="empty">Sin contratos. Crea uno para asignarle habitación: la web la marcará ocupada y se generarán los cobros.</p>') + '</section>' +
      '<section class="card"><div class="ch"><h3>Cobros</h3><span class="hint">Pendiente: <b>' + money(pend) + '</b></span></div>' + cobroRows(cob, false, 'cobT') + '</section>' +
      '<section class="card"><div class="ch"><h3>Incidencias</h3><button class="btn plain" type="button" id="new-i">+ Incidencia</button></div>' + incList(inc, 'incT') + '</section>' +
      '<div class="foot"><span class="hint">Alta: ' + fmt(t.creada) + '</span><button class="btn plain danger" type="button" id="del-t">Borrar inquilina</button></div>';
    $('back').onclick = function () { detail = null; show('inq'); };
    $('edit-t').onclick = function () {
      openForm({ title: 'Datos de ' + fullName(t), fields: TENANT_FIELDS, values: t, onSave: function (v) {
        if (!v.nombre) return 'Pon al menos el nombre.';
        Object.keys(v).forEach(function (k) { t[k] = v[k]; }); save(); refresh();
      } });
    };
    $('new-c').onclick = function () { contractForm(id, null); };
    box.querySelectorAll('[data-c]').forEach(function (b) { b.onclick = function () { contractForm(id, contract(b.getAttribute('data-c'))); }; });
    $('new-i').onclick = function () { incForm(null, { inquilinaId: id, habitacionId: (activeContract(id) || {}).habitacionId }); };
    bindInc(box); bindCobros(box);
    $('del-t').onclick = function () {
      confirmKey('Vas a borrar a ' + fullName(t) + ' con sus contratos y cobros. No se puede deshacer.').then(function (ok) { if (ok) delTenant(); });
    };
    function delTenant() {
      G.inquilinas = G.inquilinas.filter(function (x) { return x !== t; });
      G.contratos = G.contratos.filter(function (c) { return c.inquilinaId !== id; });
      G.cobros = G.cobros.filter(function (x) { return cids.indexOf(x.contratoId) < 0; });
      G.incidencias.forEach(function (x) { if (x.inquilinaId === id) x.inquilinaId = ''; });
      syncRooms(); save(); detail = null; show('inq');
    }
  }

  /* ---------- Cobros ---------- */
  function viewCobros() {
    var f = box.dataset.cf || 'abiertos', mesSel = box.dataset.cm || today().slice(0, 7);
    var meses = G.cobros.map(function (x) { return x.mes || (x.vence || '').slice(0, 7); }).concat([today().slice(0, 7)])
      .filter(function (m, i, a) { return m && a.indexOf(m) === i; }).sort();
    var inMes = function (x) { return mesSel === 'todos' || (x.mes || (x.vence || '').slice(0, 7)) === mesSel; };
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
    box.innerHTML = '<div class="ghead"><h2>Cobros</h2><div class="gtools"><select id="cm">' +
      '<option value="todos"' + (mesSel === 'todos' ? ' selected' : '') + '>Todos los meses</option>' +
      meses.map(function (m) { return '<option value="' + m + '"' + (m === mesSel ? ' selected' : '') + '>' + mesLabel(m) + '</option>'; }).join('') +
      '</select><button class="btn plain" type="button" id="new-x">+ Cobro manual</button></div></div>' +
      '<div class="tiles"><div><small>Previsto</small><b>' + money(prev) + '</b></div><div><small>Cobrado</small><b class="ok">' + money(cobrado) + '</b></div>' +
      '<div><small>Por cobrar</small><b>' + money(prev - cobrado) + '</b></div><div><small>Vencido (total)</small><b class="bad">' + money(vencidoTotal) + '</b></div></div>' +
      '<div class="seg2" id="cf">' + [['abiertos', 'Pendientes'], ['vencido', 'Vencidos'], ['pagado', 'Pagados'], ['todos', 'Todos']].map(function (o) {
        return '<button type="button" data-f="' + o[0] + '" aria-current="' + (o[0] === f) + '">' + o[1] + '</button>';
      }).join('') + '</div>' +
      '<section class="card">' + cobroRows(list, true, 'cob') + '</section>';
    $('cm').onchange = function () { box.dataset.cm = this.value; PAGES.cob = 0; viewCobros(); };
    $('cf').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) { box.dataset.cf = b.getAttribute('data-f'); PAGES.cob = 0; viewCobros(); } };
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
          G.cobros.push({ id: uid(), contratoId: v.contratoId, tipo: 'otro', mes: v.vence.slice(0, 7), concepto: v.concepto, importe: v.importe, vence: v.vence, pagado: false });
          save(); refresh();
        } });
    };
    bindCobros(box);
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
        (x.detalle ? '<small>' + esc(x.detalle.slice(0, 140)) + '</small>' : '') + '</span>' + chip(s[0], s[1]) + '</button>';
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
        if (isNew) { x.id = uid(); G.incidencias.push(x); }
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
      return '<div class="orow"><span class="olab">Nº ' + r.num + '<small>' + esc(r.nombre) + '</small></span><div class="otrack">' + manual + bars +
        (t >= start && t <= end ? '<i class="onow" style="left:' + pos(t) + '%"></i>' : '') + '</div></div>';
    }).join('');
    var ys = []; for (var k = -2; k <= 3; k++) ys.push((B.courseOf(today()) || B.nextFullCourse(today()) - 1) + k);
    box.innerHTML = '<div class="ghead"><h2>Ocupación</h2><div class="gtools"><select id="oy">' + ys.map(function (c) { return '<option value="' + c + '"' + (c === y ? ' selected' : '') + '>Curso ' + B.courseLabel(c) + '</option>'; }).join('') + '</select></div></div>' +
      '<p class="hint">Libres hoy: <b>' + (libresHoy.length ? libresHoy.join(', ') : 'ninguna') + '</b></p>' +
      '<section class="card"><div class="tscroll"><div class="occgrid"><div class="orow ohead"><span class="olab"></span><div class="otrack">' +
      months.map(function (m) { return '<span>' + B.MESES[m] + '</span>'; }).join('') + '</div></div>' + rows + '</div></div>' +
      '<p class="legend2"><span><i class="bar-s"></i>Contrato (nombre de la inquilina)</span><span><i class="bar-s man"></i>Ocupada a mano</span><span><i class="now-s"></i>Hoy</span></p></section>';
    $('oy').onchange = function () { box.dataset.oy = this.value; viewOcupacion(); };
  }

  /* ---------- Ajustes ---------- */
  function viewAjustes() {
    var d = A.data(); d.ajustes = d.ajustes || {};
    var aj = d.ajustes, yn = B.nextFullCourse(today()), vis = B.visibleCourses(aj, today());
    var cands = [yn, yn + 1, yn + 2];
    box.innerHTML = '<div class="ghead"><h2>Ajustes</h2></div>' +
      '<section class="card"><h3>Cursos que se ven en la web</h3><p class="hint">Marca los cursos completos que las chicas pueden reservar. El primero sale como "Principal".</p>' +
      '<div class="checks">' + cands.map(function (y) { return '<label class="switch"><input type="checkbox" data-y="' + y + '"' + (vis.indexOf(y) >= 0 ? ' checked' : '') + '> Curso ' + B.courseLabel(y) + ' <small>(1 sep ' + y + ' – 31 jul ' + (y + 1) + ')</small></label>'; }).join('') + '</div>' +
      '<label class="switch"><input type="checkbox" id="aj-ya"' + (aj.entrarYa !== false ? ' checked' : '') + '> Mostrar "Libres este curso" (habitaciones que ya están libres o que quedan libres en una fecha del curso en marcha, hasta el 31 de julio)</label></section>' +
      '<section class="card"><h3>Copia de seguridad</h3><p class="hint">Descarga en un archivo todas las habitaciones, inquilinas, contratos, cobros e incidencias. Guárdalo en un sitio seguro: contiene datos personales.</p>' +
      '<div><button class="btn plain" type="button" id="backup">Descargar copia</button></div></section>';
    box.querySelectorAll('[data-y]').forEach(function (c) {
      c.onchange = function () {
        var ys = []; box.querySelectorAll('[data-y]').forEach(function (x) { if (x.checked) ys.push(+x.getAttribute('data-y')); });
        if (!ys.length) { this.checked = true; A.alert('Tiene que quedar al menos un curso visible.'); return; }
        aj.cursos = ys; A.saveRooms();
      };
    });
    $('aj-ya').onchange = function () { aj.entrarYa = this.checked; A.saveRooms(); };
    $('backup').onclick = function () {
      var blob = new Blob([JSON.stringify({ fecha: new Date().toISOString(), habitaciones: A.data(), gestion: G }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bsl-copia-' + today() + '.json';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
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
      case 'ajustes': return 'Ajustes → ' + sets(op.set);
      default: return 'Operación desconocida: ' + op.tipo;
    }
  }
  var ROOM_KEYS = ['nombre', 'precio', 'gastos', 'm2', 'cama', 'descripcion', 'activa', 'equipamiento'];
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
          precio: op.precio != null ? op.precio : r.precio, gastos: op.gastos != null ? op.gastos : r.gastos,
          fianza: op.fianza != null ? op.fianza : r.precio, fianzaEstado: op.fianzaEstado || 'pendiente',
          diaPago: op.diaPago || 5, notas: op.notas || '' };
        G.contratos.push(c); genCobros(c);
        return;
      case 'fin-contrato':
        t = tenantByName(op.inquilina);
        var cs = G.contratos.filter(function (x) { return x.inquilinaId === t.id && (!op.num || x.habitacionId === roomByNum(op.num).id); })
          .sort(function (a, b) { return a.desde < b.desde ? 1 : -1; });
        if (!cs.length) throw new Error('No encuentro el contrato de ' + op.inquilina + '.');
        c = cs[0]; if (op.hasta < c.desde) throw new Error('La salida es anterior a la entrada.');
        c.hasta = op.hasta; genCobros(c);
        return;
      case 'cobro-pagado':
        t = tenantByName(op.inquilina);
        var ids = G.contratos.filter(function (x) { return x.inquilinaId === t.id; }).map(function (x) { return x.id; });
        var x = G.cobros.filter(function (k) { return !k.pagado && ids.indexOf(k.contratoId) >= 0 && norm(k.concepto).indexOf(norm(op.concepto)) === 0; })[0];
        if (!x) throw new Error('No encuentro el cobro pendiente "' + op.concepto + '" de ' + op.inquilina + '.');
        x.pagado = true; x.fechaPago = op.fecha || today(); x.metodo = op.metodo || 'Transferencia';
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
      $('tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { detail = null; show(b.getAttribute('data-t')); } };
      return B.store.loadGestion().then(function (g) {
        G = g; G.cambios = G.cambios || []; renderTabs(); show(tab);
        B.store.loadCambios().then(function (list) { PEND = list; renderPend(); });
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
