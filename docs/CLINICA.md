# Clínica: pacientes, tutores, expediente y portal

> Octubre de 2026. Primera etapa de la plataforma integral sobre la app de Finanzas. Lo que hay, cómo se opera y qué falta. Funcionalidad primero; el diseño se afina al final.

## 1. Qué hace

| Pieza | Para quién | Dónde |
|---|---|---|
| **Pacientes** (clientes-tutores y mascotas): búsqueda, alta manual, ficha del cliente, expediente de la mascota (datos, alergias y alertas de manejo, cartilla, pesos, notas clínicas SOAP, documentos), código de vinculación al portal | Equipo, según su rol | `/admin/clinica` (y las colecciones del grupo «Clínica» en el panel de Payload) |
| **Importación** de clientes y mascotas desde CSV o Excel, con plantilla, mapeo de columnas, vista previa y detección de duplicados | Roles con «Importar» | `/admin/clinica/importar` |
| **Portal del tutor**: cuenta propia, vinculación con código, mis mascotas, cartilla, peso, documentos publicados, aportar antecedentes | Dueños de mascotas | `/portal` |

Es **marca blanca**: nombre, colores, logotipo y teléfono salen de variables de entorno (§6). Ningún dato de la clínica vive en el código.

## 2. Modelo de datos

```
cliente (tutor) ──< mascotas.tutores[] >── mascota ──< mas-pesos
                                                   ├──< mas-cartilla
tutores (cuenta del portal) ──cliente──┘           ├──< mas-notas (SOAP, firmables)
codigos-vinculacion ──cliente                      └──< mas-documentos (archivo en Blob privado)
importaciones (archivo cargado, mapeo, resumen)
```

- **Folios públicos** `CLI-00012`, `MAS-00034`: virtuales, salen del id, nunca cambian. Se buscan escribiendo el folio.
- Una mascota tiene **uno o más tutores** (uno «principal»); un tutor, varias mascotas.
- **Nada se borra**: clientes y mascotas se marcan inactivos o «fallecido»; las notas firmadas no se borran ni se editan.
- Fechas como texto `AAAA-MM-DD`; teléfonos a 10 dígitos (se normalizan al guardar).
- Las tablas nuevas nacen con **RLS activado** (migración `20261020_170838_clinica_pacientes`), igual que las de Finanzas.

## 3. Permisos (Sistema → Roles → «Clínica»)

| Casilla | Permite |
|---|---|
| Ver pacientes | Buscar y abrir clientes, mascotas, cartilla, pesos y documentos |
| Editar pacientes | Alta y corrección de clientes y mascotas; cartilla, pesos, documentos; códigos de vinculación; desvincular cuentas |
| Leer expediente | Ver las notas clínicas |
| Escribir expediente | Crear, editar (borradores), firmar notas; adendas |
| Importar | Cargar archivos |

Roles sugeridos (Finanzas → Configuración → «Crear los sugeridos»): **Dueño** y **Administración** todo; **Médico veterinario** todo menos importar; **Recepción** ve y edita pacientes sin leer el expediente (sí ve alergias y alertas de manejo). El superadministrador puede todo. Las reglas se aplican en el servidor (`collections/clinica/acceso.ts` y `lib/clinica/servicio.ts`), no solo en pantalla.

Quien no «entra al panel completo» ve la clínica sola, con encabezado y barra inferior (como Finanzas), y desde ahí pasa a Finanzas.

## 4. Reglas que conviene saber

- **Duplicados al dar de alta un cliente**: si el teléfono o el correo ya existen, se avisa y se pide confirmar («Crear de todos modos» para una pareja que comparte teléfono).
- **Nota clínica**: nace en borrador (editable y borrable). Al **firmarla** queda congelada con fecha y firmante; solo admite **adendas**, que tampoco se editan ni se borran. Lo revisa un hook en la base, aunque alguien use la API genérica.
- **El tutor nunca ve notas clínicas**. Ve: su ficha, sus mascotas, cartilla, pesos y los documentos **publicados**. Lo que el médico quiera compartir (indicaciones, receta, constancia) se sube como documento y se marca «publicado al tutor».
- **Vinculación**: recepción genera un código de 6 caracteres (72 h, un uso) desde la ficha del cliente; el tutor lo escribe en el portal. Sin código, una cuenta nueva no ve nada. Se puede desvincular desde la ficha.
- **Documentos aportados por el tutor** entran como «pendiente de revisión» y no se publican hasta que el equipo lo decida.
- **Sesiones**: Payload usa la misma cookie para el panel y el portal. En un mismo navegador, entrar al portal cierra la sesión del panel y viceversa (en la práctica son personas distintas).

## 5. Importación de archivo

