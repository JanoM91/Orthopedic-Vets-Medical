# Orthopedic Vet's — plataforma de clínica veterinaria (marca blanca)

Plataforma de **Orthopedic Vet's Medical** (clínica veterinaria de ortopedia, Xalapa), pensada para replicarse a otras clínicas por configuración. Hoy tiene dos módulos:

- **Finanzas** (octubre de 2026): réplica de **MacAuto Finanzas** (repo `Exkalibur-labs/macauto-xalapa`, docs/60–62) sin sitio público ni autos: cada entrada o gasto se asigna a un **área** (`fin-actividades`), a «general» o queda pendiente.
- **Clínica** (20/21-oct-2026): clientes-tutores, mascotas, cartilla, pesos, notas clínicas firmables, documentos, importación desde CSV/Excel, **agenda y citas** (con cargo automático en Finanzas) y **portal del tutor** (`/portal`, incluye pedir citas). Todo en `docs/CLINICA.md`.

Proyecto de Exkalibur Consulting. Operación y arranque: `docs/OPERACION.md`.

## Stack (no cambiar sin consultar)

- Next.js 16 (App Router) + TypeScript estricto · Payload CMS 3 embebido (`/admin`).
- **Base de datos: PostgreSQL en Supabase** (proyecto `orthopedic-vets-finanzas`, ref `mjgpafqqcflqskcupuoq`). `DATABASE_URL` usa el rol `payload_app` (dueño de las tablas) por el pooler en modo transacción de **aws-0**-us-east-2:6543. La app NO usa la API REST de Supabase: Payload se conecta directo a Postgres.
- **Esquema por migraciones** (`migrations/`), con `push: false`. En producción Payload aplica solas las migraciones pendientes al arrancar (`prodMigrations`). Nunca se sincroniza con `npm run dev` como en MacAuto.
- Comprobantes en un almacén **privado** de Vercel Blob (`FINANZAS_BLOB_READ_WRITE_TOKEN`).
- Nota de voz: el **dictado del navegador** (Web Speech API) convierte la voz en texto en el teléfono y **Claude** (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, por omisión `claude-haiku-5-5`, salida JSON con `output_config.format`) lo interpreta. No se sube audio. Sin llave, responde 503 y lo demás funciona. Decisión de Jano (11-oct-2026): Anthropic en vez de OpenAI.
- Deploy: Vercel (producción = rama `main`).

## Reglas heredadas de MacAuto Finanzas (no romper)

- **Todo lo que escribe en `fin-*` pasa por `lib/finanzas/servicio.ts`** (expuesto en `app/api/finanzas/[...ruta]/route.ts`). Las colecciones `fin-operaciones`, `fin-movimientos`, `fin-comprobantes` y `fin-bitacora` responden 403 en la API genérica de Payload, incluso al superadmin.
- Permisos en `lib/permisos.ts` (con Payload) y `lib/permisosBase.ts` (puro). Roles editables en `roles`; `esSuperadmin` en `users`. **La primera cuenta de la instalación nace superadmin**; después, toda cuenta nueva exige «Rol de acceso». No existe el «rol anterior» de MacAuto.
- Toda colección nueva se envuelve con `protegerColeccion` (ya lo hace `payload.config.ts`).
- Dinero en **centavos enteros** para calcular (`lib/finanzas/reglas.ts`); en la base, pesos. Fechas reales como texto `AAAA-MM-DD` en la zona del negocio.
- Nada financiero se borra: se corrige o se anula con motivo; todo queda en `fin-bitacora`.
- Pantallas de Finanzas: probar de 320 a 430 px y campos de 16 px.
- Pruebas sin base: `npm run test:finanzas` (también en CI).

## Reglas de la Clínica (docs/CLINICA.md)

- Colecciones `clientes`, `mascotas`, `mas-*`, `tutores`, `codigos-vinculacion`, `importaciones`, `recursos`, `servicios`, `citas` (y el global `agenda-configuracion`) tienen reglas propias en `collections/clinica/acceso.ts` y **no** se envuelven con `protegerColeccion` (ya lo sabe `lib/permisos.ts`). Distinguen tres sesiones: equipo (`users`), tutor (`tutores`) y visitante.
- La lógica va en `lib/clinica/servicio.ts`, `importacion.ts` y `agenda.ts`, expuesta en `app/api/clinica/[...ruta]/route.ts`. El equipo escribe con `overrideAccess: true` después de revisar `ctx.p.clinica.*`; el **portal siempre consulta con `overrideAccess: false` y el usuario tutor**, para que las reglas de acceso decidan qué ve.
- Una **nota clínica firmada es inmutable** (hook `beforeChange` en `mas-notas`); solo admite adendas. El tutor nunca lee notas: se le publican documentos.
- Toda regla de acceso del equipo usa `esPersonal(req)`: una sesión de tutor no cuenta como «con sesión» en `users`, `roles` ni Finanzas.
- Marca blanca: nombre, colores, logotipo y teléfono salen de `lib/site.ts` (variables `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_BRAND_*`). No escribir datos de una clínica en el código.
- Las citas solo se crean y cambian por `lib/clinica/agenda.ts` (candado por recurso en la transacción; transiciones en `TRANSICIONES`); por la API genérica solo se leen. Al finalizar una cita con servicio con precio, el cargo entra a Finanzas por `registrar()` con clave `cita-<id>`.
- Pruebas con base local: `npm run test:clinica` (115 comprobaciones) con la app corriendo contra Postgres local vacío.

## Cambios al modelo de datos

1. Cambia la colección.
2. `npm run migrate:create nombre_del_cambio` contra una base **local** (nunca la de producción).
3. Si la migración crea tablas, agrega al final `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (ver `migrations/20261011_210000_rls_supabase.ts`): Supabase expone `public` por su API y sin RLS quedaría abierta.
4. `npm run generate:types`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
5. Al desplegar, Payload aplica la migración solo. No hay que correr nada contra Supabase.

## Diseño

Marca **Veterinaria Exkalibur** (21-oct-2026): logotipo corazón con gato y perro. Tokens en `app/(payload)/custom.css` (`--mx-*`; los nombres «navy» y «teal» se heredan de MacAuto): primario azul marino `#243a63`, acento azul `#3a9db0`, azul claro del logotipo `#7fc8d6`, dorado `#e8c272`, texto de acento sobre blanco `#22778a`. El portal toma primario y acento de `lib/site.ts` (`NEXT_PUBLIC_BRAND_*` o estos mismos valores). Logotipos en `public/`: `logo-mark.png` (fondo transparente), `logo-mark-white.png` (sobre círculo blanco, para fondos oscuros), `logo-ovm.png` (grande, pantalla de acceso); iconos del celular en `public/finanzas/` (se regeneran con `scripts/iconos-finanzas/generar-iconos.py`). El nombre sale de `NEXT_PUBLIC_SITE_NAME`.

## Convenciones

Contenido visible en español de México; código y commits en inglés, convencionales. Secretos solo en variables de entorno; `NEXT_PUBLIC_*` nunca como «Sensitive» en Vercel.
