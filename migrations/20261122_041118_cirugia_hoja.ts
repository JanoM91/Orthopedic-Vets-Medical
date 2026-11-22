import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cir_hojas_farmacos_momento" AS ENUM('premedicacion', 'induccion', 'mantenimiento', 'analgesia', 'antibiotico', 'fluidos', 'otro');
  CREATE TYPE "public"."enum_cir_hojas_estado" AS ENUM('abierta', 'cerrada');
  CREATE TYPE "public"."enum_cir_hojas_asa" AS ENUM('I', 'II', 'III', 'IV', 'V');
  CREATE TABLE "cir_hojas_farmacos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"momento" "enum_cir_hojas_farmacos_momento" NOT NULL,
  	"medicamento" varchar NOT NULL,
  	"dosis" varchar NOT NULL,
  	"via" varchar,
  	"hora" varchar NOT NULL,
  	"por" varchar
  );
  
  CREATE TABLE "cir_hojas_signos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"hora" varchar NOT NULL,
  	"fc" numeric,
  	"fr" numeric,
  	"spo2" numeric,
  	"etco2" numeric,
  	"temp" numeric,
  	"pas" numeric,
  	"pad" numeric,
  	"pam" numeric,
  	"notas" varchar,
  	"por" varchar
  );
  
  CREATE TABLE "cir_hojas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"cita_id" integer,
  	"mascota_id" integer NOT NULL,
  	"presupuesto_id" integer,
  	"procedimiento" varchar NOT NULL,
  	"fecha" varchar NOT NULL,
  	"estado" "enum_cir_hojas_estado" DEFAULT 'abierta' NOT NULL,
  	"cirujano_id" integer,
  	"anestesista_id" integer,
  	"ayudantes" varchar,
  	"asa" "enum_cir_hojas_asa",
  	"urgencia" boolean DEFAULT false,
  	"peso_kg" numeric,
  	"ayuno_horas" numeric,
  	"valoracion" varchar,
  	"tiempos_entrada" varchar,
  	"tiempos_inicio_anestesia" varchar,
  	"tiempos_inicio_cirugia" varchar,
  	"tiempos_fin_cirugia" varchar,
  	"tiempos_extubacion" varchar,
  	"tiempos_salida" varchar,
  	"realizado" varchar,
  	"hallazgos" varchar,
  	"implantes" varchar,
  	"complicaciones" varchar,
  	"recuperacion" varchar,
  	"indicaciones_post" varchar,
  	"creado_por_id" integer,
  	"cerrada_por_id" integer,
  	"cerrada_en" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cir_hojas_id" integer;
  ALTER TABLE "cir_hojas_farmacos" ADD CONSTRAINT "cir_hojas_farmacos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cir_hojas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cir_hojas_signos" ADD CONSTRAINT "cir_hojas_signos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cir_hojas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cir_hojas" ADD CONSTRAINT "cir_hojas_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_hojas" ADD CONSTRAINT "cir_hojas_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_hojas" ADD CONSTRAINT "cir_hojas_presupuesto_id_cir_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."cir_presupuestos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_hojas" ADD CONSTRAINT "cir_hojas_cirujano_id_users_id_fk" FOREIGN KEY ("cirujano_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_hojas" ADD CONSTRAINT "cir_hojas_anestesista_id_users_id_fk" FOREIGN KEY ("anestesista_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_hojas" ADD CONSTRAINT "cir_hojas_creado_por_id_users_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_hojas" ADD CONSTRAINT "cir_hojas_cerrada_por_id_users_id_fk" FOREIGN KEY ("cerrada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "cir_hojas_farmacos_order_idx" ON "cir_hojas_farmacos" USING btree ("_order");
  CREATE INDEX "cir_hojas_farmacos_parent_id_idx" ON "cir_hojas_farmacos" USING btree ("_parent_id");
  CREATE INDEX "cir_hojas_signos_order_idx" ON "cir_hojas_signos" USING btree ("_order");
  CREATE INDEX "cir_hojas_signos_parent_id_idx" ON "cir_hojas_signos" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "cir_hojas_cita_idx" ON "cir_hojas" USING btree ("cita_id");
  CREATE INDEX "cir_hojas_mascota_idx" ON "cir_hojas" USING btree ("mascota_id");
  CREATE INDEX "cir_hojas_presupuesto_idx" ON "cir_hojas" USING btree ("presupuesto_id");
  CREATE INDEX "cir_hojas_fecha_idx" ON "cir_hojas" USING btree ("fecha");
  CREATE INDEX "cir_hojas_estado_idx" ON "cir_hojas" USING btree ("estado");
  CREATE INDEX "cir_hojas_cirujano_idx" ON "cir_hojas" USING btree ("cirujano_id");
  CREATE INDEX "cir_hojas_anestesista_idx" ON "cir_hojas" USING btree ("anestesista_id");
  CREATE INDEX "cir_hojas_creado_por_idx" ON "cir_hojas" USING btree ("creado_por_id");
  CREATE INDEX "cir_hojas_cerrada_por_idx" ON "cir_hojas" USING btree ("cerrada_por_id");
  CREATE INDEX "cir_hojas_updated_at_idx" ON "cir_hojas" USING btree ("updated_at");
  CREATE INDEX "cir_hojas_created_at_idx" ON "cir_hojas" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cir_hojas_fk" FOREIGN KEY ("cir_hojas_id") REFERENCES "public"."cir_hojas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_cir_hojas_id_idx" ON "payload_locked_documents_rels" USING btree ("cir_hojas_id");
  ALTER TABLE "cir_hojas_farmacos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "cir_hojas_signos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "cir_hojas" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cir_hojas_farmacos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cir_hojas_signos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cir_hojas" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cir_hojas_farmacos" CASCADE;
  DROP TABLE "cir_hojas_signos" CASCADE;
  DROP TABLE "cir_hojas" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_cir_hojas_fk";
  
  DROP INDEX "payload_locked_documents_rels_cir_hojas_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cir_hojas_id";
  DROP TYPE "public"."enum_cir_hojas_farmacos_momento";
  DROP TYPE "public"."enum_cir_hojas_estado";
  DROP TYPE "public"."enum_cir_hojas_asa";`)
}
