/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Permisos efectivos de una persona (lógica pura)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Aquí se decide QUÉ puede hacer alguien a partir de dos datos de su cuenta:
 *
 *   1. `esSuperadmin`   → puede todo, siempre. La primera cuenta que se crea
 *                          en la instalación nace superadministradora
 *                          (collections/Users.ts); después, solo otro
 *                          superadministrador la otorga.
 *   2. `rolDeAcceso`    → un registro de la colección «Roles», editable por
 *                          los dueños y el superadministrador.
 *
 * Sin ninguno de los dos, la persona no puede hacer nada (no hay un «rol
 * anterior» como en MacAuto: esta instalación nació con roles).
 *
 * Este archivo NO importa nada a propósito: así lo ejercita
 * scripts/probarFinanzas.mjs con `node` pelón. La parte que habla con la base
 * (buscar el rol, memorizarlo por petición) vive en lib/permisos.ts.
 */

export type AlcanceDeVista = 'propios' | 'alcance' | 'todos'

export type PermisosFinanzas = {
  registrar: boolean
  ver: AlcanceDeVista
  /** IDs de actividades que ve quien tiene `ver: 'alcance'`. */
  alcance: (number | string)[]
  verRestringidas: boolean
  verSaldos: boolean
  verUtilidad: boolean
  liquidar: boolean
  corregir: boolean
  revisarComprobantes: boolean
  configurar: boolean
  /** Traspasos entre cuentas, entregas y devoluciones de fondos, aportaciones y retiros de socios (etapa 3, docs/62). */
  moverDinero: boolean
}

/**
 * Permisos de la clínica (pacientes, tutores y expediente). Octubre de 2026.
 *
 *   verPacientes       → ve clientes-tutores, mascotas, cartilla, pesos y documentos.
 *   editarPacientes    → da de alta y corrige clientes y mascotas; registra cartilla, pesos
 *                        y documentos; genera códigos de vinculación para el portal.
 *   verExpediente      → lee las notas clínicas (SOAP). Recepción normalmente NO.
 *   escribirExpediente → escribe y firma notas clínicas y agrega adendas.
 *   importar           → carga archivos (CSV/Excel) con clientes y mascotas.
 */
export type PermisosClinica = {
  verPacientes: boolean
  editarPacientes: boolean
  verExpediente: boolean
  escribirExpediente: boolean
  importar: boolean
  /** Ver la agenda y gestionar citas (crear, confirmar, cambiar de estado, reprogramar). */
  agenda: boolean
  /** Editar servicios, recursos (consultorios) y horario de atención. */
  configurarAgenda: boolean
}

export type Permisos = {
  superadmin: boolean
  /** Entra al panel completo del sitio. Sin esto, la persona entra directo a Finanzas. */
  panel: boolean
  gestionarUsuarios: boolean
  fin: PermisosFinanzas
  clinica: PermisosClinica
  /** Para mostrar en pantalla: «Superadministrador», el nombre del rol o «Sin rol». */
  rolNombre: string
  origen: 'superadmin' | 'rol' | 'ninguno'
}

/** Lo que guarda un registro de la colección «Roles» (solo lo que importa aquí). */
export type RolGuardado = {
  nombre?: string | null
  panel?: { acceso?: boolean | null; gestionarUsuarios?: boolean | null } | null
  finanzas?: {
    registrar?: boolean | null
    ver?: string | null
    alcance?: (number | string | { id: number | string })[] | null
    verRestringidas?: boolean | null
    verSaldos?: boolean | null
    verUtilidad?: boolean | null
    liquidar?: boolean | null
    corregir?: boolean | null
    revisarComprobantes?: boolean | null
    configurar?: boolean | null
    moverDinero?: boolean | null
  } | null
  clinica?: {
    verPacientes?: boolean | null
    editarPacientes?: boolean | null
    verExpediente?: boolean | null
    escribirExpediente?: boolean | null
    importar?: boolean | null
    agenda?: boolean | null
    configurarAgenda?: boolean | null
  } | null
}

export type UsuarioParaPermisos = {
  esSuperadmin?: boolean | null
}

const SIN_FINANZAS: PermisosFinanzas = {
  registrar: false, ver: 'propios', alcance: [], verRestringidas: false, verSaldos: false, verUtilidad: false,
  liquidar: false, corregir: false, revisarComprobantes: false, configurar: false, moverDinero: false,
}

