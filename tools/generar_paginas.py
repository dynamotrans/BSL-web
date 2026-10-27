#!/usr/bin/env python3
"""Genera las páginas de sección de www.bslhome.es (fuente única: este script + index.html).

    python3 tools/generar_paginas.py            # lee los datos publicados (o la copia local si no hay red)
    python3 tools/generar_paginas.py --sin-red  # usa solo tools/datos-publicos.json

Qué hace:
  · Saca de index.html la cabecera, el pie, el botón flotante de contacto, el selector de idiomas y los
    estilos (css/bsl.css), para que las secciones sean idénticas a la portada. Si cambias la portada,
    vuelve a ejecutar el script.
  · Escribe cada página de SECCIONES (p. ej. habitaciones.html → /habitaciones), 404.html y sitemap.xml.
  · Los precios, medidas, camas, equipamiento y disponibilidad se ponen con los datos del panel en el
    momento de generar y, además, js/seccion.js los actualiza en directo en el navegador.
  · Refresca en index.html los valores de respaldo («Desde N €», camas, descripción para buscadores)
    con el precio mínimo real.

Después de publicar una página nueva o cambiada: Search Console → Sitemaps → reenviar el sitemap.
"""
import html
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://www.bslhome.es'
SNAP = ROOT / 'tools' / 'datos-publicos.json'
INDEX = ROOT / 'index.html'
HOY = date.today().isoformat()

# Secciones de la portada. Las que tienen 'pagina' ya tienen URL propia; el resto sigue siendo un ancla.
SECCIONES = [
    {'ancla': 'casa', 'nombre': 'La casa', 'pagina': None},           # /la-casa: pendiente de datos
    {'ancla': 'fotos', 'nombre': 'Fotos', 'pagina': None},
    {'ancla': 'habitaciones', 'nombre': 'Habitaciones', 'pagina': 'habitaciones'},
    {'ancla': 'ubicacion', 'nombre': 'Ubicación', 'pagina': None},     # /ubicacion: pendiente de datos
    {'ancla': 'condiciones', 'nombre': 'Condiciones', 'pagina': None},  # /precios-y-condiciones: pendiente
]
LEGALES = ['aviso-legal', 'privacidad', 'cookies', 'condiciones-solicitud']

esc = lambda t: html.escape(str(t), quote=True)


# ---------------------------------------------------------------- datos
def cargar_datos(con_red=True):
    if con_red:
        try:
            with urllib.request.urlopen(SITE + '/api/datos', timeout=8) as r:
                d = json.loads(r.read().decode('utf-8'))
            if d.get('rooms'):
                SNAP.write_text(json.dumps(d, ensure_ascii=False), encoding='utf-8')
                print('Datos: leídos de', SITE + '/api/datos')
                return d
        except Exception as e:  # sin red: copia local
            print('Datos: sin acceso a la web (%s); uso %s' % (e.__class__.__name__, SNAP.relative_to(ROOT)))
    return json.loads(SNAP.read_text(encoding='utf-8'))


def precios(r):
    ps = [r.get('precio')] + list((r.get('preciosCurso') or {}).values())
    return [p for p in ps if isinstance(p, (int, float)) and p > 0]


def m2(v):
    return ('%.2f' % v).rstrip('0').rstrip('.').replace('.', ',') if v else ''


def camas_txt(rooms):
    cs = sorted({int(r['cama']) for r in rooms if str(r.get('cama', '')).isdigit()})
    return ', '.join(map(str, cs[:-1])) + ' o ' + str(cs[-1]) if len(cs) > 1 else (str(cs[0]) if cs else '')


# ---------------------------------------------------------------- piezas de la portada
def piezas(idx):
    def cut(a, b, desde=0, incl=True):
        i = idx.index(a, desde)
        j = idx.index(b, i + len(a))
        return idx[i:j + (len(b) if incl else 0)]
    p = {}
    p['css'] = cut('<style>', '</style>')[len('<style>'):-len('</style>')]
    p['fonts'] = cut('<meta name="theme-color"', 'display=swap">')  # color, iconos, manifiesto y tipografías
    p['header'] = cut('<header class="top" id="top">', '</header>')
    p['footer'] = cut('<footer>', '</footer>')
    p['totop'] = cut('<button type="button" class="totop" id="totop"', '</button>')
    p['fab'] = cut('<div class="fab" id="fab">', '\n</div>')
    p['tel_js'] = cut('var WA_NUMBER', '})();')
    p['fab_js'] = cut('/* MARCO:fab', '/* /MARCO:fab */')
    p['lang'] = cut('<div id="google_translate_element"></div>', '</script>')
    return p


