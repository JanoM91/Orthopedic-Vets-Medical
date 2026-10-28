# Orthopedic Vet's — plataforma de clínica veterinaria (marca blanca)

Plataforma de **Orthopedic Vet's Medical** (clínica veterinaria de ortopedia, Xalapa), pensada para replicarse a otras clínicas por configuración. Hoy tiene tres módulos:

- **Finanzas** (octubre de 2026): réplica de **MacAuto Finanzas** (repo `Exkalibur-labs/macauto-xalapa`, docs/60–62) sin sitio público ni autos: cada entrada o gasto se asigna a un **área** (`fin-actividades`), a «general» o queda pendiente.
- **Clínica** (20/21-oct-2026): clientes-tutores, mascotas, cartilla, pesos, notas clínicas firmables, documentos, importación desde CSV/Excel, **agenda y citas** (con cargo automático en Finanzas), **portal del tutor** (`/portal`, incluye pedir citas), **sitio público** en la raíz (`app/(sitio)`, contenido en el global `sitio-configuracion`) y (27-oct) **correos de citas**, **recordatorio de la víspera** por cron, **WhatsApp con mensaje prellenado**, **cartilla imprimible** y manuales (`docs/ARRANQUE.md`, `docs/MANUAL-EQUIPO.md`, `docs/MANUAL-TUTOR.md`). Todo en `docs/CLINICA.md`.
- **Farmacia** (fases 1 a 4 de 7, 25–27-oct-2026): catálogo con grupo NOM-064, presentaciones por unidad base, inventario por lote con caducidad, kardex inmutable, importación con plantilla propia, roles de farmacia, **módulos activables** por instalación (Clínica, Farmacia, Tienda), **compras desde XML CFDI** o a mano con recepción por lote, gasto en Finanzas y anulación, **conteo físico**, **venta de mostrador** (FEFO, pagos mixtos, autorización del encargado, validación por mascota), **recetas** internas y externas, libro de control del Grupo I, cierre del día, **alertas** (una abierta por objeto y tipo), **punto de reorden que aprende**, **reabasto** por proveedor y **promociones por caducidad**, con **cron diario** 08:00 (`vercel.json`, `CRON_SECRET`). Plan completo en `docs/FARMACIA-PROMPT.md` (una fase por sesión); lo construido en `docs/FARMACIA.md`.

Proyecto de Exkalibur Consulting. Operación: `docs/OPERACION.md`. Arranque de una clínica nueva: `docs/ARRANQUE.md`.

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

- Colecciones `clientes`, `mascotas`, `mas-*`, `tutores`, `codigos-vinculacion`, `importaciones`, `recursos`, `servicios`, `citas` (y los globales `agenda-configuracion` y `sitio-configuracion`) tienen reglas propias en `collections/clinica/acceso.ts` y **no** se envuelven con `protegerColeccion` (ya lo sabe `lib/permisos.ts`). Distinguen tres sesiones: equipo (`users`), tutor (`tutores`) y visitante.
- La lógica va en `lib/clinica/servicio.ts`, `importacion.ts` y `agenda.ts`, expuesta en `app/api/clinica/[...ruta]/route.ts`. El equipo escribe con `overrideAccess: true` después de revisar `ctx.p.clinica.*`; el **portal siempre consulta con `overrideAccess: false` y el usuario tutor**, para que las reglas de acceso decidan qué ve.
- Una **nota clínica firmada es inmutable** (hook `beforeChange` en `mas-notas`); solo admite adendas. El tutor nunca lee notas: se le publican documentos.
- Una regla de acceso nunca debe tener efectos (contar, fallar): Payload las evalúa también al calcular permisos de cualquier visitante en cada página. Los frenos van en hooks de la operación (ej. registro de `tutores` en `beforeValidate`).
- Toda regla de acceso del equipo usa `esPersonal(req)`: una sesión de tutor no cuenta como «con sesión» en `users`, `roles` ni Finanzas.
- Marca blanca: nombre, colores, logotipo y teléfono salen de `lib/site.ts` (variables `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_BRAND_*`). No escribir datos de una clínica en el código.
- Las citas solo se crean y cambian por `lib/clinica/agenda.ts` (candado por recurso en la transacción; transiciones en `TRANSICIONES`); por la API genérica solo se leen. Al finalizar una cita con servicio con precio, el cargo entra a Finanzas por `registrar()` con clave `cita-<id>`.
- **Avisos** (`lib/clinica/avisos.ts`): todo aviso de cita es best-effort y nunca hace fallar la operación. Los crons (`app/api/*/cron/*`) se autorizan con `revisarCron()` de `lib/cron.ts` (`Bearer $CRON_SECRET`; sin variable, 503). Enlaces de WhatsApp solo con `lib/whatsapp.ts`.
- Pruebas con base local: `npm run test:clinica` (149 comprobaciones; el recordatorio usa `CRON_SECRET` de `.env`) con la app corriendo contra Postgres local vacío.

