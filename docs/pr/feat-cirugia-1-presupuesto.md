# Ruta ortopédica · fase 1: presupuesto de cirugía y consentimiento firmado

## Qué cambia

- **Expediente → pestaña «Cirugía»** (la ven quienes tienen «Ver expediente» o «Agenda»). El médico («Escribir expediente») arma un presupuesto con:
  - procedimiento y médico a cargo;
  - qué se va a hacer, para que lo lea el tutor;
  - riesgos de este caso, que entran al consentimiento;
  - indicaciones previas;
  - conceptos, tomados del catálogo o libres (el servidor calcula importes y total);
  - anticipo.

  Se guarda en borrador y solo así se edita.
- **Enviar al tutor:**
  - el presupuesto vence en N días;
  - se genera la liga `/presupuesto/<id>/<token>`, que funciona sin cuenta;
  - se manda un correo, si el tutor acepta avisos;
  - queda el botón «Mandar liga» por WhatsApp.

  «Regresar a borrador» invalida la liga.
- **El tutor abre la liga:**
  - ve el detalle, las indicaciones y el consentimiento con sus datos;
  - escribe su nombre, firma con el dedo y marca que acepta, o lo rechaza con un motivo;
  - la clínica recibe un correo en los dos casos;
  - también le aparece en «Pendientes» de su app, con el botón «Revisar y firmar».
- **«Firmar aquí»:** el tutor firma en una tableta en la clínica. Lo puede recoger quien tenga «Agenda» o «Escribir expediente», y queda registrado quién lo recibió.
- **Consentimiento inmutable.** Guarda:
  - el texto exacto;
  - el resumen del presupuesto;
  - la firma (PNG);
  - la vía (liga o clínica), la fecha, la IP y el navegador;
  - una huella SHA-256 de todo lo anterior.

  Hay una versión imprimible con la firma y la huella.
- **Texto base editable:** está en Clínica → «Cirugía: presupuestos y consentimiento», con campos `{{tutor}}`, `{{mascota}}`, `{{procedimiento}}`, `{{riesgos}}`, etc. El texto que viene es un borrador genérico.
- **Agendar cirugía:** se hace desde el presupuesto aceptado. La cita guarda el presupuesto, no se liga a paquetes y admite una sola cirugía vigente por presupuesto. **Al finalizarla se cobra el total del presupuesto** en Finanzas.
- **Código:**
  - `lib/clinica/cirugia.ts` (candado por presupuesto) y `collections/clinica/cirugia.ts`;
  - `components/admin/clinica/Cirugia.tsx` y `components/FirmaLienzo.tsx`;
  - la página `app/(sitio)/presupuesto/[id]/[token]` y la API `app/api/presupuesto/[id]/[token]`;
  - las pruebas en `scripts/probarCirugia.mjs` (`npm run test:cirugia`).

## Por qué

Decisión de Jano (21-nov-2026): seguir con la ruta ortopédica, que es lo que distingue a OVM frente a otros sistemas. Va en 4 fases y se empieza por el presupuesto y el consentimiento. La firma se hace con el dedo en el celular del tutor o en una tableta de la clínica. La clínica opera y hospitaliza en sus instalaciones.

## Cómo probarlo (vista previa de Vercel)

1. Abre el expediente de una mascota → Cirugía → «+ Nuevo presupuesto». Llena el procedimiento, dos conceptos y el anticipo, y guarda.
2. Toca «Enviar al tutor» y luego «Mandar liga». Abre la liga en un celular, firma con el dedo y acepta. En el panel debe decir «Aceptado y firmado».
3. Toca «Imprimir»: sale el presupuesto con el consentimiento, la firma y la huella.
4. Toca «Agendar cirugía», agéndala y llévala hasta «Finalizar». En Finanzas debe quedar el total del presupuesto.
5. Arma otro presupuesto y usa «Firmar aquí» como si fuera la tableta de la clínica.

## Base de datos y variables

- La migración `20261121_235641_cirugia_presupuesto` agrega las tablas `cir_presupuestos`, `cir_consentimientos` y `cirugia_configuracion`, con RLS, y la columna `citas.presupuesto`.
- No hay variables nuevas.
- **Va encima de `feat/paquetes`**. Orden de mezcla: #35 (contraseña) → paquetes → este PR.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío con `npm run start`:
  - `test:clinica` 214/214;
  - `test:estetica` 90/90;
  - `test:farmacia` 510/510;
  - `test:paquetes` 57/57;
  - `test:cirugia` 44/44: permisos, cálculo del total, envío y liga, firma inválida o sin aceptar, firma y huella, inmutabilidad, cambio del texto base sin tocar lo firmado, constancia imprimible, cirugía en la agenda con cobro del total, rechazo, regreso a borrador con liga invalidada, firma en la clínica, cancelación y «Pendientes» del tutor.
- Playwright a 390 px: firmé con el mouse en la liga del tutor y quedó «Firmado». También revisé la pestaña Cirugía (1280 y 390 px), el editor, «Firmar aquí» y «Nueva cita» con el presupuesto. Sin errores de JavaScript ni desbordes.

## Riesgos y pendientes

- **El texto del consentimiento es un borrador genérico.** Antes de usarlo con clientes, debe revisarlo la clínica con su asesor legal. La firma dibujada es una firma electrónica simple; la huella y los datos de la firma ayudan como evidencia, pero no la sustituyen una firma electrónica avanzada.
- Para que la cirugía ocupe el quirófano en la agenda, hay que encender el recurso «Quirófano» en Clínica → Recursos.
- El anticipo se muestra, pero todavía no se cobra en línea; eso entra en «Cobro de cirugías».
- Siguientes fases: cirugía y anestesia, hospitalización y rehabilitación. En ninguna la plataforma calculará ni sugerirá dosis.

## Documentación actualizada

- `CLAUDE.md`: reglas de la cirugía.
- `docs/CLINICA.md`: sección de la fase 1.
- `docs/MANUAL-EQUIPO.md` y `docs/MANUAL-TUTOR.md`.
- Este archivo.
