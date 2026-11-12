import Link from 'next/link'
import React from 'react'
import type { CitaVista, PortalResumen } from '../../lib/clinica/tipos'
import { ESPECIE_LABEL, fecha, Icono, iniciales } from './comun'
import { CambiarFoto } from './Foto'

type MascotaResumen = PortalResumen['mascotas'][number]

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
/** «Sáb 14 nov» (sin año). */
export const diaCorto = (d: string) => {
  const t = `${DIAS_CORTOS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${fecha(d).replace(/ \d{4}$/, '')}`
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Tarjeta de mascota (inicio y «Mascotas»): foto grande, nombre, datos y lo próximo. */
export function TarjetaMascota({ m, proxima }: { m: MascotaResumen; proxima?: CitaVista | null }) {
  const especie = m.especie === 'otra' && m.especieOtra ? m.especieOtra : ESPECIE_LABEL[m.especie] ?? m.especie
  return (
    <article className={`pt-mascota${m.estado === 'fallecido' ? ' is-memoria' : ''}`}>
      <Link href={`/portal/mascotas/${m.id}`} className="pt-mascota__foto" aria-label={`Ver a ${m.nombre}`}>
        {m.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.foto} alt={m.nombre} loading="lazy" decoding="async" />
        ) : (
          <span className={`pt-mascota__sinfoto is-${m.especie}`}>
            <span>{iniciales(m.nombre)}</span>
          </span>
        )}
      </Link>
      {m.estado !== 'fallecido' && (
        <div className="pt-mascota__camara">
          <CambiarFoto mascotaId={m.id} nombre={m.nombre} tieneFoto={Boolean(m.foto)} variante="flotante" />
        </div>
      )}
      <Link href={`/portal/mascotas/${m.id}`} className="pt-mascota__texto">
        <span className="pt-mascota__nombre">{m.nombre}</span>
        <span className="pt-mascota__datos">
          {especie}
          {m.edad ? ` · ${m.edad}` : ''}
        </span>
        {m.estado === 'fallecido' ? (
          <span className="pt-mascota__chip is-gris">En memoria</span>
        ) : proxima ? (
          <span className={`pt-mascota__chip ${proxima.estado === 'confirmada' ? 'is-ok' : 'is-warn'}`} title="Próxima cita">
            <Icono n="cal" /> {fecha(proxima.dia).replace(/ \d{4}$/, '')} · {proxima.horaInicio}
          </span>
        ) : m.proximaCartilla ? (
          <span className="pt-mascota__chip is-info">Refuerzo {fecha(m.proximaCartilla.fecha).replace(/ \d{4}$/, '')}</span>
        ) : null}
      </Link>
    </article>
  )
}
