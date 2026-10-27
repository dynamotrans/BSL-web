/* Menú ☰ de la cabecera en móvil (portada y páginas de sección). */
(function () {
  var b = document.getElementById('mn-btn'), m = document.getElementById('mn-panel'), top = document.getElementById('top');
  if (!b || !m) return;
  var here = location.pathname.replace(/\/$/, '') || '/';
  m.querySelectorAll('a').forEach(function (a) { if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page'); });
  function set(on) {
    m.hidden = !on; b.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (top) top.classList.toggle('mn-open', on);
  }
  b.addEventListener('click', function (e) { e.stopPropagation(); set(m.hidden); });
  m.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
  document.addEventListener('click', function (e) { if (!m.hidden && !m.contains(e.target) && e.target !== b) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 900) set(false); });
})();
