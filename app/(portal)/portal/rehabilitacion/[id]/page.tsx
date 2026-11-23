import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'
import { portalPlan, type PlanTutor } from '../../../../../lib/clinica/rehabilitacion'
import { ErrorClinica } from '../../../../../lib/clinica/servicio'
import { sesionTutor } from '../../../../../lib/portal/sesion'
import { Avatar, Barra, Cabecera, fecha, Icono, Pill } from '../../../../../components/portal/comun'
import { EjerciciosCasa } from '../../../../../components/portal/Rehabilitacion'

export const dynamic = 'force-dynamic'

/**
 * Plan de rehabilitación en la app del cliente (ruta ortopédica, fase 4,
 * nov-2026): objetivo, sesiones y próximas citas, ejercicios para casa que
 * marca cada día y cómo van el dolor y la cojera con la nota del equipo. No
 * muestra la nota interna ni la goniometría.
 */
export default async function PlanRehabilitacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await sesionTutor()
  if (!c) redirect(`/portal/entrar?siguiente=/portal/rehabilitacion/${id}`)
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) notFound()
  let p: PlanTutor
  try {
    p = await portalPlan(c, n)
  } catch (e) {
    if (e instanceof ErrorClinica && e.estado === 404) notFound()
    throw e
  }
  const notas = p.avance.filter((s) => s.notaTutor).reverse()
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <Link href="/portal" className="pt-volver pt-chico">
          <Icono n="back" /> Inicio
        </Link>
        <div className="pt-reh-cab">
          <Avatar nombre={p.mascota.nombre} foto={p.mascota.foto} />
          <div>
            <p className="pt-eyebrow">Rehabilitación</p>
            <h1>{p.mascota.nombre}</h1>
            <p className="pt-chico">{p.motivo}</p>
          </div>
          <Pill tono={p.estado === 'activo' ? 'info' : 'gris'}>{p.estado === 'activo' ? 'En curso' : 'Terminado'}</Pill>
        </div>

        {p.estado === 'terminado' && p.resumenFinal && (
          <div className="pt-card">
            <h2>Resumen del equipo</h2>
            <p className="pt-reh-texto">{p.resumenFinal}</p>
          </div>
        )}

        <div className="pt-card pt-reh-resumen">
          {p.objetivo && (
            <p>
              <b>Objetivo:</b> {p.objetivo}
            </p>
          )}
          <ul className="pt-chico">
            <li>
              <b>
                {p.sesiones}
                {p.sesionesPrevistas ? ` de ${p.sesionesPrevistas}` : ''}
              </b>{' '}
              {p.sesiones === 1 && !p.sesionesPrevistas ? 'sesión' : 'sesiones'}
            </li>
            {p.frecuencia && <li>{p.frecuencia}</li>}
            <li>Desde el {fecha(p.inicio)}</li>
          </ul>
          {p.proximas.length > 0 ? (
            <p className="pt-chico">
              <Icono n="cal" /> Próxima cita: <b>{fecha(p.proximas[0].dia)}</b> a las {p.proximas[0].hora}
              {p.proximas.length > 1 ? ` (y ${p.proximas.length - 1} más)` : ''}
            </p>
          ) : (
            p.estado === 'activo' &&
            p.servicioId && (
              <Link href={`/portal/citas/nueva?mascota=${p.mascota.id}&servicio=${p.servicioId}`} className="pt-btn pt-btn--chico">
                <Icono n="calmas" /> Pedir mi siguiente sesión
              </Link>
            )
          )}
        </div>

        {(p.estado === 'activo' || p.ejercicios.length > 0) && (
          <section className="pt-seccion" aria-labelledby="t-ej">
            <h2 id="t-ej" className="pt-eyebrow">
              Ejercicios para casa
            </h2>
            <EjerciciosCasa inicial={p} />
          </section>
        )}

        {p.avance.length > 0 && (
          <section className="pt-seccion" aria-labelledby="t-av">
            <h2 id="t-av" className="pt-eyebrow">
              Cómo va
            </h2>
            <div className="pt-card pt-reh-graficas">
              <Grafica titulo="Dolor" max={10} puntos={p.avance.filter((s) => s.dolor != null).map((s) => ({ n: s.numero, v: s.dolor! }))} />
              <Grafica titulo="Cojera" max={5} puntos={p.avance.filter((s) => s.cojera != null).map((s) => ({ n: s.numero, v: s.cojera! }))} />
              <p className="pt-chico pt-tenue">Dolor de 0 (sin dolor) a 10 y cojera de 0 (sin cojera) a 5, según lo que mide el equipo en cada sesión.</p>
            </div>
            {notas.length > 0 && (
              <ul className="pt-reh-notas">
                {notas.map((s) => (
                  <li key={s.numero} className="pt-card">
                    <p className="pt-chico pt-tenue">
                      Sesión {s.numero} · {fecha(s.fecha)}
                    </p>
                    <p className="pt-reh-texto">{s.notaTutor}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <Barra activa="mascotas" />
    </>
  )
}

function Grafica({ titulo, max, puntos }: { titulo: string; max: number; puntos: { n: number; v: number }[] }) {
  if (!puntos.length) return null
  const W = 320
  const H = 90
  const pad = 10
  const n0 = puntos[0].n
  const n1 = puntos[puntos.length - 1].n
  const x = (n: number) => pad + ((n - n0) / Math.max(1, n1 - n0)) * (W - 2 * pad)
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad)
  const ult = puntos[puntos.length - 1]
  return (
    <figure className="pt-reh-grafica">
      <figcaption>
        <b>{titulo}</b>{' '}
        <span className="pt-chico">
          {puntos.length > 1 ? `${puntos[0].v} → ${ult.v}` : ult.v} de {max}
        </span>
      </figcaption>
      {puntos.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="pt-grafica" role="img" aria-label={`${titulo}: ${puntos.map((p) => `sesión ${p.n}, ${p.v}`).join('; ')}`}>
          <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="#d5e2dc" />
          <polyline fill="none" stroke="var(--pt-accent)" strokeWidth="2" points={puntos.map((p) => `${x(p.n)},${y(p.v)}`).join(' ')} />
          {puntos.map((p, i) => (
            <circle key={i} cx={x(p.n)} cy={y(p.v)} r="3" fill="var(--pt-primary)" />
          ))}
        </svg>
      )}
    </figure>
  )
}
