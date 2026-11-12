import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_servicios_icono" AS ENUM('auto', 'consulta', 'vacuna', 'desparasitacion', 'cirugia', 'ortopedia', 'rehabilitacion', 'imagen', 'ultrasonido', 'laboratorio', 'dental', 'estetica', 'bano', 'hospital', 'urgencias', 'farmacia', 'nutricion', 'cardio', 'documento', 'patita');
  CREATE TABLE "mas_fotos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"tipo" varchar NOT NULL,
  	"datos" varchar NOT NULL,
  	"bytes" numeric,
  	"subida_por" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "mascotas" ADD COLUMN "foto_fecha" varchar;
  ALTER TABLE "servicios" ADD COLUMN "icono" "enum_servicios_icono" DEFAULT 'auto';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mas_fotos_id" integer;
  ALTER TABLE "mas_fotos" ADD CONSTRAINT "mas_fotos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "mas_fotos_mascota_idx" ON "mas_fotos" USING btree ("mascota_id");
  CREATE INDEX "mas_fotos_updated_at_idx" ON "mas_fotos" USING btree ("updated_at");
  CREATE INDEX "mas_fotos_created_at_idx" ON "mas_fotos" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mas_fotos_fk" FOREIGN KEY ("mas_fotos_id") REFERENCES "public"."mas_fotos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_mas_fotos_id_idx" ON "payload_locked_documents_rels" USING btree ("mas_fotos_id");
  -- Supabase expone el esquema public por su API: sin RLS la tabla quedaría abierta (ver 20261011_210000_rls_supabase).
  ALTER TABLE "mas_fotos" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mas_fotos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "mas_fotos" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mas_fotos_fk";
  
  DROP INDEX "payload_locked_documents_rels_mas_fotos_id_idx";
  ALTER TABLE "mascotas" DROP COLUMN "foto_fecha";
  ALTER TABLE "servicios" DROP COLUMN "icono";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mas_fotos_id";
  DROP TYPE "public"."enum_servicios_icono";`)
}