## Reglas de la Farmacia (docs/FARMACIA.md y docs/FARMACIA-PROMPT.md)

- Colecciones `far-*` y globales `farmacia-configuracion` e `instalacion-configuracion` tienen reglas propias (`collections/farmacia/acceso.ts`) y **no** se envuelven con `protegerColeccion`. Solo el equipo entra; la tienda (fase 5) tendrá su propia API pública.
- La lógica va en `lib/farmacia/servicio.ts`, `importacion.ts`, `compras.ts`, `ventas.ts`, `recetas.ts` y `alertas.ts`, expuesta en `app/api/farmacia/[...ruta]/route.ts`. **El kardex (`far-movimientos`) es inmutable** y solo lo escribe `registrarMovimiento()` dentro de una transacción con candado por lote; la API genérica responde 403 a crear, editar y borrar, incluso al superadmin. `far-lotes.existencia` = suma del kardex, recalculada en la misma transacción; nunca se edita a mano.
- **Costos:** quien no tiene «Ver costos» no recibe costos en ninguna respuesta (acceso de campo en `costoUnidad` + el servicio los omite). No mandes `null`: omite la propiedad.
- **Módulos activables** (`lib/modulos.ts`): un módulo apagado responde «no» en sus reglas de acceso (se esconde del panel), 404 en su API y aviso en su vista. Toda regla de acceso de la clínica va envuelta con `conModuloColeccion('clinica', …)` en `payload.config.ts`; las de farmacia llaman a `moduloActivo(req, 'farmacia')`. Finanzas siempre activo; `tutores` no se apaga con la clínica.
- Inventario en **unidad base** (tableta, ml, g, pieza); cada presentación lleva un factor. Grupo I y II exigen registro SENASICA; alimento, accesorio e higiene no pueden ser I ni II (`validarProducto`). Lotes vencidos entran bloqueados y no se desbloquean.
- **Compras** (`far-compras`): solo se escriben por `lib/farmacia/compras.ts` (API genérica: leer con «Recibir compras»; crear/editar/borrar 403). UUID único; lote y caducidad siempre a mano; en compras del XML los importes son los de la factura y no se editan. Al recibir, el gasto entra a Finanzas por `registrar()` con clave `compra-<id>`; anular solo si ningún lote tuvo salidas (movimientos inversos `devolucion` + `anular()` en Finanzas).
- **Ventas y recetas** (`far-ventas`, `far-recetas`, `far-libro-control`, `far-cierres-dia`): solo se escriben por `lib/farmacia/ventas.ts` y `recetas.ts` (API genérica 403 a crear/editar/borrar). Una venta: clave de reintento única, FEFO con candado por lote, pagos que suman exacto el total, Finanzas con claves `venta-<id>` y `venta-<id>-pago-<n>`. Grupo II exige receta válida; Grupo I además folio cuantificado, original recibido y asiento en el libro (inmutable; se cancela con otro asiento). Receta interna firmada = inmutable (hook). Nunca calcular ni sugerir dosis.
- **Alertas y promociones** (`far-alertas`, `far-promociones`): solo las escribe `lib/farmacia/alertas.ts` (API genérica 403). `claveAbierta` única garantiza una abierta por objeto y tipo; se cierran solas cuando ya no aplican. El punto de reorden se propone, nunca se aplica solo. Promociones solo para Grupo III y desregulados. El cron (`app/api/farmacia/cron/diario`) exige `Bearer $CRON_SECRET` y manda un solo resumen al día.
- Pruebas con base local: `npm run test:farmacia` (299 comprobaciones; la fase 4 siembra ventas pasadas directo en la base LOCAL y usa `CRON_SECRET` de `.env`) contra `npm run start` con Postgres vacío. Orden sugerido: `test:clinica` → `test:farmacia` (los dos reutilizan el primer usuario y los roles).
- Los 50 productos de `lib/farmacia/ejemplos.ts` son inventados para la plantilla; nunca los uses como catálogo real.

