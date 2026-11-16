import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "est_fichas" ADD COLUMN "recordatorio_enviado_en" timestamp(3) with time zone;
  ALTER TABLE "estetica_configuracion" ADD COLUMN "recordatorio_activo" boolean DEFAULT true;
  ALTER TABLE "estetica_configuracion" ADD COLUMN "semanas_por_omision" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "est_fichas" DROP COLUMN "recordatorio_enviado_en";
  ALTER TABLE "estetica_configuracion" DROP COLUMN "recordatorio_activo";
  ALTER TABLE "estetica_configuracion" DROP COLUMN "semanas_por_omision";`)
}
