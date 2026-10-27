# Arranque: dejar la clínica funcionando en un día

> 27-oct-2026 · Reconstruido después de perderse la versión del 22-oct. Sirve para Orthopedic Vet's Medical y para cualquier clínica nueva (marca blanca: una instalación por clínica).
>
> Quién lo hace: el superadministrador (la primera cuenta que se crea). Tiempo: medio día de configuración y medio día de carga de datos y prueba con el equipo.

## 0. Antes de empezar (Vercel)

En Vercel → proyecto → **Settings → Environment Variables** (Production). Las marcadas «Sensitive» no se vuelven a ver después de guardarlas.

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `DATABASE_URL` | Base de datos (Supabase, rol `payload_app`, pooler) | Sí |
| `PAYLOAD_SECRET` | Firma las sesiones. Una distinta por instalación | Sí |
| `NEXT_PUBLIC_SITE_URL` | Dirección pública, p. ej. `https://clinica.mx` | Sí |
| `NEXT_PUBLIC_SITE_NAME` | Nombre de la clínica (panel, portal, correos) | Sí |
| `NEXT_PUBLIC_LOCATION_CITY`, `NEXT_PUBLIC_LOCATION_TIMEZONE` | Ciudad y zona (`America/Mexico_City`) | Sí |
| `NEXT_PUBLIC_BRAND_PHONE` | Teléfono de respaldo (10 dígitos). Manda lo capturado en «Sitio público → Contacto»; esta variable solo se usa si ahí está vacío | Opcional |
| `NEXT_PUBLIC_BRAND_PRIMARY`, `_ACCENT`, `_LOGO` | Colores y logotipo del portal | Opcional |
| `FINANZAS_BLOB_READ_WRITE_TOKEN` | Comprobantes, documentos y fotos de recetas (almacén privado) | Sí |
| `CRON_SECRET` (Sensitive) | Tareas diarias: resumen de alertas de farmacia (08:00) y recordatorio de citas (18:00). Valor largo al azar: `openssl rand -hex 32` | Sí, si se quieren avisos |
| `RESEND_API_KEY` (Sensitive), `LEADS_FROM_EMAIL` | Correos (citas, recordatorios, tickets, alertas, contraseña olvidada). Sin ellas no sale ningún correo y nada falla | Recomendada |
| `ANTHROPIC_API_KEY` | Nota de voz en Finanzas | Opcional |

Después de cambiar variables: **Deployments → … → Redeploy** de la última de producción. En **Settings → Cron Jobs** deben aparecer `/api/farmacia/cron/diario` (diario 14:00 UTC) y `/api/clinica/cron/recordatorios` (diario 00:00 UTC).

## 1. Primera cuenta y módulos

1. Abre `/admin` y crea la primera cuenta: nace **superadministradora**.
2. **Sistema → Instalación: módulos**: enciende los módulos que use la clínica (Clínica, Farmacia; Tienda llega después). Finanzas siempre está encendido.

## 2. Finanzas → Configuración (en este orden)

1. **Categorías y áreas → «Crear las sugeridas»**. Crea áreas (Consulta, Cirugía, Rehabilitación, Farmacia, Administración) y categorías; se editan después.
2. **Roles → «Crear los sugeridos»**: Dueño, Administración, Médico veterinario, Recepción y, si Farmacia está encendida, Encargado de farmacia, Vendedor de mostrador y Repartidor.
3. **Cuentas y cajas**: una por cada lugar donde vive el dinero (banco, caja de recepción, caja de farmacia), con su saldo a la fecha de corte.
4. **Fecha de corte**: desde cuándo cuenta Finanzas. Nada anterior se puede registrar.

## 3. Personas

**Sistema → Usuarios → Crear**: nombre, correo, contraseña temporal y **Rol de acceso**. A los médicos, su **cédula profesional** (la piden las recetas). Cada quien cambia su contraseña al entrar.

## 4. Clínica

1. **Clínica → Agenda → «Crear recursos y servicios sugeridos»** (consultorios, quirófano, servicios). Ajusta en el panel: duración y precio de cada servicio (con precio, al finalizar la cita se crea el cargo en Finanzas), área de Finanzas y si se pide en línea.
2. **Clínica → «Agenda: horario y reglas»** (menú lateral del panel):
   - Horario por día, intervalo, anticipación mínima, días adelante y horas para cancelar desde el portal.
   - **Correos de la clínica para avisos**: quién recibe el aviso cuando un tutor pide, cambia o cancela desde el portal.
   - **Recordatorio la víspera** (encendido por omisión): correo a las 18:00 al tutor con cita al día siguiente.
3. **Pacientes**: importa con la plantilla (Clínica → Importar) o da de alta cliente por cliente. El teléfono va a 10 dígitos (sirve para WhatsApp).
4. **Sitio público**: Clínica → «Sitio público» (menú lateral): textos, **contacto** (teléfono, WhatsApp y urgencias: los usan también el portal, los correos de citas y la cartilla impresa) y «Sitio publicado».

## 5. Farmacia (si está encendida)

1. **Farmacia → Inicio → «Crear almacén Farmacia»** y **«Crear los roles sugeridos»**.
2. **Farmacia → Configuración**:
   - Área y categorías de Finanzas (ventas y compras).
   - **Métodos de pago**: cada uno con su cuenta de Finanzas (el efectivo es la caja del cierre del día; la transferencia queda «por confirmar»).
   - Días de aviso de caducidad, escalones de promociones, correos extra del resumen diario.
3. **Proveedores** (con días de entrega) en Configuración.
4. **Catálogo**: Farmacia → Importar catálogo → descarga la plantilla, llénala y súbela. Los 50 productos de ejemplo de la plantilla son inventados: bórralos de la hoja antes de cargar.
5. **Inventario inicial**: con la primera compra (XML de la factura) o con ajustes positivos por lote y caducidad.

## 6. Prueba con el equipo (30 minutos)

1. Recepción agenda una cita para mañana; confirma que el tutor de prueba recibe el correo (si hay llave de Resend).
2. El médico abre el expediente, escribe una nota, la firma y emite una receta.
3. Farmacia vende un producto escaneando el código, con pago mixto, e imprime el ticket.
4. Finanzas muestra la entrada de la venta y el cargo de la cita.
5. Farmacia → Alertas → «Recalcular ahora».
6. Antes de operar en serio: borra o anula lo que fue de prueba.

## 7. Portal del tutor

En la ficha del cliente → **«Generar código»** y entrégaselo al tutor (WhatsApp o impreso) junto con `docs/MANUAL-TUTOR.md`. El tutor crea su cuenta en `/portal`, escribe el código y ve a sus mascotas.

## Si algo no funciona

| Síntoma | Revisa |
|---|---|
| No llegan correos | `RESEND_API_KEY` y `LEADS_FROM_EMAIL`; el dominio verificado en Resend; el tutor acepta avisos por correo en su ficha |
| No llega el recordatorio ni el resumen | `CRON_SECRET` en Vercel y los Cron Jobs registrados; los recordatorios encendidos en la agenda |
| El mostrador no cobra | Cada método de pago con cuenta de Finanzas (Farmacia → Configuración) |
| No aparece el botón de WhatsApp | El teléfono debe tener 10 dígitos; el de la clínica sale de «Sitio público → Contacto» (o, si está vacío, de `NEXT_PUBLIC_BRAND_PHONE`) |
| Un médico no puede firmar recetas | Su cédula profesional en Sistema → Usuarios |
