# Operación — Orthopedic Vet's Finanzas

> Réplica de MacAuto Finanzas para Orthopedic Vet's Medical (11 de octubre de 2026). Lo que hace cada pantalla está explicado en los docs 60, 61 y 62 del repositorio de MacAuto; aquí solo va lo que es distinto y cómo se opera esta instalación.

## 1. Qué cambió respecto a MacAuto Finanzas

| Tema | MacAuto | Aquí |
|---|---|---|
| A qué se asigna una entrada o gasto | Un auto, varios autos (con reparto), actividad, general | **Un área** (Consulta, Cirugía, Rehabilitación, Farmacia, Administración…), general o «no sé todavía». Decisión de Jano, 11-oct-2026. |
| Sitio público, Mac, leads, citas | Sí | No. La raíz `/` manda a `/admin/finanzas`. |
| Base de datos | Neon, esquema por `npm run dev` | **Supabase**, esquema por **migraciones** que la app aplica sola al arrancar. |
| Primer acceso | Rol anterior «admin» se marcaba superadmin | **La primera cuenta que se crea nace superadministradora.** |
| Roles sugeridos | 6 (Dueño, Administración, Director, Vendedor, Operativo de piso, Editor) | 4: Dueño, Administración, Médico veterinario (ve lo de Consulta, Cirugía y Rehabilitación), Recepción (solo captura). |
| Categorías sugeridas | De autos | 20 de clínica (Consultas, Cirugías, Implantes y material de osteosíntesis, Medicamentos y anestesia, Nómina restringida…). |
| Nota de voz | Ejemplos y vocabulario de autos | Ejemplos y vocabulario de la clínica; propone el área. |
| Marca | Navy y turquesa | Verde pino `#123a34` y menta del logotipo `#6ed8bb`. Nombre de la app en el teléfono: «Finanzas». |

Todo lo demás es igual: cobros y pagos parciales, comprobantes privados, corrección y anulación con bitácora, nómina restringida, saldos, traspasos, fondos a cargo de empleados, gastos «de mi bolsa» con reembolso, sesiones de 7 días y «Si se pierde un teléfono».

## 2. Piezas y variables

| Pieza | Dónde | Variable en Vercel |
|---|---|---|
| App | Vercel, proyecto `orthopedic-vets-finanzas` (equipo Jano's Portfolio), rama `main` = producción | — |
| Código | GitHub `JanoM91/Orthopedic-Vets-Medical` | — |
| Base de datos | Supabase, organización Exkalibur Consulting | `DATABASE_URL` (Sensitive) |
| Secreto de sesiones | — | `PAYLOAD_SECRET` (Sensitive). Cambiarlo cierra todas las sesiones. |
| Comprobantes | Vercel Blob **privado**, conectado con prefijo `FINANZAS` | `FINANZAS_BLOB_READ_WRITE_TOKEN` (la crea Vercel al conectar) |
| Nota de voz | OpenAI | `OPENAI_API_KEY` (Sensitive). Usar una llave propia de la clínica o de Exkalibur, con límite de gasto; **no la de MacAuto**. |
| Correo «Olvidé mi contraseña» | Resend | `RESEND_API_KEY`, `LEADS_FROM_EMAIL` (opcionales) |
| Identidad | — | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_LOCATION_CITY`, `NEXT_PUBLIC_LOCATION_TIMEZONE` |

## 3. Base de datos en Supabase

- La app entra a Postgres con un rol propio (`payload_app`) por el **pooler en modo transacción** (puerto 6543). No usa la API REST de Supabase ni las llaves anon/service.
- Las tablas viven en el esquema `public` con **RLS activado y sin políticas**: la API REST de Supabase no puede leer nada (ni usuarios ni dinero). El dueño de las tablas (`payload_app`) no está sujeto a RLS, así que la app no se entera.
- **Migraciones:** `migrations/`. Al arrancar en producción, Payload revisa la tabla `payload_migrations` y aplica las pendientes. Para un cambio de modelo: ver `CLAUDE.md` → «Cambios al modelo de datos». **No** se corre `npm run dev` contra la base de producción.
- Respaldos: el plan Pro de Supabase hace respaldos diarios (7 días). Si se quiere poder volver a cualquier minuto, activar *Point in Time Recovery* (costo extra).

## 4. Arranque (una sola vez)

1. Abrir la URL de producción → «Crear primer usuario»: esa cuenta queda como **superadministrador**.
2. Finanzas → Configuración → **Crear las sugeridas** (categorías y áreas) → **Crear los sugeridos** (roles) → fecha de corte.
3. Panel → Finanzas → **Cuentas y cajas**: dar de alta bancos, efectivo y cajas chicas con su saldo a la fecha de corte.
4. Panel → Sistema → **Usuarios**: crear a cada persona con su rol.
5. Cada persona abre la URL en su teléfono y la agrega a la pantalla de inicio (la app se lo sugiere).

## 5. Verificación de la entrega (11-oct-2026)

| Prueba | Resultado |
|---|---|
| `tsc --noEmit`, `npm run lint`, `npm run build` | Sin errores |
| `npm run test:finanzas` | 44 / 44 |
| Arranque en modo producción contra Postgres local vacío | Aplicó las 2 migraciones solo |
| Integración por API contra Postgres local | 37 / 37: primer usuario superadmin, catálogos y roles sugeridos, gasto asignado a Cirugía, reintento sin duplicar, «auto» rechazado, entrada por cobrar con cobro parcial y cobro excedido, clasificar, saldos al centavo, traspaso, Recepción (sin nómina, sin saldos, solo lo suyo, no abre lo ajeno, no se vuelve superadmin), cuenta sin rol rechazada, gasto «de mi bolsa» y reembolso, anulación, API genérica `fin-*` cerrada, nota de voz sin llave → 503, comprobante sin almacén → 503 |
| Pantallas (Chromium) | Login 390 px, inicio y captura de Recepción a 390 px, inicio de superadmin a 1280 px; sin errores de JavaScript |

No probado aquí: subida real de comprobantes (necesita el almacén privado), nota de voz con OpenAI real, correo de recuperación.