## Cambios al modelo de datos

1. Cambia la colección.
2. `npm run migrate:create nombre_del_cambio` contra una base **local** (nunca la de producción).
3. Si la migración crea tablas, agrega al final `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (ver `migrations/20261011_210000_rls_supabase.ts`): Supabase expone `public` por su API y sin RLS quedaría abierta.
4. `npm run generate:types`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
5. Al desplegar, Payload aplica la migración solo. No hay que correr nada contra Supabase.

## Diseño

**Tema «Clínico» (26-oct-2026, decisión de Jano para las pruebas):** `app/(payload)/tema-clinico.css` se importa al final del layout del panel y retematiza todo (blanco frío `#f8fafc`, pizarra `#0f172a`, un solo acento (hoy el verde OVM `#0b6b59`; era cobalto `#1d4ed8`), IBM Plex Sans, radios 8–12, estados por punto de color, cifras en rejilla, subnav como píldoras, panel lateral de detalle en Farmacia → Productos). Es la opción C del lienzo «Panel Farmacia: 3 opciones de diseño». La paleta oficial vive en la sección 1-A de ese archivo, no en `custom.css`. Quitar el import devuelve el tema anterior. Pendiente: riel de iconos de 72 px en el menú de Payload (hoy el menú se retematiza en blanco).

Marca **OVM Centro Veterinario** (27-oct-2026, decisión de Jano; dominio `ovetsmedical.com`): logotipo de rodilla en círculo con cruz y siluetas de perro y gato, menta `#36dab7` y trazos negros. La menta no se lee sobre blanco (1.8:1), así que el **primario oscuro** es `#0f2f2a` (cabeceras del portal y sitio, iconos, barra del teléfono) y el **acento de uso** es `#0b6b59` (botones, enlaces, activo; 6.4:1); la menta queda para detalles y fondos oscuros. El portal y el sitio toman primario y acento de `lib/site.ts` (`NEXT_PUBLIC_BRAND_PRIMARY` / `_ACCENT`, o esos mismos valores); los correos y las páginas imprimibles usan `site.brand.accent` para sus botones. Logotipos en `public/` (se regeneran desde los JPG originales con `scripts/marca/procesar-logos.py`): `logo-mark.png` (isotipo, fondos claros), `logo-mark-white.png` (trazos en blanco, fondos oscuros), `logo-ovm.png` (completo con el nombre, pantalla de acceso); iconos del celular en `public/finanzas/` (`scripts/iconos-finanzas/generar-iconos.py`, fondo `#0f2f2a`, texto menta). **Peluqueadogs** es la submarca de la estética veterinaria dentro de la misma plataforma (OVM es la marca padre): `public/marcas/peluqueadogs.png`, para cuando exista el módulo de estética. Los tokens de `custom.css` (`--mx-*`, marca anterior «Veterinaria Exkalibur», azul marino `#243a63`) quedan como base y el tema clínico los reemplaza. El nombre sale de `NEXT_PUBLIC_SITE_NAME`.

**Reglas de front (revisión del 27-oct-2026; se probó de 320 a 1440 px):**
- Poco texto: título + una línea como máximo. Lo que explica «cómo funciona» va plegado en `<Ayuda>` (`components/admin/finanzas/comun.tsx`, reexportado en clínica y farmacia).
- Barras de pestañas que no caben: `components/Carriles.tsx` (montado en las tres apps del panel y en el portal) marca `data-izq`/`data-der` para el desvanecido y centra la pestaña activa. Si una barra pasa de ~8 opciones, las poco usadas van en `<MenuMas>` (`components/admin/MenuMas.tsx`), como en Farmacia.
- Campos de 16 px en el teléfono (iOS acerca la pantalla con menos); `tema-clinico.css` §4 lo fuerza también en los formularios de Payload. Botones de al menos 40–44 px de alto.
- Fechas, horas y archivos con estilo propio (Safari y Firefox los dibujan distinto). `100vh` siempre con respaldo `100dvh`; `:has()` solo para adornos.
- Auditoría automática: `scripts/auditoria-front.mjs` (desbordes, campos chicos, botones chicos, errores de consola) contra `npm run start` con datos de prueba.

## Convenciones

Contenido visible en español de México; código y commits en inglés, convencionales. Secretos solo en variables de entorno; `NEXT_PUBLIC_*` nunca como «Sensitive» en Vercel.