def enlazar(frag):
    """Anclas de la portada → URL propia si la sección ya tiene página, o /#ancla si no."""
    def f(m):
        a = m.group(1)
        if a in ('inicio', 'top'):
            return 'href="/"'
        s = next((x for x in SECCIONES if x['ancla'] == a), None)
        return 'href="/%s"' % s['pagina'] if s and s['pagina'] else 'href="/#%s"' % a
    frag = re.sub(r'href="#([\w-]+)"', f, frag)
    for l in LEGALES:
        frag = frag.replace('href="/%s.html"' % l, 'href="/%s"' % l)
    return frag


# ---------------------------------------------------------------- plantilla
PAGE_CSS = """
/* Páginas de sección (prefijo sp- para no chocar con la portada) */
body{background:var(--ground)}
.sp-main{padding-top:calc(68px + env(safe-area-inset-top,0px))}
.sp-band{background:var(--teal-deep);color:var(--cream);font:600 .9rem/1.4 var(--sans)}
.sp-band .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 16px;padding-top:10px;padding-bottom:10px}
.sp-band a{color:var(--sun);font-weight:700;text-decoration:underline;text-underline-offset:3px;white-space:nowrap}
.sp-secnav{background:var(--surface);border-bottom:1px solid var(--line)}
.sp-secnav ul{display:flex;gap:8px;list-style:none;margin:0;padding:10px 0;overflow-x:auto;scrollbar-width:none}
.sp-secnav ul::-webkit-scrollbar{display:none}
.sp-secnav a{display:inline-block;padding:8px 14px;border-radius:999px;color:var(--ink);text-decoration:none;font:600 .88rem/1 var(--sans);white-space:nowrap;box-shadow:inset 0 0 0 1.5px var(--line)}
.sp-secnav a[aria-current="page"]{background:var(--teal);color:var(--cream);box-shadow:none}
.sp-crumbs{font:500 .85rem/1.4 var(--sans);color:var(--muted);margin:22px 0 0}
.sp-crumbs ol{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}
.sp-crumbs li+li::before{content:"›";margin-right:6px}
.sp-crumbs a{color:var(--accent)}
.sp-hero{padding:14px 0 8px}
.sp-hero h1{font:400 clamp(2.1rem,6vw,3.4rem)/1.05 var(--serif);color:var(--ink);margin:6px 0 14px}
.sp-hero .sp-lead{font:500 1.08rem/1.6 var(--sans);color:var(--ink);max-width:62ch;margin:0}
.sp-sec{padding:34px 0 8px}
.sp-sec h2{font:400 clamp(1.6rem,4.4vw,2.3rem)/1.1 var(--serif);color:var(--ink);margin:0 0 14px}
.sp-sec p,.sp-sec li{font:400 1rem/1.65 var(--sans);color:var(--ink);max-width:68ch}
.sp-sec ul{padding-left:1.2em}
.sp-rooms{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:18px;margin-top:6px}
.sp-room{box-sizing:border-box;display:flex;flex-direction:column;background:var(--surface);border-radius:18px;overflow:hidden;box-shadow:0 10px 30px -18px rgba(16,41,42,.45)}
.sp-room *,.sp-room *::before,.sp-room *::after{box-sizing:border-box}
.sp-room figure{position:relative;margin:0;aspect-ratio:4/3;overflow:hidden;background:var(--tint)}
.sp-room figure img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.sp-room .sp-ia{position:absolute;left:10px;bottom:10px;padding:5px 10px;border-radius:999px;background:#fff;color:#5b3fa0;font:700 .75rem/1 var(--sans)}
.sp-room .sp-st{position:absolute;left:10px;top:10px;display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;background:#fff;color:var(--ink);font:700 .8rem/1 var(--sans)}
.sp-room .sp-st i{width:9px;height:9px;border-radius:50%;background:#9aa9a8}
.sp-room .sp-st.libre i{background:#2f9e5b}.sp-room .sp-st.parcial i{background:#d39a1c}.sp-room .sp-st.ocupada i{background:#c8456f}
.sp-room .sp-b{padding:18px 18px 20px;display:flex;flex-direction:column;gap:10px;flex:1}
.sp-room h3{font:400 1.9rem/1 var(--serif);margin:0;color:var(--ink)}
.sp-room .sp-pos{font:700 .78rem/1.3 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin:0}
.sp-room .sp-facts{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.sp-room .sp-facts li{padding:6px 10px;border-radius:8px;background:var(--tint);font:600 .82rem/1.2 var(--sans);color:var(--ink)}
.sp-room .sp-price{font:500 1rem/1.3 var(--sans);margin:0;color:var(--ink)}
.sp-room .sp-price b{font:400 1.7rem/1 var(--serif)}
.sp-room p.sp-txt{font:400 .97rem/1.6 var(--sans);margin:0;color:var(--ink)}
.sp-room .sp-eq{font:500 .85rem/1.5 var(--sans);color:var(--muted);margin:0}
.sp-room .btn{align-self:flex-start;margin-top:auto}
.sp-table{width:100%;max-width:680px;border-collapse:collapse;font:500 .95rem/1.4 var(--sans);background:var(--surface);border-radius:12px;overflow:hidden}
.sp-table th,.sp-table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line)}
.sp-table th{background:var(--tint);font-weight:700}
.sp-tablewrap{overflow-x:auto;max-width:100%}
.sp-cta{margin:34px 0 0;padding:26px 22px;border-radius:18px;background:var(--teal);color:var(--cream)}
.sp-cta h2{color:var(--cream)}
.sp-cta p{color:var(--cream)}
.sp-cta .sp-btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.sp-others{padding:40px 0 56px}
.sp-others ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:12px;list-style:none;padding:0;margin:14px 0 0}
.sp-others a{display:block;padding:16px 18px;border-radius:14px;background:var(--surface);color:var(--ink);text-decoration:none;font:700 1rem/1.3 var(--sans);box-shadow:inset 0 0 0 1.5px var(--line)}
.sp-others a span{display:block;font:500 .85rem/1.4 var(--sans);color:var(--muted);margin-top:4px}
.sp-others a:hover{box-shadow:inset 0 0 0 1.5px var(--accent)}
"""


