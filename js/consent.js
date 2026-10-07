/* Etiqueta de Google Ads (AW-963063774) con modo de consentimiento v2.
 * Por defecto todo denegado: Google solo recibe avisos sin cookies hasta que la visitante pulsa «Aceptar».
 * La elección se guarda en localStorage (bsl_consent = 'si' | 'no'). Cualquier enlace con
 * data-ck-open vuelve a abrir el aviso. Clases con prefijo ck- para no chocar con la web. */
(function () {
  var ID = 'AW-963063774', KEY = 'bsl_consent';
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  function leer() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function estado(si) {
    var v = si ? 'granted' : 'denied';
    return { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v };
  }

  var elegido = leer();
  var def = estado(false); def.wait_for_update = 500;
  gtag('consent', 'default', def);
  if (elegido === 'si') gtag('consent', 'update', estado(true));
  gtag('set', 'ads_data_redaction', true);
  gtag('js', new Date());
  gtag('config', ID);

  // Conversión «contact» (Google Ads): al pulsar un enlace de WhatsApp o al enviar una solicitud.
  // Una sola vez por visita a la página, para no contar doble (solicitud + WhatsApp del mismo paso).
  var contado = false;
  window.bslContacto = function (via) {
    if (contado) return; contado = true;
    gtag('event', 'contact', { method: via || 'web' });
  };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me/"],a[href*="api.whatsapp.com"]');
    if (a) window.bslContacto('whatsapp');
  }, true);

  var s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);

  var css = '.ck-bar{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:200;max-width:420px;width:calc(100% - 24px);padding:16px 18px;border-radius:16px;background:#fff;color:#10292a;font:500 .88rem/1.5 "Instrument Sans",system-ui,sans-serif;box-shadow:0 18px 44px -14px rgba(0,0,0,.5)}' +
    '.ck-bar[hidden]{display:none}.ck-bar p{margin:0 0 12px}.ck-bar a{color:#b24a2c}' +
    '.ck-btns{display:flex;gap:8px;flex-wrap:wrap}.ck-btns button{flex:1 1 120px;height:42px;border-radius:999px;border:0;font:700 .88rem/1 "Instrument Sans",system-ui,sans-serif;cursor:pointer}' +
    '.ck-si{background:#164346;color:#fff}.ck-no{background:#eef3f2;color:#10292a}';

  function montar() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var bar = document.createElement('div');
    bar.className = 'ck-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Cookies');
    bar.innerHTML = '<p>Usamos cookies de Google Ads para saber si nuestros anuncios funcionan. Solo se activan si aceptas. <a href="/cookies.html">Más información</a></p>' +
      '<div class="ck-btns"><button type="button" class="ck-no">Rechazar</button><button type="button" class="ck-si">Aceptar</button></div>';
    bar.hidden = !!elegido;
    document.body.appendChild(bar);
    bar.querySelector('.ck-si').onclick = function () { guardar('si'); gtag('consent', 'update', estado(true)); bar.hidden = true; };
    bar.querySelector('.ck-no').onclick = function () { guardar('no'); gtag('consent', 'update', estado(false)); bar.hidden = true; };
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-ck-open]');
      if (a) { e.preventDefault(); bar.hidden = false; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
