/* BSL · Gestión interna del panel: inquilinas, contratos, cobros, incidencias, ocupación y ajustes.
 * Los datos personales se guardan en privado (api/gestion). Los contratos marcan solos
 * la ocupación de cada habitación en la web (sin datos personales).
 */
(function () {
  'use strict';
  var B = window.BSL, A = null, G = null, tab = 'hab', saveT = null, detail = null;
  var box, dlg;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var METODOS = ['Transferencia', 'Bizum', 'Efectivo', 'Tarjeta', 'Otro'];

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
      if (this.dataset.sure !== '1') { this.dataset.sure = '1'; this.textContent = 'Pulsa otra vez para borrar'; return; }
      o.onDelete(); dlg.close();
    };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    return { read: read };
  }

  /* ---------- Pestañas ---------- */
  var TABS = [['hab', 'Habitaciones'], ['inq', 'Inquilinas'], ['cob', 'Cobros'], ['inc', 'Incidencias'], ['ocu', 'Ocupación'], ['aju', 'Ajustes']];
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
    ({ inq: viewTenants, cob: viewCobros, inc: viewIncidencias, ocu: viewOcupacion, aju: viewAjustes })[t]();
    window.scrollTo(0, 0);
  }
  function refresh() { renderTabs(); if (tab !== 'hab') show(tab); }

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
      (list.length ? '<div class="tlist">' + list.map(function (t) {
        var c = activeContract(t.id), d = debt(t.id);
        return '<button type="button" class="tcard" data-id="' + t.id + '"><b>' + esc(fullName(t)) + '</b>' +
          '<small>' + (c ? esc(roomName(c.habitacionId)) + ' · ' + fmt(c.desde) + ' → ' + fmt(c.hasta) : 'Sin contrato en curso') + '</small>' +
          (t.universidad ? '<small>' + esc(t.universidad) + '</small>' : '') +
          (d ? chip('vencido', 'Debe ' + money(d)) : chip('pagado', 'Al día')) + '</button>';
      }).join('') + '</div>' : '<p class="empty">Todavía no hay inquilinas. Pulsa <b>+ Nueva inquilina</b> para dar de alta la primera.</p>');
    $('q').oninput = function () { box.dataset.q = this.value; var pos = this.selectionStart; viewTenants(); $('q').focus(); $('q').setSelectionRange(pos, pos); };
    $('new-t').onclick = function () {
      openForm({ title: 'Nueva inquilina', fields: TENANT_FIELDS, values: {}, ok: 'Crear', onSave: function (v) {
        if (!v.nombre) return 'Pon al menos el nombre.';
        v.id = uid(); v.creada = today(); G.inquilinas.push(v); save(); detail = v.id; show('inq');
      } });
    };
    box.querySelectorAll('.tcard').forEach(function (b) { b.onclick = function () { detail = b.getAttribute('data-id'); show('inq'); }; });
  }

  function cobroRows(list, showWho) {
    if (!list.length) return '<p class="empty">No hay cobros.</p>';
    return '<div class="tscroll"><table class="gt"><thead><tr><th>Vence</th>' + (showWho ? '<th>Inquilina</th><th>Habitación</th>' : '') + '<th>Concepto</th><th class="r">Importe</th><th>Estado</th><th></th></tr></thead><tbody>' +
      list.sort(function (a, b) { return a.vence < b.vence ? -1 : 1; }).map(function (x) {
        var st = cobroState(x), c = contract(x.contratoId), t = tenantOfCobro(x);
        return '<tr><td>' + fmt(x.vence) + '</td>' + (showWho ? '<td>' + esc(fullName(t)) + '</td><td>' + esc(c ? roomName(c.habitacionId) : '—') + '</td>' : '') +
          '<td>' + esc(x.concepto) + '</td><td class="r">' + money(x.importe) + '</td>' +
          '<td>' + chip(st, st === 'pagado' ? 'Pagado ' + fmt(x.fechaPago) + (x.metodo ? ' · ' + x.metodo : '') : st === 'vencido' ? 'Vencido' : 'Pendiente') + '</td>' +
          '<td class="r"><button type="button" class="mini" data-cobro="' + x.id + '">' + (x.pagado ? 'Editar' : 'Cobrado') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
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
      '<section class="card"><div class="ch"><h3>Cobros</h3><span class="hint">Pendiente: <b>' + money(pend) + '</b></span></div>' + cobroRows(cob, false) + '</section>' +
      '<section class="card"><div class="ch"><h3>Incidencias</h3><button class="btn plain" type="button" id="new-i">+ Incidencia</button></div>' + incList(inc) + '</section>' +
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
      if (this.dataset.sure !== '1') { this.dataset.sure = '1'; this.textContent = 'Se borrarán también sus contratos y cobros. Pulsa otra vez'; return; }
      G.inquilinas = G.inquilinas.filter(function (x) { return x !== t; });
      G.contratos = G.contratos.filter(function (c) { return c.inquilinaId !== id; });
      G.cobros = G.cobros.filter(function (x) { return cids.indexOf(x.contratoId) < 0; });
      G.incidencias.forEach(function (x) { if (x.inquilinaId === id) x.inquilinaId = ''; });
      syncRooms(); save(); detail = null; show('inq');
    };
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
      '<section class="card">' + cobroRows(list, true) + '</section>';
    $('cm').onchange = function () { box.dataset.cm = this.value; viewCobros(); };
    $('cf').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) { box.dataset.cf = b.getAttribute('data-f'); viewCobros(); } };
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
  function incList(list) {
    if (!list.length) return '<p class="empty">Sin incidencias.</p>';
    return list.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }).map(function (x) {
      var s = INC_ST[x.estado] || INC_ST.abierta;
      return '<button type="button" class="crow" data-i="' + x.id + '"><span><b>' + esc(x.titulo) + '</b><small>' + fmt(x.fecha) + ' · ' + esc(roomName(x.habitacionId)) +
        (x.inquilinaId ? ' · ' + esc(fullName(tenant(x.inquilinaId))) : '') + (num(x.coste) ? ' · ' + money(x.coste) : '') + '</small>' +
        (x.detalle ? '<small>' + esc(x.detalle.slice(0, 140)) + '</small>' : '') + '</span>' + chip(s[0], s[1]) + '</button>';
    }).join('');
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
      }).join('') + '</div><section class="card">' + incList(list) + '</section>';
    $('inf').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) { box.dataset.inf = b.getAttribute('data-f'); viewIncidencias(); } };
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
      '<section class="card"><div class="tscroll"><div class="occ"><div class="orow ohead"><span class="olab"></span><div class="otrack">' +
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
      '<label class="switch"><input type="checkbox" id="aj-ya"' + (aj.entrarYa !== false ? ' checked' : '') + '> Mostrar "Para entrar ya" (habitaciones libres durante el curso en marcha)</label></section>' +
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

  /* ---------- Arranque ---------- */
  window.BSLGestion = {
    start: function (admin) {
      A = admin; box = $('tab-g'); dlg = $('gdlg');
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
      $('tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { detail = null; show(b.getAttribute('data-t')); } };
      return B.store.loadGestion().then(function (g) { G = g; renderTabs(); show(tab); }, function (err) {
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
