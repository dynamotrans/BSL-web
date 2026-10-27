// Mide el contenido duplicado de las páginas de sección frente a la portada (Regla Nº1).
// Uso: node tools/medir_duplicados.mjs http://localhost:3020 /habitaciones [/otra …]
// Texto visible ya pintado (innerText, con los datos cargados), troceado en secuencias de 8 palabras.
//   Marco   = secuencias que comparten TODAS las páginas generadas (cabecera, menú, pie, botón…); se mide con /404 incluida.
//   Copiado = secuencias de la página que también están en la portada o en otra página de sección, y no son marco.
//   Propio  = el resto.
import { chromium } from 'playwright';
const [base, ...pags] = process.argv.slice(2);
const N = 8;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('bsl_consent', 'no'); } catch (e) {} });
await ctx.route(/googletagmanager|translate\.google|gstatic|googleapis/, (r) => r.abort());
async function words(u) {
  const p = await ctx.newPage(); await p.goto(base + u, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  const t = await p.evaluate(() => { document.querySelectorAll('dialog,script,style,.ck-bar').forEach((e) => e.remove()); return document.body.innerText; });
  await p.close();
  return t.toLowerCase().replace(/[^\p{L}\p{N}€²]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}
const sh = (w) => { const s = new Set(); for (let i = 0; i + N <= w.length; i++) s.add(w.slice(i, i + N).join(' ')); return s; };
const home = sh(await words('/'));
const W = {}; for (const u of [...pags, '/esta-no-existe']) W[u] = await words(u);
const all = Object.values(W).map(sh);
const marco = new Set([...all[0]].filter((x) => all.every((s) => s.has(x))));
const SH = {}; for (const u of pags) SH[u] = sh(W[u]);
const otras = (u) => { const o = new Set(); for (const v of pags) if (v !== u) SH[v].forEach((x) => o.add(x)); return o; };
console.log('| Página | Palabras | Marco | Copiado de la portada (fuera del marco) | Repetido de otra sección | Propio | Palabras propias |');
console.log('|---|---|---|---|---|---|---|');
for (const u of pags) {
  const w = W[u], lab = new Array(w.length).fill('propio');
  for (let i = 0; i + N <= w.length; i++) {
    const k = w.slice(i, i + N).join(' ');
    const t = marco.has(k) ? 'marco' : home.has(k) ? 'copiado' : otras(u).has(k) ? 'entre' : null;
    if (t) for (let j = i; j < i + N; j++) if (lab[j] !== 'marco') lab[j] = t;
  }
  const c = (t) => lab.filter((x) => x === t).length, fuera = w.length - c('marco');
  const pc = (n, d) => (100 * n / d).toFixed(1) + '%';
  console.log(`| ${u} | ${w.length} | ${c('marco')} | ${c('copiado')} (${pc(c('copiado'), fuera)}) | ${c('entre')} (${pc(c('entre'), fuera)}) | ${pc(c('propio'), w.length)} | ${c('propio')} |`);
}
await b.close();
