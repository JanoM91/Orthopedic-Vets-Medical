import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Clínica (27-oct-2026): recordatorio de citas (marca por cita), correos de avisos de la clínica y su interruptor. Solo columnas nuevas: no crea tablas, RLS sin cambios. */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "citas" ADD COLUMN "recordatorio_enviado_en" timestamp(3) with time zone;
  ALTER TABLE "agenda_configuracion" ADD COLUMN "correo_avisos" varchar;
  ALTER TABLE "agenda_configuracion" ADD COLUMN "recordatorios_activos" boolean DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "citas" DROP COLUMN "recordatorio_enviado_en";
  ALTER TABLE "agenda_configuracion" DROP COLUMN "correo_avisos";
  ALTER TABLE "agenda_configuracion" DROP COLUMN "recordatorios_activos";`)
}
