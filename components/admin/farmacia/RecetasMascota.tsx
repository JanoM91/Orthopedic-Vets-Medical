'use client'

import React, { useEffect, useState } from 'react'
import type { RecetaVista } from '../../../lib/farmacia/tipos'
import { api, Aviso, Boton, Campo, ErrorForm, fecha, momento } from './comun'
import { EditorMedicamentos, medicamentosParaApi, medicamentoVacio, type MedicamentoEdit, PastillaReceta } from './Recetas'

/**
 * Pestaña «Recetas» del expediente (fase 3). El médico veterinario emite la
 * receta interna: el peso vigente se precarga en el servidor y la dosis la
 * escribe él (el sistema nunca sugiere dosis). Al firmar queda válida e
 * inmutable; firmar exige su cédula profesional en Sistema → Usuarios.
 */
export default function RecetasMascota({ mascotaId, puedeEmitir, notas, rutaFarmacia }: { mascotaId: number; puedeEmitir: boolean; notas: { id: number; titulo: string }[]; rutaFarmacia: string | null }) {
  const [lista, setLista] = useState<RecetaVista[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)
  const [n, setN] = useState(0)
  useEffect(() => {
    api.get<{ recetas: RecetaVista[] }>('recetas', { mascota: mascotaId }).then((r) => setLista(r.recetas), (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [mascotaId, n])
  const recargar = () => setN((x) => x + 1)
  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <h2 className="fz-h2">Recetas</h2>
        {puedeEmitir && !nueva && (
          <Boton tono="navy" chico onClick={() => setNueva(true)}>
            Emitir receta
          </Boton>
        )}
      </div>
      {nueva && (
        <FormularioReceta
          mascotaId={mascotaId}
          notas={notas}
          onListo={() => {
            setNueva(false)
            recargar()
          }}
          onCancelar={() => setNueva(false)}
        />
      )}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {lista && lista.length === 0 && !nueva && <p className="fz-tenue fz-chico">Sin recetas.</p>}
      {(lista ?? []).map((r) => (
        <TarjetaReceta key={r.id} r={r} puedeEmitir={puedeEmitir} rutaFarmacia={rutaFarmacia} onCambio={recargar} />
      ))}
    </div>
  )
}

function TarjetaReceta({ r, puedeEmitir, rutaFarmacia, onCambio }: { r: RecetaVista; puedeEmitir: boolean; rutaFarmacia: string | null; onCambio: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const firmar = async () => {
    setOcupado(true)
    setError(null)
    try {
      await api.post(`recetas/${r.id}/firmar`)
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo firmar.')
    }
    setOcupado(false)
  }
  return (
    <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
      <div className="fz-entre">
        <span>
          <b>{r.folio}</b> · {r.origen === 'interna' ? 'interna' : 'externa'} <PastillaReceta r={r} />
        </span>
        {rutaFarmacia && (
          <a href={`${rutaFarmacia}/recetas/${r.id}`} className="fz-link">
            Ver en farmacia
          </a>
        )}
      </div>
      <p className="fz-chico fz-tenue">
        {r.mvzNombre}
        {r.mvzCedula ? ` · céd. ${r.mvzCedula}` : ''} · emitida {fecha(r.fechaEmision)} · vigente al {fecha(r.vigenteHasta)}
        {r.pesoKg != null ? ` · ${r.pesoKg} kg` : ''}
        {r.folioCuantificado ? ` · folio ${r.folioCuantificado}` : ''}
      </p>
      <ul className="fa-bitacora">
        {r.renglones.map((x, i) => (
          <li key={x.id ?? i}>
            <b>{x.productoNombre ?? x.principio}</b>
            {[x.dosis, x.frecuencia, x.duracion].filter(Boolean).length ? ` — ${[x.dosis, x.frecuencia, x.duracion].filter(Boolean).join(' · ')}` : ''} · surtidos {x.surtidosUsados}/{x.surtidosPermitidos}
          </li>
        ))}
      </ul>
      {r.indicaciones && <p className="fz-chico">{r.indicaciones}</p>}
      {r.firmadaEn && <p className="fz-chico fz-tenue">Firmada por {r.firmadaPor?.nombre} · {momento(r.firmadaEn)}</p>}
      <ErrorForm error={error} />
      {r.estado === 'borrador' && puedeEmitir && (
        <div className="fz-acciones-fin">
          <Boton tono="navy" chico disabled={ocupado} onClick={() => void firmar()}>
            Firmar receta
          </Boton>
        </div>
      )}
    </div>
  )
}

function FormularioReceta({ mascotaId, notas, onListo, onCancelar }: { mascotaId: number; notas: { id: number; titulo: string }[]; onListo: () => void; onCancelar: () => void }) {
  const [meds, setMeds] = useState<MedicamentoEdit[]>([medicamentoVacio()])
  const [vigenciaDias, setVigenciaDias] = useState('30')
  const [folio, setFolio] = useState('')
  const [indicaciones, setIndicaciones] = useState('')
  const [notaId, setNotaId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const hayGrupoI = meds.some((m) => m.grupo === 'I')
  const guardar = async (firmar: boolean) => {
    setOcupado(true)
    setError(null)
    try {
      await api.post('recetas', { mascotaId, notaId: notaId ? Number(notaId) : null, vigenciaDias: Number(vigenciaDias) || 30, folioCuantificado: folio || null, indicaciones: indicaciones || null, renglones: medicamentosParaApi(meds), firmar })
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      /* Si la firma falló, el borrador ya quedó: refrescar la lista. */
      if (firmar && e instanceof Error && /borrador/.test(e.message)) onListo()
    }
    setOcupado(false)
  }
  return (
    <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
      <h3 className="fz-h2">Nueva receta</h3>
      <p className="fz-chico fz-tenue">El peso vigente se precarga en la receta. La dosis la escribes tú; el sistema no la sugiere.</p>
      <EditorMedicamentos valor={meds} onChange={setMeds} />
      <div className="cl-grid cl-grid--3">
        <Campo etiqueta="Vigencia (días)">
          <input className="fz-input" type="number" min={1} max={365} value={vigenciaDias} onChange={(e) => setVigenciaDias(e.target.value)} />
        </Campo>
        <Campo etiqueta={hayGrupoI ? 'Folio de receta cuantificada *' : 'Folio cuantificado (Grupo I)'}>
          <input className="fz-input" value={folio} onChange={(e) => setFolio(e.target.value)} />
        </Campo>
        {notas.length > 0 && (
          <Campo etiqueta="Ligar a la nota">
            <select className="fz-input" value={notaId} onChange={(e) => setNotaId(e.target.value)}>
              <option value="">Ninguna</option>
              {notas.map((x) => (
                <option key={x.id} value={String(x.id)}>
                  {x.titulo}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>
      <Campo etiqueta="Indicaciones generales">
        <textarea className="fz-input" rows={2} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
      </Campo>
      <ErrorForm error={error} />
      <div className="fz-acciones-fin">
        <Boton onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </Boton>
        <Boton onClick={() => void guardar(false)} disabled={ocupado}>
          Guardar borrador
        </Boton>
        <Boton tono="navy" onClick={() => void guardar(true)} disabled={ocupado || (hayGrupoI && !folio)}>
          Firmar y emitir
        </Boton>
      </div>
      <p className="fz-chico fz-tenue">Firmada, la receta ya no cambia (solo se cancela). Para firmar necesitas tu cédula profesional en tu usuario.</p>
    </div>
  )
}
