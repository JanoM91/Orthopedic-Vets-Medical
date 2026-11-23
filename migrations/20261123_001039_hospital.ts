import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_hos_internamientos_aplicaciones_estado" AS ENUM('aplicada', 'omitida');
  CREATE TYPE "public"."enum_hos_internamientos_observaciones_apetito" AS ENUM('completo', 'parcial', 'nada', 'ayuno');
  CREATE TYPE "public"."enum_hos_internamientos_estado" AS ENUM('internado', 'alta');
  CREATE TABLE "hos_internamientos_indicaciones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave" varchar NOT NULL,
  	"tratamiento" varchar NOT NULL,
  	"dosis" varchar,
  	"via" varchar,
  	"frecuencia" varchar,
  	"horas" varchar,
  	"nota" varchar,
  	"activa" boolean DEFAULT true,
  	"desde" timestamp(3) with time zone,
  	"por" varchar,
  	"suspendida_en" timestamp(3) with time zone,
  	"suspendida_por" varchar
  );
  
  CREATE TABLE "hos_internamientos_aplicaciones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"indicacion" varchar NOT NULL,
  	"programada" varchar,
  	"estado" "enum_hos_internamientos_aplicaciones_estado" NOT NULL,
  	"en" timestamp(3) with time zone NOT NULL,
  	"motivo" varchar,
  	"nota" varchar,
  	"por" varchar
  );
  
  CREATE TABLE "hos_internamientos_observaciones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"en" timestamp(3) with time zone NOT NULL,
  	"temp" numeric,
  	"fc" numeric,
  	"fr" numeric,
  	"dolor" numeric,
  	"apetito" "enum_hos_internamientos_observaciones_apetito",
  	"orina" boolean,
  	"heces" boolean,
  	"notas" varchar,
  	"por" varchar
  );
  
  CREATE TABLE "hos_internamientos_cargos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"concepto" varchar NOT NULL,
  	"cantidad" numeric NOT NULL,
  	"precio_unitario" numeric NOT NULL,
  	"importe" numeric NOT NULL,
  	"fecha" varchar NOT NULL,
  	"por" varchar
  );
  
  CREATE TABLE "hos_internamientos_partes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"en" timestamp(3) with time zone NOT NULL,
  	"texto" varchar NOT NULL,
  	"foto" varchar,
  	"por" varchar,
  	"avisado" boolean
  );
  
  CREATE TABLE "hos_internamientos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"cliente_id" integer,
  	"hoja_id" integer,
  	"presupuesto_id" integer,
  	"medico_id" integer,
  	"motivo" varchar NOT NULL,
  	"espacio" varchar,
  	"estado" "enum_hos_internamientos_estado" DEFAULT 'internado' NOT NULL,
  	"ingreso" timestamp(3) with time zone NOT NULL,
  	"alta" timestamp(3) with time zone,
  	"resumen_alta" varchar,
  	"indicaciones_alta" varchar,
  	"cargo_finanzas_id" integer,
  	"token" varchar,
  	"creado_por_id" integer,
  	"alta_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "hos_internamientos_id" integer;
  ALTER TABLE "hos_internamientos_indicaciones" ADD CONSTRAINT "hos_internamientos_indicaciones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."hos_internamientos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "hos_internamientos_aplicaciones" ADD CONSTRAINT "hos_internamientos_aplicaciones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."hos_internamientos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "hos_internamientos_observaciones" ADD CONSTRAINT "hos_internamientos_observaciones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."hos_internamientos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "hos_internamientos_cargos" ADD CONSTRAINT "hos_internamientos_cargos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."hos_internamientos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "hos_internamientos_partes" ADD CONSTRAINT "hos_internamientos_partes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."hos_internamientos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "hos_internamientos" ADD CONSTRAINT "hos_internamientos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "hos_internamientos" ADD CONSTRAINT "hos_internamientos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "hos_internamientos" ADD CONSTRAINT "hos_internamientos_hoja_id_cir_hojas_id_fk" FOREIGN KEY ("hoja_id") REFERENCES "public"."cir_hojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "hos_internamientos" ADD CONSTRAINT "hos_internamientos_presupuesto_id_cir_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."cir_presupuestos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "hos_internamientos" ADD CONSTRAINT "hos_internamientos_medico_id_users_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "hos_internamientos" ADD CONSTRAINT "hos_internamientos_cargo_finanzas_id_fin_operaciones_id_fk" FOREIGN KEY ("cargo_finanzas_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "hos_internamientos" ADD CONSTRAINT "hos_internamientos_creado_por_id_users_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "hos_internamientos" ADD CONSTRAINT "hos_internamientos_alta_por_id_users_id_fk" FOREIGN KEY ("alta_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "hos_internamientos_indicaciones_order_idx" ON "hos_internamientos_indicaciones" USING btree ("_order");
  CREATE INDEX "hos_internamientos_indicaciones_parent_id_idx" ON "hos_internamientos_indicaciones" USING btree ("_parent_id");
  CREATE INDEX "hos_internamientos_aplicaciones_order_idx" ON "hos_internamientos_aplicaciones" USING btree ("_order");
  CREATE INDEX "hos_internamientos_aplicaciones_parent_id_idx" ON "hos_internamientos_aplicaciones" USING btree ("_parent_id");
  CREATE INDEX "hos_internamientos_observaciones_order_idx" ON "hos_internamientos_observaciones" USING btree ("_order");
  CREATE INDEX "hos_internamientos_observaciones_parent_id_idx" ON "hos_internamientos_observaciones" USING btree ("_parent_id");
  CREATE INDEX "hos_internamientos_cargos_order_idx" ON "hos_internamientos_cargos" USING btree ("_order");
  CREATE INDEX "hos_internamientos_cargos_parent_id_idx" ON "hos_internamientos_cargos" USING btree ("_parent_id");
  CREATE INDEX "hos_internamientos_partes_order_idx" ON "hos_internamientos_partes" USING btree ("_order");
  CREATE INDEX "hos_internamientos_partes_parent_id_idx" ON "hos_internamientos_partes" USING btree ("_parent_id");
  CREATE INDEX "hos_internamientos_mascota_idx" ON "hos_internamientos" USING btree ("mascota_id");
  CREATE INDEX "hos_internamientos_cliente_idx" ON "hos_internamientos" USING btree ("cliente_id");
  CREATE INDEX "hos_internamientos_hoja_idx" ON "hos_internamientos" USING btree ("hoja_id");
  CREATE INDEX "hos_internamientos_presupuesto_idx" ON "hos_internamientos" USING btree ("presupuesto_id");
  CREATE INDEX "hos_internamientos_medico_idx" ON "hos_internamientos" USING btree ("medico_id");
  CREATE INDEX "hos_internamientos_estado_idx" ON "hos_internamientos" USING btree ("estado");
  CREATE INDEX "hos_internamientos_cargo_finanzas_idx" ON "hos_internamientos" USING btree ("cargo_finanzas_id");
  CREATE INDEX "hos_internamientos_token_idx" ON "hos_internamientos" USING btree ("token");
  CREATE INDEX "hos_internamientos_creado_por_idx" ON "hos_internamientos" USING btree ("creado_por_id");
  CREATE INDEX "hos_internamientos_alta_por_idx" ON "hos_internamientos" USING btree ("alta_por_id");
  CREATE INDEX "hos_internamientos_updated_at_idx" ON "hos_internamientos" USING btree ("updated_at");
  CREATE INDEX "hos_internamientos_created_at_idx" ON "hos_internamientos" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_hos_internamientos_fk" FOREIGN KEY ("hos_internamientos_id") REFERENCES "public"."hos_internamientos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_hos_internamientos_id_idx" ON "payload_locked_documents_rels" USING btree ("hos_internamientos_id");
  ALTER TABLE "hos_internamientos_indicaciones" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos_aplicaciones" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos_observaciones" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos_cargos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos_partes" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "hos_internamientos_indicaciones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos_aplicaciones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos_observaciones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos_cargos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos_partes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "hos_internamientos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "hos_internamientos_indicaciones" CASCADE;
  DROP TABLE "hos_internamientos_aplicaciones" CASCADE;
  DROP TABLE "hos_internamientos_observaciones" CASCADE;
  DROP TABLE "hos_internamientos_cargos" CASCADE;
  DROP TABLE "hos_internamientos_partes" CASCADE;
  DROP TABLE "hos_internamientos" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_hos_internamientos_fk";
  
  DROP INDEX "payload_locked_documents_rels_hos_internamientos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "hos_internamientos_id";
  DROP TYPE "public"."enum_hos_internamientos_aplicaciones_estado";
  DROP TYPE "public"."enum_hos_internamientos_observaciones_apetito";
  DROP TYPE "public"."enum_hos_internamientos_estado";`)
}
