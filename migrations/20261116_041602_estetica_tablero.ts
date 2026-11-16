import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_citas_estetica_fase" AS ENUM('recibida', 'bano', 'secado', 'corte', 'lista');
  CREATE TYPE "public"."enum_est_fichas_que_se_hizo" AS ENUM('bano', 'secado', 'cepillado', 'corte', 'deslanado', 'unas', 'oidos', 'glandulas', 'dientes');
  CREATE TYPE "public"."enum_est_fichas_hallazgos" AS ENUM('pulgas', 'garrapatas', 'heridas', 'nudos', 'piel', 'oidos', 'unas', 'bultos', 'otro');
  CREATE TYPE "public"."enum_est_fichas_comportamiento" AS ENUM('tranquila', 'nerviosa', 'bozal', 'agresiva');
  CREATE TYPE "public"."enum_est_fotos_momento" AS ENUM('antes', 'despues');
  CREATE TABLE "est_fichas_que_se_hizo" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_est_fichas_que_se_hizo",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "est_fichas_hallazgos" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_est_fichas_hallazgos",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "est_fichas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"cita_id" integer NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"dia" varchar NOT NULL,
  	"corte" varchar,
  	"productos" varchar,
  	"comportamiento" "enum_est_fichas_comportamiento",
  	"hallazgos_nota" varchar,
  	"nota_tutor" varchar,
  	"nota_interna" varchar,
  	"proxima_semanas" numeric,
  	"hallazgos_avisados_en" timestamp(3) with time zone,
  	"realizado_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "est_fotos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"cita_id" integer NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"momento" "enum_est_fotos_momento" NOT NULL,
  	"tipo" varchar NOT NULL,
  	"datos" varchar NOT NULL,
  	"bytes" numeric,
  	"subida_por" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "roles" ADD COLUMN "clinica_estetica" boolean DEFAULT false;
  ALTER TABLE "citas" ADD COLUMN "estetica_fase" "enum_citas_estetica_fase";
  ALTER TABLE "citas" ADD COLUMN "estetica_fase_en" timestamp(3) with time zone;
  ALTER TABLE "citas" ADD COLUMN "estetica_aviso_lista_en" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "est_fichas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "est_fotos_id" integer;
  ALTER TABLE "est_fichas_que_se_hizo" ADD CONSTRAINT "est_fichas_que_se_hizo_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."est_fichas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "est_fichas_hallazgos" ADD CONSTRAINT "est_fichas_hallazgos_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."est_fichas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "est_fichas" ADD CONSTRAINT "est_fichas_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "est_fichas" ADD CONSTRAINT "est_fichas_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "est_fichas" ADD CONSTRAINT "est_fichas_realizado_por_id_users_id_fk" FOREIGN KEY ("realizado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "est_fotos" ADD CONSTRAINT "est_fotos_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "est_fotos" ADD CONSTRAINT "est_fotos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "est_fichas_que_se_hizo_order_idx" ON "est_fichas_que_se_hizo" USING btree ("order");
  CREATE INDEX "est_fichas_que_se_hizo_parent_idx" ON "est_fichas_que_se_hizo" USING btree ("parent_id");
  CREATE INDEX "est_fichas_hallazgos_order_idx" ON "est_fichas_hallazgos" USING btree ("order");
  CREATE INDEX "est_fichas_hallazgos_parent_idx" ON "est_fichas_hallazgos" USING btree ("parent_id");
  CREATE UNIQUE INDEX "est_fichas_cita_idx" ON "est_fichas" USING btree ("cita_id");
  CREATE INDEX "est_fichas_mascota_idx" ON "est_fichas" USING btree ("mascota_id");
  CREATE INDEX "est_fichas_dia_idx" ON "est_fichas" USING btree ("dia");
  CREATE INDEX "est_fichas_realizado_por_idx" ON "est_fichas" USING btree ("realizado_por_id");
  CREATE INDEX "est_fichas_updated_at_idx" ON "est_fichas" USING btree ("updated_at");
  CREATE INDEX "est_fichas_created_at_idx" ON "est_fichas" USING btree ("created_at");
  CREATE INDEX "est_fotos_cita_idx" ON "est_fotos" USING btree ("cita_id");
  CREATE INDEX "est_fotos_mascota_idx" ON "est_fotos" USING btree ("mascota_id");
  CREATE INDEX "est_fotos_updated_at_idx" ON "est_fotos" USING btree ("updated_at");
  CREATE INDEX "est_fotos_created_at_idx" ON "est_fotos" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_est_fichas_fk" FOREIGN KEY ("est_fichas_id") REFERENCES "public"."est_fichas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_est_fotos_fk" FOREIGN KEY ("est_fotos_id") REFERENCES "public"."est_fotos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_est_fichas_id_idx" ON "payload_locked_documents_rels" USING btree ("est_fichas_id");
  CREATE INDEX "payload_locked_documents_rels_est_fotos_id_idx" ON "payload_locked_documents_rels" USING btree ("est_fotos_id");
  ALTER TABLE "est_fichas_que_se_hizo" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "est_fichas_hallazgos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "est_fichas" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "est_fotos" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "est_fichas_que_se_hizo" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "est_fichas_hallazgos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "est_fichas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "est_fotos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "est_fichas_que_se_hizo" CASCADE;
  DROP TABLE "est_fichas_hallazgos" CASCADE;
  DROP TABLE "est_fichas" CASCADE;
  DROP TABLE "est_fotos" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_est_fichas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_est_fotos_fk";
  
  DROP INDEX "payload_locked_documents_rels_est_fichas_id_idx";
  DROP INDEX "payload_locked_documents_rels_est_fotos_id_idx";
  ALTER TABLE "roles" DROP COLUMN "clinica_estetica";
  ALTER TABLE "citas" DROP COLUMN "estetica_fase";
  ALTER TABLE "citas" DROP COLUMN "estetica_fase_en";
  ALTER TABLE "citas" DROP COLUMN "estetica_aviso_lista_en";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "est_fichas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "est_fotos_id";
  DROP TYPE "public"."enum_citas_estetica_fase";
  DROP TYPE "public"."enum_est_fichas_que_se_hizo";
  DROP TYPE "public"."enum_est_fichas_hallazgos";
  DROP TYPE "public"."enum_est_fichas_comportamiento";
  DROP TYPE "public"."enum_est_fotos_momento";`)
}