const SIN_CLINICA: PermisosClinica = { verPacientes: false, editarPacientes: false, verExpediente: false, escribirExpediente: false, importar: false, agenda: false, configurarAgenda: false }
const TODO_CLINICA: PermisosClinica = { verPacientes: true, editarPacientes: true, verExpediente: true, escribirExpediente: true, importar: true, agenda: true, configurarAgenda: true }

const TODO_FINANZAS: PermisosFinanzas = {
  registrar: true, ver: 'todos', alcance: [], verRestringidas: true, verSaldos: true, verUtilidad: true,
  liquidar: true, corregir: true, revisarComprobantes: true, configurar: true, moverDinero: true,
}

/**
 * @param usuario la cuenta (solo `esSuperadmin`)
 * @param rol     el rol ya leído de la base, o null si no tiene
 */
export function calcularPermisos(usuario: UsuarioParaPermisos | null | undefined, rol: RolGuardado | null): Permisos {
  if (!usuario) {
    return { superadmin: false, panel: false, gestionarUsuarios: false, fin: { ...SIN_FINANZAS }, clinica: { ...SIN_CLINICA }, rolNombre: 'Sin sesión', origen: 'ninguno' }
  }
  if (usuario.esSuperadmin) {
    return { superadmin: true, panel: true, gestionarUsuarios: true, fin: { ...TODO_FINANZAS }, clinica: { ...TODO_CLINICA }, rolNombre: 'Superadministrador', origen: 'superadmin' }
  }
  if (rol) {
    const f = rol.finanzas ?? {}
    const c = rol.clinica ?? {}
    const ver: AlcanceDeVista = f.ver === 'todos' || f.ver === 'alcance' ? f.ver : 'propios'
    return {
      superadmin: false,
      panel: Boolean(rol.panel?.acceso),
      gestionarUsuarios: Boolean(rol.panel?.gestionarUsuarios),
      fin: {
        registrar: Boolean(f.registrar),
        ver,
        alcance: (f.alcance ?? []).map((a) => (typeof a === 'object' && a !== null ? a.id : a)),
        verRestringidas: Boolean(f.verRestringidas),
        verSaldos: Boolean(f.verSaldos),
        verUtilidad: Boolean(f.verUtilidad),
        liquidar: Boolean(f.liquidar),
        corregir: Boolean(f.corregir),
        revisarComprobantes: Boolean(f.revisarComprobantes),
        configurar: Boolean(f.configurar),
        /* Quien configura cuentas y cajas también mueve dinero entre ellas
           (dueños y administración). La casilla sirve para dárselo además a
           un rol que no configura (un tesorero, por ejemplo). Así los roles
           guardados antes de la etapa 3 (docs/62) no pierden nada el día del
           cambio y nadie lo pierde por volver a guardar un rol. */
        moverDinero: Boolean(f.moverDinero) || Boolean(f.configurar),
      },
      clinica: {
        /* Quien edita o escribe también ve: así un rol guardado solo con «editar» no queda ciego. */
        verPacientes: Boolean(c.verPacientes) || Boolean(c.editarPacientes) || Boolean(c.verExpediente) || Boolean(c.importar) || Boolean(c.agenda),
        editarPacientes: Boolean(c.editarPacientes) || Boolean(c.importar),
        verExpediente: Boolean(c.verExpediente) || Boolean(c.escribirExpediente),
        escribirExpediente: Boolean(c.escribirExpediente),
        importar: Boolean(c.importar),
        agenda: Boolean(c.agenda) || Boolean(c.configurarAgenda),
        configurarAgenda: Boolean(c.configurarAgenda),
      },
      rolNombre: rol.nombre?.trim() || 'Rol sin nombre',
      origen: 'rol',
    }
  }
  /* Sin rol: no entra a nada. Quien administra usuarios le asigna uno. */
  return { superadmin: false, panel: false, gestionarUsuarios: false, fin: { ...SIN_FINANZAS }, clinica: { ...SIN_CLINICA }, rolNombre: 'Sin rol', origen: 'ninguno' }
}

/** ¿Tiene algo que hacer en Finanzas? */
export function usaFinanzas(p: Permisos): boolean {
  const f = p.fin
  return p.superadmin || f.registrar || f.verSaldos || f.corregir || f.revisarComprobantes || f.configurar || f.liquidar || f.moverDinero || f.ver !== 'propios'
}

/** Quien no entra al panel completo y sí usa Finanzas: su acceso es directo a la captura. */
export function esSoloCaptura(p: Permisos): boolean {
  return !p.panel && usaFinanzas(p)
}

/** ¿Tiene algo que hacer en la clínica (pacientes y expediente)? */
export function usaClinica(p: Permisos): boolean {
  return p.superadmin || p.clinica.verPacientes
}
