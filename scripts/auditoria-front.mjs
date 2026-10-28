// Auditoría responsiva del front (27-oct-2026): recorre todas las pantallas
// (sitio, portal, panel) en 10 tamaños, de 320 px a 1440 px, con emulación de
// iPhone, Android y iPad, y reporta desbordes horizontales, campos de menos de
// 16 px, botones de menos de 32 px, imágenes rotas y errores de consola.
//
// Uso (con la app en `npm run start` sobre la base LOCAL con datos de las
// pruebas de clínica y farmacia; requiere Playwright: `npx playwright install chromium`):
//   TUTOR=<correo del tutor de prueba> node scripts/auditoria-front.mjs
//   VP=iph-390,lap-1280 SHOTS=1 node scripts/auditoria-front.mjs   (capturas en auditoria-front/shots)
import { chromium, devices } from 'playwright'
import fs from 'node:fs'

const B = 'http://localhost:3000'
const TUTOR = process.env.TUTOR
const SOLO = process.env.SOLO ? new RegExp(process.env.SOLO) : null
const SHOTS = process.env.SHOTS === '1'
const OUT = process.env.OUT || 'auditoria-front'

const VIEWPORTS = [
  { n: 'se1-320', w: 320, h: 568, m: true, ua: devices['iPhone SE'].userAgent },
  { n: 'and-360', w: 360, h: 740, m: true, ua: devices['Galaxy S9+'].userAgent },
  { n: 'iph-375', w: 375, h: 667, m: true, ua: devices['iPhone 8'].userAgent },
  { n: 'iph-390', w: 390, h: 844, m: true, ua: devices['iPhone 13'].userAgent },
  { n: 'and-412', w: 412, h: 915, m: true, ua: devices['Pixel 7'].userAgent },
  { n: 'max-430', w: 430, h: 932, m: true, ua: devices['iPhone 14 Pro Max'].userAgent },
  { n: 'tab-768', w: 768, h: 1024, m: true, ua: devices['iPad Mini'].userAgent },
  { n: 'lap-1024', w: 1024, h: 700, m: false },
  { n: 'lap-1280', w: 1280, h: 800, m: false },
  { n: 'mon-1440', w: 1440, h: 900, m: false },
]
if (process.env.VP) VIEWPORTS.splice(0, VIEWPORTS.length, ...VIEWPORTS.filter((v) => process.env.VP.split(',').includes(v.n)))

const anon = ['/', '/servicios', '/aviso-de-privacidad', '/portal/entrar', '/portal/registro', '/portal/olvide', '/admin/login', '/admin/forgot']
const tutor = ['/portal', '/portal/vincular', '/portal/citas', '/portal/citas/nueva', '/portal/cuenta', '/portal/mascotas/1', '/portal/mascotas/1?ver=cartilla', '/portal/mascotas/1?ver=peso', '/portal/mascotas/1?ver=documentos']
const fz = ['', '/registrar', '/voz', '/pendientes', '/movimientos', '/operacion/1', '/saldos', '/fondos', '/mover'].map((r) => '/admin/finanzas' + r)
const cl = ['', '/agenda', '/clientes/1', '/clientes/nuevo', '/mascotas/1', '/mascotas/1?ver=cartilla', '/mascotas/1?ver=pesos', '/mascotas/1?ver=notas', '/mascotas/1?ver=recetas', '/mascotas/1?ver=documentos', '/mascotas/1?ver=citas', '/mascotas/nueva', '/importar'].map((r) => '/admin/clinica' + r)
const fa = ['', '/vender', '/ventas', '/ventas/1', '/recetas', '/recetas/1', '/recetas/nueva', '/cierre', '/productos', '/productos/1', '/productos/nuevo', '/inventario', '/compras', '/compras/1', '/compras/nueva', '/conteo', '/alertas', '/reabasto', '/promociones', '/importar', '/configuracion'].map((r) => '/admin/farmacia' + r)
const py = ['/admin', '/admin/account', '/admin/collections/users', '/admin/collections/users/1', '/admin/collections/roles', '/admin/collections/clientes', '/admin/globals/agenda-configuracion', '/admin/globals/sitio-configuracion', '/admin/globals/instalacion-configuracion']
const equipo = [...py, ...fz, ...cl, ...fa]