1. `/admin/clinica/importar` → «Descargar plantilla .xlsx» (hoja «Pacientes» con 3 filas de ejemplo y hoja «Instrucciones»). También sirve un CSV con «,» o «;».
2. **Una fila = una mascota con su tutor.** Varias vacunas de la misma mascota = varias filas con el mismo tutor y mascota, cambiando solo las columnas `cartilla_*`.
3. Al leer el archivo, el sistema **sugiere qué columna es qué** (reconoce encabezados en español: «Dueño», «Teléfono», «Mascota», «Vacuna», «Fecha vacuna»…) y se corrige a mano. Obligatorias: nombre del tutor y nombre de la mascota.
4. «Revisar qué pasaría»: cuántos tutores y mascotas son nuevos o ya existen, cartilla y pesos leídos, **errores** (no se importa hasta corregirlos) y **avisos** (se importa igual).
5. «Importar»: todo en una transacción; queda en el historial.

Interpretación: fechas `AAAA-MM-DD`, `DD/MM/AAAA`, `DD-MM-AA`, serie de Excel y edades («3 años» → fecha estimada); especie por palabra (perro/can/dog, gato/felino…); sexo M/H/Macho/Hembra; esterilizado sí/no; tipo de cartilla por el texto (vacuna, desparasitación interna/externa); teléfonos con +52 y espacios; «Nombre Apellido» en una sola columna se separa.

Duplicados: tutor existente por **teléfono o correo** (o por nombre completo exacto, con aviso); mascota existente por **nombre dentro de ese tutor**. A una mascota existente solo se le agregan registros de cartilla que no tenga (mismo producto y fecha) y pesos de fechas nuevas. Límite: 5 000 filas y 8 MB por archivo.

## 6. Marca blanca y variables

| Variable | Qué es | Si falta |
|---|---|---|
| `NEXT_PUBLIC_SITE_NAME` | Nombre de la clínica (panel, portal, correos) | «Nombre del Negocio» |
| `NEXT_PUBLIC_BRAND_PRIMARY` | Color primario oscuro `#rrggbb` (portal y panel) | Verde pino de la instalación actual |
| `NEXT_PUBLIC_BRAND_ACCENT` | Acento `#rrggbb` | Menta de la instalación actual |
| `NEXT_PUBLIC_BRAND_LOGO` | Logotipo para fondo oscuro (ruta en `public/` o URL) | `/logo-mark-white.png` |
| `NEXT_PUBLIC_BRAND_PHONE` | Teléfono que se muestra en el portal | Nada |
| `CLINICA_BLOB_READ_WRITE_TOKEN` | Almacén **privado** de Vercel Blob para documentos del expediente | Usa `FINANZAS_BLOB_READ_WRITE_TOKEN`; sin ninguno, subir documentos responde 503 y lo demás funciona |
| `RESEND_API_KEY`, `LEADS_FROM_EMAIL` | «Olvidé mi contraseña» del portal (mismo adaptador que el panel) | No se envía el correo |

El panel toma sus colores de `app/(payload)/custom.css`; si se definen las dos variables de marca, el layout las sobreescribe sin tocar el archivo. Para otra clínica: nuevo proyecto en Vercel + Supabase, mismas variables con sus valores, su logotipo en `public/`, y en el primer arranque «Crear primer usuario» → roles y catálogos sugeridos.

## 7. Código

| Qué | Dónde |
|---|---|
| Colecciones | `collections/clinica/{acceso,pacientes,expediente,tutores}.ts` |
| Permisos | `lib/permisosBase.ts` (`clinica`), `lib/permisos.ts` (`esPersonal`, `esTutor`, `esColeccionClinica`) |
| Servicio y API | `lib/clinica/{servicio,importacion,tipos}.ts` → `app/api/clinica/[...ruta]/route.ts` (rutas documentadas arriba del archivo) |
| Panel | `components/admin/clinica/*` (vista `/admin/clinica` registrada en `payload.config.ts`), `app/(payload)/clinica.css` |
| Portal | `app/(portal)/portal/*`, `components/portal/*`, `lib/portal/sesion.ts`, `app/(portal)/portal.css` |
| Migración | `migrations/20261020_170838_clinica_pacientes.ts` |
| Pruebas | `npm run test:clinica` contra `npm run dev` o `npm run start` con una base **local** vacía (80 comprobaciones: permisos por rol, nota firmada, tutor solo ve lo suyo, importación con duplicados) |

## 8. Pendiente (siguientes etapas)

- Verificación de correo al registrarse en el portal (hoy no se exige) y freno de registros por dirección (10/hora, en memoria).
- Foto de la mascota; impresión de cartilla en PDF.
- Citas, hospedaje, tienda, farmacia, laboratorio, mensajes (etapas del plan de desarrollo).
- Diseño final del panel y del portal (hoy reutilizan los estilos de Finanzas).
