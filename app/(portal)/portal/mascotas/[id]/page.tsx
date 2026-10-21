import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'
import { FormAportar } from '../../../../../components/portal/Formularios'
import { Avatar, Barra, Cabecera, ESPECIE_LABEL, fecha, GraficaPeso, hoyISO, Icono, Pill, TIPO_CARTILLA_LABEL } from '../../../../../components/portal/comun'
import { ErrorClinica, portalMascota } from '../../../../../lib/clinica/servicio'
import { sesionTutor } from '../../../../../lib/portal/sesion'

export const dynamic = 'force-dynamic'

const TABS = ['resumen', 'cartilla', 'peso', 'documentos'] as const
type Tab = (typeof TABS)[number]

/** Ficha de la mascota para el tutor: datos, cartilla, peso y documentos publicados. Sin notas clínicas. */
export default async function MascotaPortal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string }> }) {
  const c = await sesionTutor()
  const { id } = await params
  if (!c) redirect(`/portal/entrar?siguiente=/portal/mascotas/${id}`)
  if (!/^\d+$/.test(id)) notFound()
  let d: Awaited<ReturnType<typeof portalMascota>>
  try {
    d = await portalMascota(c, Number(id))
  } catch (e) {
    if (e instanceof ErrorClinica && e.estado === 404) notFound()
    throw e
  }
  const { ver } = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(ver ?? '') ? (ver as Tab) : 'resumen'
  const m = d.mascota
  const hoy = hoyISO()
  const proxima = d.cartilla.filter((x) => x.proximaFecha && x.proximaFecha >= hoy).sort((a, b) => a.proximaFecha!.localeCompare(b.proximaFecha!))[0]
  const vencidas = d.cartilla.filter((x) => x.proximaFecha && x.proximaFecha < hoy)
  const documentosHabilitados = Boolean(process.env.CLINICA_BLOB_READ_WRITE_TOKEN || process.env.FINANZAS_BLOB_READ_WRITE_TOKEN)

  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <Link href="/portal" className="pt-chico" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icono n="back" /> Mis mascotas
        </Link>
        <div className="pt-card pt-card--activa">
          <div className="pt-cabecera-mascota">
            <Avatar nombre={m.nombre} especie={m.especie} grande />
            <div style={{ minWidth: 0 }}>
              <p className="pt-chico pt-tenue">{m.folio}</p>
              <h1>{m.nombre}</h1>
              <p className="pt-chico pt-tenue">
                {m.especie === 'otra' && m.especieOtra ? m.especieOtra : ESPECIE_LABEL[m.especie] ?? m.especie}
                {m.raza ? `, ${m.raza}` : ''}
                {m.edad ? ` · ${m.edad}` : ''}
                {m.ultimoPeso ? ` · ${m.ultimoPeso.kg} kg` : ''}
              </p>
            </div>
          </div>
          {(m.alertasManejo.length > 0 || m.alergias) && (
            <p className="pt-chico" style={{ marginTop: 4 }}>
              {m.alergias ? `⚑ Alergia: ${m.alergias}` : ''}
              {m.alergias && m.alertasManejo.length ? ' · ' : ''}
              {m.alertasManejo.join(' · ')}
            </p>
          )}
        </div>

        <nav className="pt-tabs" aria-label="Secciones">
          {(
            [
              ['resumen', 'Resumen'],
              ['cartilla', `Cartilla (${d.cartilla.length})`],
              ['peso', `Peso (${d.pesos.length})`],
              ['documentos', `Documentos (${d.documentos.length})`],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <Link key={k} href={`/portal/mascotas/${m.id}?ver=${k}`} className={tab === k ? 'is-on' : ''}>
              {l}
            </Link>
          ))}
        </nav>

        {tab === 'resumen' && (
          <>
            <Link href={`/portal/citas/nueva?mascota=${m.id}`} className="pt-btn pt-btn--acento">
              Pedir cita para {m.nombre}
            </Link>
            <div className="pt-card">
              <h2>Cartilla</h2>
              {vencidas.length > 0 && <div className="pt-aviso pt-aviso--warn">Refuerzo pendiente: {vencidas.map((v) => `${v.producto} (${fecha(v.proximaFecha)})`).join(', ')}. Agenda tu cita en la clínica.</div>}
              {proxima ? (
                <p>
                  Próxima fecha indicada: <b>{fecha(proxima.proximaFecha)}</b> · {proxima.producto}
                </p>
              ) : (
                <p className="pt-tenue">Sin próximas fechas indicadas.</p>
              )}
            </div>
            <div className="pt-card">
              <h2>Peso</h2>
              <GraficaPeso pesos={d.pesos} />
            </div>
            <div className="pt-card">
              <h2>Datos</h2>
              <dl className="pt-dl">
                <dt>Sexo</dt>
                <dd>
                  {m.sexo === 'macho' ? 'Macho' : m.sexo === 'hembra' ? 'Hembra' : '—'}
                  {m.esterilizado === 'si' ? ', esterilizado(a)' : m.esterilizado === 'no' ? ', entero(a)' : ''}
                </dd>
                <dt>Color</dt>
                <dd>{m.color ?? '—'}</dd>
                <dt>Nacimiento</dt>
                <dd>{m.fechaNacimiento ? `${fecha(m.fechaNacimiento)}${m.nacimientoEstimado ? ' (estimada)' : ''}` : '—'}</dd>
                <dt>Microchip</dt>
                <dd>{m.microchip ?? 'Sin microchip registrado'}</dd>
                <dt>Médico</dt>
                <dd>{m.medicoTratante?.nombre ?? '—'}</dd>
                <dt>Tutores</dt>
                <dd>{m.tutores.map((t) => t.nombre).join(', ')}</dd>
              </dl>
            </div>
          </>
        )}

        {tab === 'cartilla' && (
          <div className="pt-card pt-lista">
            {d.cartilla.length === 0 && <p className="pt-tenue" style={{ padding: 16 }}>La cartilla está vacía.</p>}
            {d.cartilla.map((x) => (
              <div key={x.id} className="pt-fila">
                <Icono n="shield" />
                <span className="pt-fila__main">
                  <span className="pt-fila__t1">
                    {x.producto} <Pill tono="info">{TIPO_CARTILLA_LABEL[x.tipo] ?? x.tipo}</Pill>
                  </span>
                  <span className="pt-fila__t2">
                    Aplicada {fecha(x.fechaAplicacion)}
                    {x.aplicadoPor ? ` · ${x.aplicadoPor}` : ''}
                    {x.lote ? ` · lote ${x.lote}` : ''}
                  </span>
                  <span className={`pt-fila__t2${x.proximaFecha && x.proximaFecha < hoy ? ' pt-rojo' : ''}`}>{x.proximaFecha ? `Próxima: ${fecha(x.proximaFecha)}` : ''}</span>
                </span>
              </div>
            ))}
            <p className="pt-chico pt-tenue" style={{ padding: '10px 16px' }}>Las fechas próximas las indica el médico según el protocolo de la clínica.</p>
          </div>
        )}

        {tab === 'peso' && (
          <>
            <div className="pt-card">
              <GraficaPeso pesos={d.pesos} />
            </div>
            <div className="pt-card pt-lista">
              {d.pesos.map((p) => (
                <div key={p.id} className="pt-fila">
                  <span className="pt-fila__main">
                    <span className="pt-fila__t1">{p.kg} kg</span>
                    <span className="pt-fila__t2">{fecha(p.fecha)}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'documentos' && (
          <>
            <div className="pt-card pt-lista">
              {d.documentos.length === 0 && <p className="pt-tenue" style={{ padding: 16 }}>La clínica no ha publicado documentos todavía.</p>}
              {d.documentos.map((x) => (
                <a key={x.id} href={`/api/clinica/portal/documentos/${x.id}/archivo`} target="_blank" rel="noreferrer" className="pt-fila">
                  <Icono n="file" />
                  <span className="pt-fila__main">
                    <span className="pt-fila__t1">{x.titulo}</span>
                    <span className="pt-fila__t2">
                      {fecha(x.fecha)} {x.origen === 'tutor' ? <Pill tono={x.revision === 'revisado' ? 'ok' : 'warn'}>{x.revision === 'revisado' ? 'aportado por ti · revisado' : 'aportado por ti · pendiente de revisión'}</Pill> : null}
                    </span>
                  </span>
                </a>
              ))}
            </div>
            <FormAportar mascotaId={m.id} habilitado={documentosHabilitados} />
            <p className="pt-chico pt-tenue">Aquí ves lo que la clínica publicó para ti (indicaciones, recetas, constancias, resultados). Las notas internas del médico no se muestran.</p>
          </>
        )}
      </main>
      <Barra activa="mascotas" />
    </>
  )
}