const revisar = () => {
  const W = window.innerWidth
  const res = { overflowX: 0, culpables: [], inputsChicos: [], tapChicos: [], imgsRotas: [], cortados: [] }
  res.overflowX = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - W
  const desc = (el) => {
    let s = el.tagName.toLowerCase()
    if (el.id) s += '#' + el.id
    if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return t ? `${s} «${t}»` : s
  }
  const recortadoPorAncestro = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return true
    }
    return false
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right > W + 1 && !recortadoPorAncestro(el) && getComputedStyle(el).position !== 'fixed') {
      // reporta solo el más externo
      if (!res.culpables.some((c) => c.el.contains(el))) res.culpables.push({ el, d: desc(el) + ` right=${Math.round(r.right)}` })
    }
  }
  res.culpables = res.culpables.slice(0, 6).map((c) => c.d)
  if (W < 820) {
    for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, textarea')) {
      if (!visible(el)) continue
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs < 16) res.inputsChicos.push(desc(el) + ` ${fs}px`)
    }
    for (const el of document.querySelectorAll('a, button, [role=button], [role=tab], select, input[type=checkbox], input[type=radio], summary')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      // enlaces dentro de un párrafo de texto no cuentan
      if (el.tagName === 'A' && el.closest('p, li, td') && getComputedStyle(el).display === 'inline') continue
      if (r.height < 32 || r.width < 32) res.tapChicos.push(desc(el) + ` ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
  }
  for (const img of document.images) if (img.complete && img.naturalWidth === 0 && visible(img)) res.imgsRotas.push(img.src)
  // texto que se sale de su caja (overflow visible y contenido más ancho)
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,a,button,td,th,label,strong,b,div')) {
    if (!visible(el) || el.children.length > 3) continue
    const cs = getComputedStyle(el)
    if (cs.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.display !== 'inline' && cs.whiteSpace === 'nowrap') res.cortados.push(desc(el))
  }
  res.inputsChicos = [...new Set(res.inputsChicos)].slice(0, 6)
  res.tapChicos = [...new Set(res.tapChicos)].slice(0, 10)
  res.cortados = [...new Set(res.cortados)].slice(0, 6)
  return res
}

const browser = await chromium.launch()
const informe = []
async function sesion(vp, tipo) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m, deviceScaleFactor: vp.m ? 2 : 1, ...(vp.ua ? { userAgent: vp.ua } : {}), locale: 'es-MX', timezoneId: 'America/Mexico_City' })
  if (tipo === 'equipo') await ctx.request.post(B + '/api/users/login', { data: { email: 'prueba-superadmin@ejemplo.mx', password: 'Prueba-123456' } })
  if (tipo === 'tutor') await ctx.request.post(B + '/api/tutores/login', { data: { email: TUTOR, password: 'Prueba-123456' } })
  return ctx
}
for (const vp of VIEWPORTS) {
  for (const [tipo, rutas] of [['anon', anon], ['tutor', tutor], ['equipo', equipo]]) {
    const ctx = await sesion(vp, tipo)
    const page = await ctx.newPage()
    for (const ruta of rutas) {
      if (SOLO && !SOLO.test(ruta)) continue
      const errores = []
      const onErr = (e) => errores.push('pageerror: ' + String(e).slice(0, 160))
      const onCon = (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools|fonts\.g|ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errores.push('console: ' + m.text().slice(0, 160)) }
      const onResp = (r) => { if (r.status() >= 500 || (r.status() >= 400 && r.status() !== 401 && r.status() !== 404 && r.request().resourceType() !== 'fetch')) errores.push(`http ${r.status()} ${r.url().replace(B, '').slice(0, 80)}`) }
      page.on('pageerror', onErr); page.on('console', onCon); page.on('response', onResp)
      let st = 0
      try {
        const r = await page.goto(B + ruta, { waitUntil: 'networkidle', timeout: 30000 })
        st = r?.status() ?? 0
      } catch (e) { errores.push('goto: ' + String(e).slice(0, 120)) }
      await page.waitForTimeout(600)
      let res
      try { res = await page.evaluate(revisar) } catch (e) { res = { error: String(e).slice(0, 120) } }
      if (SHOTS) {
        const f = `${OUT}/shots/${vp.n}${ruta.replace(/[/?=]/g, '_')}.png`
        fs.mkdirSync(`${OUT}/shots`, { recursive: true })
        await page.screenshot({ path: f, fullPage: true }).catch(() => {})
      }
      page.off('pageerror', onErr); page.off('console', onCon); page.off('response', onResp)
      informe.push({ vp: vp.n, ruta, st, url: page.url().replace(B, ''), errores: [...new Set(errores)].slice(0, 5), ...res })
    }
    await ctx.close()
  }
}
await browser.close()
fs.writeFileSync(`${OUT}/informe.json`, JSON.stringify(informe, null, 1))
// resumen
const malos = informe.filter((x) => x.overflowX > 1 || x.culpables?.length || x.inputsChicos?.length || x.imgsRotas?.length || x.errores?.length || x.cortados?.length || x.st >= 400 || x.error)
console.log(`páginas revisadas: ${informe.length}; con hallazgos: ${malos.length}`)
