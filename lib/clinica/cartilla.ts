import { site } from '../site'
import { fechaLarga } from '../whatsapp'
import type { CartillaVista, MascotaVista, PesoVista } from './tipos'

/**
 * Cartilla imprimible (vacunas, desparasitaciones y demás registros) como
 * página HTML con botón «Imprimir o guardar PDF». La usan el panel
 * (GET /api/clinica/mascotas/:id/cartilla) y el portal del tutor
 * (GET /api/clinica/portal/mascotas/:id/cartilla), cada uno con sus propias
 * reglas de acceso. Sin notas internas ni datos de la clínica que no deban
 * salir.
 */

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const corta = (d: string | null) => {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
const TIPO: Record<string, string> = { vacuna: 'Vacuna', desparasitacion_interna: 'Desparasitación interna', desparasitacion_externa: 'Desparasitación externa', otro: 'Otro' }

export function htmlCartilla(m: MascotaVista, cartilla: CartillaVista[], pesos: PesoVista[], hoy: string, telefono: string | null = site.brand.phone || null): string {
  const tutor = m.tutores.find((t) => t.principal) ?? m.tutores[0]
  const peso = pesos[0]
  const filas = [...cartilla]
    .sort((a, b) => b.fechaAplicacion.localeCompare(a.fechaAplicacion))
    .map((c) => {
      const vencida = c.proximaFecha && c.proximaFecha < hoy
      return `<tr><td>${esc(TIPO[c.tipo] ?? c.tipo)}</td><td><b>${esc(c.producto)}</b>${c.lote ? `<br><small>Lote ${esc(c.lote)}${c.caducidad ? ` · cad. ${corta(c.caducidad)}` : ''}</small>` : ''}</td><td>${corta(c.fechaAplicacion)}</td><td class="${vencida ? 'venc' : ''}">${corta(c.proximaFecha)}${vencida ? '<br><small>vencido</small>' : ''}</td><td>${esc(c.aplicadoPor ?? '')}</td></tr>`
    })
    .join('')
  const datos = [
    ['Especie', m.especie === 'otra' ? m.especieOtra ?? 'Otra' : m.especie],
    ['Raza', m.raza ?? '—'],
    ['Sexo', m.sexo === 'macho' ? 'Macho' : m.sexo === 'hembra' ? 'Hembra' : '—'],
    ['Nacimiento', m.fechaNacimiento ? `${corta(m.fechaNacimiento)}${m.nacimientoEstimado ? ' (aprox.)' : ''}` : '—'],
    ['Microchip', m.microchip ?? '—'],
    ['Peso', peso ? `${peso.kg} kg (${corta(peso.fecha)})` : '—'],
    ['Tutor', tutor?.nombre ?? '—'],
  ]
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartilla de ${esc(m.nombre)} · ${esc(site.brand.name)}</title>
<style>
body{font:14px/1.45 system-ui,-apple-system,sans-serif;color:#0f172a;margin:0;padding:20px;background:#fff}
.hoja{max-width:820px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:18px 0 6px}
.marca{text-align:right;font-size:13px;color:#475569}
.datos{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px 16px}
.datos div span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;background:#f8fafc}
small{color:#64748b}.venc{color:#b42330;font-weight:600}
.alerta{border:1px solid #fecaca;background:#fef2f2;color:#991b1b;padding:8px 10px;border-radius:8px;margin-top:10px}
.pie{margin-top:18px;color:#64748b;font-size:12px}
.no-print{margin:18px 0;text-align:center}
.no-print button{font:inherit;padding:10px 18px;border-radius:8px;border:0;background:#1d4ed8;color:#fff;cursor:pointer}
@media print{.no-print{display:none}body{padding:0}@page{margin:14mm}}
@media (max-width:520px){body{padding:12px}header{flex-direction:column}.marca{text-align:left}table{font-size:12px}th:nth-child(5),td:nth-child(5){display:none}}
</style></head><body><div class="hoja">
<header><div><h1>Cartilla de ${esc(m.nombre)}</h1><small>${esc(m.folio)}</small></div><div class="marca"><b>${esc(site.brand.name)}</b>${site.location.city ? `<br>${esc(site.location.city)}` : ''}${telefono ? `<br>Tel. ${esc(telefono)}` : ''}</div></header>
<div class="datos">${datos.map(([k, v]) => `<div><span>${k}</span>${esc(v)}</div>`).join('')}</div>
${m.alergias ? `<div class="alerta"><b>Alergias:</b> ${esc(m.alergias)}</div>` : ''}
<h2>Vacunas, desparasitaciones y otros</h2>
${cartilla.length ? `<table><thead><tr><th>Tipo</th><th>Producto</th><th>Aplicación</th><th>Próxima</th><th>Aplicó</th></tr></thead><tbody>${filas}</tbody></table>` : '<p><small>Sin registros todavía.</small></p>'}
<p class="pie">Generada el ${fechaLarga(hoy)}. Documento informativo de la clínica.</p>
<div class="no-print"><button onclick="window.print()">Imprimir o guardar PDF</button></div>
</div></body></html>`
}
