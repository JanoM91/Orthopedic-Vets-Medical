import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { es } from '@payloadcms/translations/languages/es'

import { site } from './lib/site'
import { resendEmailAdapter } from './lib/emailAdapter'
import { mostrarMensajeDeError } from './lib/erroresPublicos'

import { Users } from './collections/Users'
import { Roles } from './collections/Roles'
import { FinActividades, FinCategorias, FinConfiguracion, FinCuentas } from './collections/finanzas/catalogos'
import { FinBitacora, FinComprobantes, FinMovimientos, FinOperaciones } from './collections/finanzas/registros'
import { Clientes, Mascotas, MasPesos } from './collections/clinica/pacientes'
import { MasCartilla, MasDocumentos, MasFotos, MasNotas } from './collections/clinica/expediente'
import { CodigosVinculacion, Importaciones, Tutores } from './collections/clinica/tutores'
import { AgendaConfiguracion, Citas, Recursos, Servicios } from './collections/clinica/agenda'
import { SitioConfiguracion, SitioFotos } from './collections/clinica/sitio'
import { Solicitudes } from './collections/clinica/solicitudes'
import { InstalacionConfiguracion } from './collections/Instalacion'
import { FarAlmacenes, FarPresentaciones, FarProductos, FarProveedores } from './collections/farmacia/catalogo'
import { FarLotes, FarMovimientos } from './collections/farmacia/inventario'
import { FarCompras, FarProveedorClaves } from './collections/farmacia/compras'
import { FarCierresDia, FarLibroControl, FarRecetas, FarVentas } from './collections/farmacia/ventas'
import { FarAlertas, FarPromociones } from './collections/farmacia/alertas'
import { FarEvidencias, FarPagosEventos, FarPedidos } from './collections/farmacia/pedidos'
import { FarRecompras } from './collections/farmacia/recompras'
import { FarPlanes } from './collections/farmacia/planes'
import { FarmaciaConfiguracion } from './collections/farmacia/configuracion'
import { protegerColeccion, protegerGlobal } from './lib/permisos'
import { Paquetes, PaqUsos, PaqVendidos } from './collections/clinica/paquetes'
import { CirConsentimientos, CirHojas, CirPresupuestos, CirugiaConfiguracion } from './collections/clinica/cirugia'
import { HosInternamientos } from './collections/clinica/hospital'
import { EstAdicionales, EstFichas, EstFotos, EsteticaConfiguracion } from './collections/clinica/estetica'
import { conModuloColeccion, conModuloGlobal } from './lib/modulosAcceso'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Orthopedic Vet's Finanzas — réplica de MacAuto Finanzas (Exkalibur, octubre
 * de 2026) sin el sitio público ni los autos: Payload CMS embebido en Next.js,
 * solo con usuarios, roles y el módulo de Finanzas.
 *
 * Base de datos: PostgreSQL en Supabase (DATABASE_URL). Comprobantes: almacén
 * PRIVADO de Vercel Blob (FINANZAS_BLOB_READ_WRITE_TOKEN).
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    /* Tema claro fijo: la marca del panel (app/(payload)/custom.css) está pensada sobre fondo claro. */
    theme: 'light',
    /* Sin gravatar: el avatar de fábrica no llama a servicios externos. */
    avatar: 'default',
    meta: {
      title: site.brand.name,
      titleSuffix: ` — ${site.brand.name}`,
      /* Isotipo de la marca en la pestaña (public/app/). Finanzas cambia el suyo en lib/finanzas/appMovil.ts. */
      icons: [{ rel: 'icon', type: 'image/png', url: '/app/favicon-64.png' }],
      openGraph: { siteName: site.brand.name, title: site.brand.name, description: `Panel de ${site.brand.name}` },
    },
    components: {
      graphics: {
        Logo: '/components/admin/Logo#default',
        Icon: '/components/admin/Icono#default',
      },
      /* Marca y, debajo, el bloque «Trabajo» (Hoy, Agenda, Pacientes, Mostrador, Farmacia, Finanzas) antes de los catálogos. */
      beforeNavLinks: ['/components/admin/MarcaDelPanel#default', '/components/admin/MenuTrabajo#default'],
      /* Indicador de carga (perro y gato) al moverse entre pantallas, igual que en el portal y el sitio. */
      providers: ['/components/admin/ProveedorCargando#default'],
      views: {
        /* Tablero «Hoy» (Versión A, fase 2): reemplaza el tablero de fábrica y la antigua Bienvenida. */
        dashboard: {
          Component: '/components/admin/Tablero#default',
        },
        /**
         * Finanzas. Una sola vista para /admin/finanzas y todo lo que cuelga
         * de ahí (/registrar, /movimientos, /operacion/123…): sin `exact`,
         * Payload la usa para cualquier ruta que empiece así, y la vista
         * decide qué pantalla pintar. Quien solo captura la ve sin el menú.
         */
        finanzas: {
          Component: '/components/admin/finanzas/VistaFinanzas#default',
          path: '/finanzas',
        },
        /* Clínica (octubre de 2026): pacientes, tutores y expediente. Misma idea. */
        clinica: {
          Component: '/components/admin/clinica/VistaClinica#default',
          path: '/clinica',
        },
        /* Puesta a punto (UX del panel 2, nov-2026): docs/ARRANQUE.md revisado contra la base. */
        puestaAPunto: {
          Component: '/components/admin/PuestaAPunto#default',
          path: '/puesta-a-punto',
          exact: true,
        },
        /* Farmacia (25-oct-2026): catálogo, inventario, compras y ventas. Misma idea. */
        farmacia: {
          Component: '/components/admin/farmacia/VistaFarmacia#default',
          path: '/farmacia',
        },
      },
    },
  },
  /**
   * `protegerColeccion` (lib/permisos.ts): quien entra solo a capturar recibe,
   * fuera de Finanzas, lo mismo que un visitante sin sesión. Se aplica a TODAS
   * para que una colección nueva quede protegida sin acordarse. Usuarios,
   * Roles y las de Finanzas traen sus propias reglas.
   */
  collections: [
    Users,
    Roles,
    /* Clínica (octubre de 2026): pacientes, tutores y expediente. Reglas propias en collections/clinica/acceso.ts.
       Con el módulo Clínica apagado (lib/modulos.ts) responden «no» a todo. */
    ...[Clientes, Mascotas, MasPesos, MasCartilla, MasNotas, MasDocumentos, MasFotos, CodigosVinculacion, Importaciones, Recursos, Servicios, Citas, Solicitudes, Paquetes, PaqVendidos, PaqUsos, CirPresupuestos, CirConsentimientos, CirHojas, HosInternamientos].map((c) => conModuloColeccion('clinica', c)),
    ...[EstAdicionales, EstFichas, EstFotos].map((c) => conModuloColeccion('estetica', conModuloColeccion('clinica', c))),
    /* Las cuentas del portal no se apagan con la clínica: en la fase 5 también entran a la tienda. */
    Tutores,
    /* Fotos del sitio público (home versión B, nov-2026): reglas propias, como el global «Sitio público». */
    SitioFotos,
    /* Farmacia (25-oct-2026): reglas propias en collections/farmacia/acceso.ts (ya revisan el módulo). */
    FarProductos,
    FarPresentaciones,
    FarAlmacenes,
    FarProveedores,
    FarLotes,
    FarMovimientos,
    FarProveedorClaves,
    FarCompras,
    FarRecetas,
    FarVentas,
    FarLibroControl,
    FarCierresDia,
    FarAlertas,
    FarPromociones,
    FarPedidos,
    FarPagosEventos,
    FarEvidencias,
    FarRecompras,
    FarPlanes,
    FinCuentas,
    FinCategorias,
    FinActividades,
    FinOperaciones,
    FinMovimientos,
    FinComprobantes,
    FinBitacora,
  ].map(protegerColeccion),
  globals: [FinConfiguracion, conModuloGlobal('clinica', AgendaConfiguracion), conModuloGlobal('clinica', CirugiaConfiguracion), conModuloGlobal('estetica', conModuloGlobal('clinica', EsteticaConfiguracion)), SitioConfiguracion, FarmaciaConfiguracion, InstalacionConfiguracion].map(protegerGlobal),
  /* Correo de recuperación de contraseña (Resend por HTTP). Sin RESEND_API_KEY no se envía nada. Ver lib/emailAdapter.ts. */
  email: resendEmailAdapter,
  /* En producción los errores públicos (400/403/429 con mensaje en español) salían como «An unknown error occurred.». Ver lib/erroresPublicos.ts. */
  hooks: {
    afterError: [mostrarMensajeDeError],
  },
  i18n: {
    supportedLanguages: { es },
    fallbackLanguage: 'es',
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    /**
     * El esquema se versiona con migraciones (carpeta migrations/), no con el
     * «push» de modo desarrollo que usa MacAuto: así `npm run dev` nunca toca
     * la base por accidente. En producción, Payload aplica solo las
     * migraciones pendientes al arrancar (`prodMigrations`); no hay que correr
     * nada a mano. Ver docs/OPERACION.md.
     */
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
  }),
})
