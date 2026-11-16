import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_solicitudes_estado" AS ENUM('nueva', 'contactada', 'agendada', 'descartada');
  CREATE TYPE "public"."enum_solicitudes_especie" AS ENUM('perro', 'gato', 'otra');
  CREATE TYPE "public"."enum_solicitudes_turno" AS ENUM('manana', 'tarde', 'cualquiera');
  CREATE TABLE "solicitudes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"estado" "enum_solicitudes_estado" DEFAULT 'nueva' NOT NULL,
  	"nombre" varchar NOT NULL,
  	"whatsapp" varchar NOT NULL,
  	"correo" varchar,
  	"mascota" varchar NOT NULL,
  	"especie" "enum_solicitudes_especie" NOT NULL,
  	"servicio_id" integer,
  	"servicio_nombre" varchar,
  	"dia_preferido" varchar,
  	"turno" "enum_solicitudes_turno",
  	"nota" varchar,
  	"origen" varchar,
  	"nota_interna" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "solicitudes_id" integer;
  ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "solicitudes_estado_idx" ON "solicitudes" USING btree ("estado");
  CREATE INDEX "solicitudes_servicio_idx" ON "solicitudes" USING btree ("servicio_id");
  CREATE INDEX "solicitudes_updated_at_idx" ON "solicitudes" USING btree ("updated_at");
  CREATE INDEX "solicitudes_created_at_idx" ON "solicitudes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_solicitudes_fk" FOREIGN KEY ("solicitudes_id") REFERENCES "public"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_solicitudes_id_idx" ON "payload_locked_documents_rels" USING btree ("solicitudes_id");
  ALTER TABLE "solicitudes" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "solicitudes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "solicitudes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_solicitudes_fk";
  
  DROP INDEX "payload_locked_documents_rels_solicitudes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "solicitudes_id";
  DROP TYPE "public"."enum_solicitudes_estado";
  DROP TYPE "public"."enum_solicitudes_especie";
  DROP TYPE "public"."enum_solicitudes_turno";`)
}
