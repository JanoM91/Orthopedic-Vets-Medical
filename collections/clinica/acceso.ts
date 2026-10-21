import type { Access, AccessResult, FieldHook, PayloadRequest, Where } from 'payload'
import { esPersonal, esTutor, permisosDe } from '../../lib/permisos'

/**
 * Reglas de acceso de las colecciones de la clínica (octubre de 2026).
 *
 * Tres tipos de sesión llegan aquí:
 *   - equipo (colección «users»): lo que diga su rol (lib/permisosBase.ts → clinica);
 *   - tutor (colección «tutores», portal): solo lo de SU ficha de cliente y sus mascotas,
 *     y de los documentos solo los publicados; las notas clínicas nunca;
 *   - visitante: nada.
 *
 * Estas reglas las aplica Payload en su API genérica y en el panel. La API de
 * la clínica (lib/clinica/servicio.ts) hace sus propias revisiones y luego
 * escribe con la API local; las dos capas dicen lo mismo a propósito.
 */

export type PermisoClinica = 'verPacientes' | 'editarPacientes' | 'verExpediente' | 'escribirExpediente' | 'importar'

export const equipoCon = (permiso: PermisoClinica): Access => async ({ req }) => esPersonal(req) && (await permisosDe(req)).clinica[permiso]

/** Id de la ficha de cliente vinculada a la sesión de tutor, o null. */
export function clienteDelTutor(req: PayloadRequest): number | null {
  if (!esTutor(req)) return null
  const c = (req.user as { cliente?: number | { id: number } | null }).cliente
  if (c == null) return null
  return typeof c === 'object' ? Number(c.id) : Number(c)
}

/** Lo que ve el equipo con un permiso, o el tutor dentro de SU alcance (según `paraTutor`). */
export function leerEquipoOTutor(permiso: PermisoClinica, paraTutor: (clienteId: number) => Where): Access {
  return async ({ req }): Promise<AccessResult> => {
    if (esPersonal(req)) return (await permisosDe(req)).clinica[permiso]
    const cliente = clienteDelTutor(req)
    if (cliente != null) return paraTutor(cliente)
    return false
  }
}

/** Mascotas del cliente: la mascota tiene al cliente entre sus tutores. */
export const mascotasDelCliente = (clienteId: number): Where => ({ 'tutores.cliente': { equals: clienteId } })
/** Registros colgados de una mascota (cartilla, pesos, documentos): la mascota es del cliente. */
export const porMascotaDelCliente = (clienteId: number): Where => ({ 'mascota.tutores.cliente': { equals: clienteId } })

export const nadie: Access = () => false

/** Campos que solo el equipo ve (notas internas, etc.). */
export const soloEquipoLee = async ({ req }: { req: PayloadRequest }) => esPersonal(req)

/**
 * Folio público inmutable derivado del id: CLI-00012, MAS-00034. Es virtual
 * (no se guarda): el id no cambia nunca, así que el folio tampoco.
 */
export const folioDesdeId = (prefijo: string): FieldHook => ({ data, originalDoc }) => {
  const id = (originalDoc as { id?: unknown } | undefined)?.id ?? (data as { id?: unknown } | undefined)?.id
  return id == null ? null : `${prefijo}-${String(id).padStart(5, '0')}`
}
export const folioParaId = (prefijo: string, id: number | string): string => `${prefijo}-${String(id).padStart(5, '0')}`

/** Fecha AAAA-MM-DD válida u omitida. */
export const validarFechaOpcional = (v: unknown) => {
  if (v == null || v === '') return true
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Escribe la fecha como AAAA-MM-DD, por ejemplo 2024-05-14.'
  const [y, m, d] = v.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? true : 'Esa fecha no existe.'
}