def pagina(p, slug, titulo, desc, h1, cuerpo, ld, og_img, nombre_sec, indexable=True):
    url = SITE + ('/' + slug if slug else '/')
    secnav = '<li><a href="/">Portada</a></li>' + ''.join(
        '<li><a href="%s"%s>%s</a></li>' % ('/' + s['pagina'] if s['pagina'] else '/#' + s['ancla'],
                                            ' aria-current="page"' if s['pagina'] == slug and slug else '', esc(s['nombre']))
        for s in SECCIONES)
    otras = ''.join(
        '<li><a href="%s">%s<span>%s</span></a></li>' % ('/' + s['pagina'] if s['pagina'] else '/#' + s['ancla'], esc(s['nombre']),
                                                        'Página completa' if s['pagina'] else 'En la portada')
        for s in SECCIONES if s['pagina'] != slug)
    band = ('<div class="sp-band"><div class="wrap"><span>Estás viendo solo la sección <b>%s</b></span>'
            '<a href="/">Ver toda la web →</a></div></div>' % esc(nombre_sec)) if nombre_sec else ''
    crumbs = ('<nav class="sp-crumbs" aria-label="Migas de pan"><ol><li><a href="/">Inicio</a></li><li aria-current="page">%s</li></ol></nav>'
              % esc(nombre_sec)) if nombre_sec else ''
    header = enlazar(p['header']).replace('<header class="top" id="top">', '<header class="top solid" id="top">', 1)
    robots = 'index, follow' if indexable else 'noindex, follow'
    lds = ''.join('<script type="application/ld+json">%s</script>\n' % json.dumps(x, ensure_ascii=False) for x in ld)
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<!-- GENERADO por tools/generar_paginas.py — no editar a mano: cambia el script y vuelve a ejecutarlo -->
<!-- Google tag (gtag.js) con modo de consentimiento -->
<script src="/js/consent.js"></script>
<meta charset="utf-8">
<meta name="format-detection" content="telephone=no,address=no,email=no">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(titulo)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="{robots}">
{'<link rel="canonical" href="%s">' % url if indexable else ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="BSL · Boutique Student Living">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="{esc(titulo)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/images/{og_img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(titulo)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{SITE}/images/{og_img}">
{p['fonts']}
<link rel="stylesheet" href="/css/bsl.css">
<style>{PAGE_CSS}</style>
{lds}</head>
<body class="sp">
{header}

<main class="sp-main" id="inicio">
{band}
<nav class="sp-secnav" aria-label="Secciones de la web"><div class="wrap"><ul>{secnav}</ul></div></nav>
<div class="wrap">
{crumbs}
<header class="sp-hero"><h1>{h1}</h1></header>
{cuerpo}
<section class="sp-others" aria-labelledby="sp-ot"><h2 id="sp-ot" class="sp-h2o" style="font:400 clamp(1.5rem,4vw,2rem)/1.1 var(--serif);margin:0">Otras secciones</h2><ul>{otras}<li><a href="/">Portada<span>Toda la web en una página</span></a></li></ul></section>
</div>
</main>

{enlazar(p['footer'])}
{p['totop']}
{p['fab']}

<script src="/js/rooms.js"></script>
<script>
{p['tel_js']}
</script>
<script src="/js/seccion.js"></script>
<script>
(function () {{
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fab = document.getElementById('fab'), totop = document.getElementById('totop');
  {p['fab_js']}
}})();
</script>
{p['lang']}
</body>
</html>
'''


# ---------------------------------------------------------------- /habitaciones
# Texto propio de cada habitación: describe lo que no cambia (planta, posición, ventana, medidas).
# Precio, m², cama, equipamiento, fotos y disponibilidad salen de los datos del panel.
HAB_TXT = {
    1: ('Planta baja · primera a la derecha',
        'Es la primera puerta a la derecha nada más cruzar el hall de la entrada. Su ventana grande da a la calle Canónigo, '
        'y con 3,74 por 2,87 metros es de las dos más amplias de la casa: cabe la cama, el armario y la mesa de estudio con holgura.'),
    2: ('Planta baja · primera a la izquierda',
        'Está justo enfrente de Azahar, a la izquierda según se entra, y también tiene ventana grande a la calle. Mide 3,74 por 3,04 metros, '
        'la de mayor superficie de BSL. Al estar abajo, tiene a pocos pasos el salón comedor, una de las cocinas y la salida al patio.'),
    3: ('Planta baja · segunda a la derecha',
        'Siguiendo el pasillo de la planta baja, es la segunda puerta a la derecha. A diferencia de las dos primeras, su ventana grande '
        'no mira a la calle sino al patio interior de la casa. Mide 3 por 2,87 metros, un tamaño intermedio dentro de la vivienda.'),
    4: ('Planta baja · al fondo, junto al patio',
        'Ocupa el fondo de la planta baja, al lado de uno de los baños, de la cocina de esa planta y del patio. La ventana grande da al patio '
        'y tiene armario empotrado. Sus medidas son 3,39 por 2,93 metros.'),
    5: ('Primera planta · primera a la derecha',
        'Subiendo a la primera planta, es la primera puerta a la derecha. Tiene ventana grande a la calle y mide 3,13 por 2,94 metros, '
        'la más amplia de las cuatro de arriba. En esta planta están la segunda cocina y otros dos baños.'),
    6: ('Primera planta · primera a la izquierda',
        'Primera puerta a la izquierda en la planta de arriba. Su ventana grande no da a la calle ni al patio: se abre hacia la azotea '
        'de la primera planta. Es una habitación alargada, de 3,38 por 2,03 metros.'),
    7: ('Primera planta · segunda a la derecha',
        'Segunda puerta a la derecha en la primera planta. Tiene un balcón grande que da a la calle. Mide 2,95 por 2,04 metros, '
        'de las más compactas de la casa.'),
    8: ('Primera planta · tercera a la derecha',
        'Tercera puerta a la derecha arriba, con ventana grande a la calle y las mismas medidas que Girasol: 2,95 por 2,04 metros. '
        'Lo que la distingue es la climatización: tiene aire acondicionado de frío y calor.'),
}


def ficha(r):
    n = r['num']
    pos, txt = HAB_TXT.get(n, ('', ''))
    foto = (r.get('fotos') or [''])[0]
    ps = precios(r)
    precio = min(ps) if ps else ''
    eq = ', '.join(r.get('equipamiento') or [])
    return f'''<article class="sp-room" id="{esc(r['id'])}" data-room="{esc(r['id'])}">
  <figure>{'<img src="%s" alt="Habitación %s" loading="lazy" data-f="foto">' % (esc(foto), esc(r['nombre'])) if foto else ''}
    <span class="sp-st" data-f="estado"><i></i><span>Disponibilidad</span></span>{'<span class="sp-ia" data-f="ia">Imagen IA</span>' if r.get('fotosIA') else '<span class="sp-ia" data-f="ia" hidden>Imagen IA</span>'}</figure>
  <div class="sp-b">
    <p class="sp-pos">{esc(pos)}</p>
    <h3>{esc(r['nombre'])}</h3>
    <ul class="sp-facts"><li><span data-f="m2">{m2(r.get('m2'))}</span> m²</li><li>Cama <span data-f="cama">{esc(r.get('cama', ''))}</span> cm</li><li>Uso individual</li></ul>
    <p class="sp-price"><b><span data-f="precio">{precio}</span> €</b>/mes + <span data-f="gastos">{esc(r.get('gastos', ''))}</span> € de gastos</p>
    <p class="sp-txt">{esc(txt)}</p>
    <p class="sp-eq"><b>Equipamiento:</b> <span data-f="equip">{esc(eq)}</span></p>
    <a class="btn sm" href="/?reservar={esc(r['id'])}">Reservar {esc(r['nombre'])}</a>
  </div>
</article>'''


def pag_habitaciones(p, d):
    rooms = sorted([r for r in d['rooms'] if r.get('activa')], key=lambda r: r['num'])
    allp = [x for r in rooms for x in precios(r)]
    pmin, pmax = (min(allp), max(allp)) if allp else ('', '')
    gastos = rooms[0].get('gastos', '') if rooms else ''
    filas = ''.join('<tr data-room="%s"><td>%s</td><td>%s</td><td><span data-f="m2">%s</span> m²</td><td><span data-f="cama">%s</span> cm</td>'
                    '<td><span data-f="precio">%s</span> € + <span data-f="gastos">%s</span> €</td></tr>' % (
                        esc(r['id']), esc(r['nombre']), 'Baja' if r['num'] <= 4 else 'Primera', m2(r.get('m2')),
                        esc(r.get('cama', '')), min(precios(r)) if precios(r) else '', esc(r.get('gastos', '')))
                    for r in rooms)
    cuerpo = f'''<p class="sp-lead" style="font:500 1.08rem/1.6 var(--sans);max-width:62ch;margin:0 0 6px">Ocho habitaciones individuales repartidas en dos plantas de una casa
reformada en el centro de Dos Hermanas, en la calle Canónigo. Aquí puedes ver cada una por separado: en qué parte de la casa está, hacia dónde mira
su ventana, cuánto mide y qué cuesta ahora mismo.</p>

<section class="sp-sec" aria-labelledby="h-lista"><h2 id="h-lista">Las ocho habitaciones, una a una</h2>
<p>Los precios, las medidas, la cama, el equipamiento y la disponibilidad de cada ficha se leen directamente del sistema de gestión de la casa,
así que siempre están al día. Si una habitación cambia de precio para el curso siguiente, verás aquí el nuevo importe.</p>
<div class="sp-rooms">
{''.join(ficha(r) for r in rooms)}
</div></section>

<section class="sp-sec" aria-labelledby="h-elegir"><h2 id="h-elegir">Cómo elegir entre ellas</h2>
<p><b>Planta baja o primera planta.</b> Abajo están Azahar, Jazmín, Dalia y Azucena, en la misma planta que el salón comedor, una cocina,
dos baños y el patio. Arriba quedan Tulipán, Malva, Girasol y Margarita, con la otra cocina, los otros dos baños y la azotea de esa planta.</p>
<p><b>Calle, patio o azotea.</b> Cinco miran a la calle: Azahar, Jazmín, Tulipán, Margarita y Girasol, que además tiene balcón. Dalia y Azucena
dan al patio interior, y la ventana de Malva se abre a la azotea.</p>
<p><b>Tamaño.</b> La más grande pasa de los 11 m² y las más pequeñas rondan los 6 m². Las dos primeras de la planta baja son las de mayor
superficie; Girasol y Margarita, las más compactas.</p>
<p><b>Precio.</b> Cada habitación tiene su propio importe, que hoy va de <span class="js-pmin">{pmin}</span> a <span class="js-pmax">{pmax}</span> €
al mes según cuál elijas, más la cuota de gastos. Esta tabla las resume:</p>
<div class="sp-tablewrap"><table class="sp-table"><thead><tr><th>Habitación</th><th>Planta</th><th>Superficie</th><th>Cama</th><th>Precio/mes + gastos</th></tr></thead>
<tbody>{filas}</tbody></table></div></section>

<section class="sp-sec" aria-labelledby="h-comun"><h2 id="h-comun">Lo que comparten todas</h2>
<p>Ninguna es doble ni se alquila a dos personas: cada habitación es para una sola inquilina y se cierra con su propia llave. Todas se entregan
amuebladas y con la ropa de cama y las toallas, de modo que basta con traer la maleta.</p>
<p><b>Baños y cocinas, sin asignar.</b> La casa tiene cuatro baños, dos por planta, y dos cocinas, una arriba y otra abajo. No están ligados a
ninguna habitación: las chicas se organizan entre ellas como mejor les encaja. Solo si surge un desacuerdo, la propiedad interviene y decide a
quién corresponde cada cosa.</p>
<p><b>La cuota de gastos.</b> A la mensualidad de cada habitación se suman <span class="js-gastos">{gastos}</span> € al mes que cubren el agua,
la luz, internet por fibra con wifi, la limpieza semanal de baños, cocinas, salón y pasillos, y el mantenimiento y las reparaciones.</p></section>

<section class="sp-sec" aria-labelledby="h-disp"><h2 id="h-disp">Disponibilidad y periodos</h2>
<p>La etiqueta de cada foto indica si la habitación está libre, libre solo una parte del curso u ocupada, y se actualiza sola en cuanto cambia
un contrato. Se puede alquilar para el curso completo, del 1 de septiembre al 31 de julio, o, si alguna queda libre con el curso ya empezado,
desde ese momento hasta el 31 de julio.</p></section>

<section class="sp-sec" aria-labelledby="h-res"><h2 id="h-res">Cómo se reserva</h2>
<ol>
<li>Pulsas «Reservar» en la habitación que te interesa y rellenas la solicitud. Es gratis y no te compromete.</li>
<li>Revisamos cada solicitud y te contestamos por WhatsApp o por teléfono. La casa es solo para chicas y hay que ser mayor de edad.</li>
<li>Si te aceptamos, te mandamos el contrato y los datos para la fianza, que equivale a una mensualidad y se puede pagar con tarjeta o por transferencia.</li>
<li>La plaza es tuya cuando se firma el contrato y se paga la fianza; hasta ese momento la habitación sigue ofreciéndose.</li>
</ol>
<p>Tienes el detalle en las <a href="/condiciones-solicitud">condiciones de la reserva</a>.</p>
<div class="sp-cta"><h2 style="font:400 clamp(1.5rem,4vw,2rem)/1.1 var(--serif);margin:0 0 8px">¿Te encaja alguna?</h2>
<p>Escríbenos y te contamos cuál está libre para las fechas que necesitas.</p>
<div class="sp-btns"><a class="btn" href="/#habitaciones">Reservar plaza</a><a class="btn line js-wa" href="/#habitaciones">Escribir por WhatsApp</a></div></div>
</section>'''
    ld = [
        {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Inicio', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Habitaciones', 'item': SITE + '/habitaciones'}]},
        {'@context': 'https://schema.org', '@type': 'LocalBusiness', 'name': 'BSL · Boutique Student Living', 'url': SITE + '/',
         'address': {'@type': 'PostalAddress', 'streetAddress': 'Calle Canónigo', 'postalCode': '41701', 'addressLocality': 'Dos Hermanas',
                     'addressRegion': 'Sevilla', 'addressCountry': 'ES'},
         'priceRange': 'Desde %s €/mes' % pmin, 'image': SITE + '/images/og-habitaciones.jpg', 'logo': SITE + '/images/icon-512.png'},
        {'@context': 'https://schema.org', '@type': 'ItemList', 'name': 'Habitaciones de BSL · Boutique Student Living', 'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'item': {
                '@type': 'Room', 'name': 'Habitación ' + r['nombre'], 'url': SITE + '/habitaciones#' + r['id'],
                'description': HAB_TXT.get(r['num'], ('', ''))[1],
                'floorSize': {'@type': 'QuantitativeValue', 'value': r.get('m2'), 'unitCode': 'MTK'},
                'occupancy': {'@type': 'QuantitativeValue', 'value': 1},
                'bed': 'Cama de %s cm' % r.get('cama', ''),
                'amenityFeature': [{'@type': 'LocationFeatureSpecification', 'name': e, 'value': True} for e in (r.get('equipamiento') or [])]}}
            for i, r in enumerate(rooms)]},
    ]
    return pagina(p, 'habitaciones',
                  'Habitaciones para chicas estudiantes en Dos Hermanas · BSL',
                  'Las 8 habitaciones individuales de BSL en Dos Hermanas, una a una: planta, ventana, medidas, cama y precio actualizado desde %s €/mes. Solo chicas estudiantes.' % pmin,
                  'Habitaciones para chicas estudiantes en Dos Hermanas', cuerpo, ld, 'og-habitaciones.jpg', 'Habitaciones')


def pag_404(p):
    cuerpo = '''<p style="font:500 1.08rem/1.6 var(--sans);max-width:60ch">La dirección que has abierto no existe o ha cambiado. Puedes volver a la portada
o ir directamente a cualquiera de las secciones de la web desde los enlaces de abajo.</p>
<p><a class="btn" href="/">Ir a la portada</a></p>'''
    return pagina(p, '', 'Página no encontrada · BSL · Boutique Student Living', 'Esta dirección no existe en bslhome.es.',
                  'No encontramos esta página', cuerpo, [], 'og-bsl.jpg', '', indexable=False)


# ---------------------------------------------------------------- portada: valores de respaldo
def refrescar_portada(idx, d):
    rooms = [r for r in d['rooms'] if r.get('activa')]
    allp = [x for r in rooms for x in precios(r)]
    if not allp:
        return idx
    m = str(min(allp))
    out = re.sub(r'<span class="js-min">\d+</span>', '<span class="js-min">%s</span>' % m, idx)
    out = re.sub(r'<span class="js-min" data-count="\d+">\d+</span>', '<span class="js-min" data-count="%s">%s</span>' % (m, m), out)
    out = re.sub(r'(<meta (?:name="description"|property="og:description") content="[^"]*?[Dd]esde )\d+( €)', r'\g<1>%s\2' % m, out)
    out = re.sub(r'("priceRange":"Desde )\d+( €)', r'\g<1>%s\2' % m, out)
    ct = camas_txt(rooms)
    if ct:
        out = re.sub(r'<span class="js-camas">[^<]*</span>', '<span class="js-camas">%s</span>' % ct, out)
    return out


def sitemap(paginas, cambiadas, previas):
    urls = [('/', '1.0')] + [('/' + s, '0.8') for s in paginas]
    lm = lambda u: HOY if u in cambiadas or u not in previas else previas[u]
    body = ''.join('  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <priority>%s</priority>\n  </url>\n' % (SITE, u, lm(u), pr)
                   for u, pr in urls)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '</urlset>\n'


def escribir(path, texto):
    old = path.read_text(encoding='utf-8') if path.exists() else None
    if old != texto:
        path.write_text(texto, encoding='utf-8')
        print('  escrito', path.relative_to(ROOT))
    return old != texto


def main():
    d = cargar_datos('--sin-red' not in sys.argv)
    idx = INDEX.read_text(encoding='utf-8')
    nuevo_idx = refrescar_portada(idx, d)
    cambiadas = set()
    if escribir(INDEX, nuevo_idx):
        cambiadas.add('/')
    p = piezas(nuevo_idx)
    (ROOT / 'css').mkdir(exist_ok=True)
    escribir(ROOT / 'css' / 'bsl.css', '/* GENERADO desde el <style> de index.html por tools/generar_paginas.py — no editar */\n' + p['css'])
    if escribir(ROOT / 'habitaciones.html', pag_habitaciones(p, d)):
        cambiadas.add('/habitaciones')
    escribir(ROOT / '404.html', pag_404(p))
    paginas = [s['pagina'] for s in SECCIONES if s['pagina']]
    sm = ROOT / 'sitemap.xml'
    old = sm.read_text(encoding='utf-8') if sm.exists() else ''
    previas = {u[len(SITE):]: f for u, f in re.findall(r'<loc>(.*?)</loc>\s*<lastmod>(.*?)</lastmod>', old)}
    escribir(sm, sitemap(paginas, cambiadas, previas))
    print('Hecho. Recuerda: si es una página nueva o ha cambiado, reenvía el sitemap en Search Console.')


if __name__ == '__main__':
    main()
