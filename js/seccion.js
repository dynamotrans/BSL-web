/* Páginas de sección (/habitaciones…): botón «volver arriba», año del pie, enlaces de WhatsApp y
 * datos en directo del panel (precio, medidas, cama, equipamiento, fotos y disponibilidad).
 * Lo que trae el HTML generado es el respaldo si no se pueden leer los datos. */
(function () {
  var B = window.BSL;
  var y = document.getElementById('y'); if (y) y.textContent = new Date().getFullYear();

  var totop = document.getElementById('totop');
  if (totop) {
    var onScroll = function () { totop.classList.toggle('show', window.scrollY > window.innerHeight * 0.8); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    totop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  var wa = (window.BSL_CONFIG && window.BSL_CONFIG.whatsapp) || '';
  if (wa) document.querySelectorAll('.js-wa').forEach(function (a) {
    a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hola, me interesa una habitación en BSL · Boutique Student Living (Dos Hermanas).');
    a.target = '_blank'; a.rel = 'noopener';
  });

  if (!B || !document.querySelector('[data-room]')) return;
  var now = B.today(), inCourse = B.courseOf(now);
  function set(box, f, v) { box.querySelectorAll('[data-f="' + f + '"]').forEach(function (el) { el.textContent = v; }); }

  // Mismo criterio que las tarjetas de la portada: primero «para entrar ya» (resto del curso), si no el próximo curso
  function estado(r, aj) {
    var os = B.options(r, now, aj), resto = os.filter(function (o) { return o.key === 'resto'; })[0];
    var entrarYa = inCourse !== null && !(aj && aj.entrarYa === false);
    if (entrarYa && resto) return { kind: resto.from === now ? 'libre' : 'parcial', text: resto.from === now ? 'Libre ya' : 'Libre el ' + B.fmt(resto.from, true), y: inCourse };
    var c = os.filter(function (o) { return o.main; })[0] || os[0];
    if (!c) return null;
    var yl = c.y + '/' + (c.y + 1);
    if (c.st.kind === 'parcial') return { kind: 'parcial', text: c.st.from ? 'Libre el ' + B.fmt(c.st.from, true) : 'Libre hasta el ' + B.fmt(c.st.to, true), y: c.y };
    return { kind: c.st.kind, text: (c.st.kind === 'libre' ? 'Libre ' : 'Ocupada ') + yl, y: c.y };
  }

  B.store.load().then(function (d) {
    if (!d || d.demo || !B.store.remote) return; // sin datos reales: se queda lo generado
    var aj = d.ajustes || {}, ps = [];
    d.rooms.forEach(function (r) {
      document.querySelectorAll('[data-room="' + r.id + '"]').forEach(function (box) {
        if (!r.activa) { if (box.tagName === 'ARTICLE') box.hidden = true; return; }
        var st = estado(r, aj), yr = st ? st.y : B.visibleCourses(aj, now)[0];
        var p = B.priceFor(r, yr); if (p > 0) ps.push(p);
        set(box, 'm2', B.m2(r.m2)); set(box, 'cama', r.cama); set(box, 'precio', p); set(box, 'gastos', r.gastos);
        set(box, 'equip', (r.equipamiento || []).join(', '));
        var f0 = r.fotos && r.fotos[0] ? (/^(\/|http)/.test(r.fotos[0]) ? r.fotos[0] : '/' + r.fotos[0]) : '';
        var img = box.querySelector('[data-f="foto"]'); if (img && f0 && img.getAttribute('src') !== f0) img.src = f0;
        var ia = box.querySelector('[data-f="ia"]'); if (ia) ia.hidden = !(r.fotosIA && r.fotos && r.fotos.length);
        var badge = box.querySelector('[data-f="estado"]');
        if (badge && st) { badge.className = 'sp-st ' + st.kind; badge.lastChild.textContent = st.text; }
      });
    });
    if (ps.length) {
      var mn = Math.min.apply(null, ps), mx = Math.max.apply(null, ps);
      document.querySelectorAll('.js-pmin').forEach(function (el) { el.textContent = mn; });
      document.querySelectorAll('.js-pmax').forEach(function (el) { el.textContent = mx; });
      document.querySelectorAll('meta[name="description"],meta[property="og:description"]').forEach(function (mt) { mt.content = mt.content.replace(/([Dd])esde \d+ €/, '$1esde ' + mn + ' €'); });
    }
    var g = d.rooms.filter(function (r) { return r.activa; })[0];
    if (g) document.querySelectorAll('.js-gastos').forEach(function (el) { el.textContent = g.gastos; });
  });
})();
