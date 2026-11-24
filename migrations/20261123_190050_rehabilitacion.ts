import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_reh_planes_estado" AS ENUM('activo', 'terminado');
  CREATE TYPE "public"."enum_reh_sesiones_mediciones_articulacion" AS ENUM('hombro', 'codo', 'carpo', 'cadera', 'rodilla', 'tarso');
  CREATE TYPE "public"."enum_reh_sesiones_mediciones_lado" AS ENUM('izq', 'der');
  CREATE TYPE "public"."enum_reh_sesiones_mediciones_movimiento" AS ENUM('flexion', 'extension');
  CREATE TABLE "reh_ejercicios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"como_se_hace" varchar NOT NULL,
  	"foto" varchar,
  	"video" varchar,
  	"activo" boolean DEFAULT true,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reh_planes_ejercicios" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave" varchar NOT NULL,
  	"ejercicio_id" integer,
  	"nombre" varchar NOT NULL,
  	"como_se_hace" varchar,
  	"repeticiones" varchar,
  	"veces_al_dia" numeric NOT NULL,
  	"nota" varchar,
  	"activo" boolean DEFAULT true,
  	"desde" timestamp(3) with time zone,
  	"por" varchar,
  	"quitado_en" timestamp(3) with time zone
  );
  
  CREATE TABLE "reh_planes_casa" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"dia" varchar NOT NULL,
  	"clave" varchar NOT NULL,
  	"veces" numeric NOT NULL,
  	"en" timestamp(3) with time zone
  );
  
  CREATE TABLE "reh_planes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"cliente_id" integer,
  	"responsable_id" integer,
  	"hoja_id" integer,
  	"motivo" varchar NOT NULL,
  	"objetivo" varchar,
  	"servicio_id" integer,
  	"sesiones_previstas" numeric,
  	"frecuencia" varchar,
  	"estado" "enum_reh_planes_estado" DEFAULT 'activo' NOT NULL,
  	"inicio" timestamp(3) with time zone NOT NULL,
  	"fin" timestamp(3) with time zone,
  	"resumen_final" varchar,
  	"creado_por_id" integer,
  	"terminado_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reh_sesiones_mediciones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"articulacion" "enum_reh_sesiones_mediciones_articulacion" NOT NULL,
  	"lado" "enum_reh_sesiones_mediciones_lado" NOT NULL,
  	"movimiento" "enum_reh_sesiones_mediciones_movimiento" NOT NULL,
  	"grados" numeric NOT NULL
  );
  
  CREATE TABLE "reh_sesiones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"plan_id" integer NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"cita_id" integer,
  	"fecha" timestamp(3) with time zone NOT NULL,
  	"terapeuta_id" integer,
  	"por" varchar,
  	"dolor" numeric,
  	"cojera" numeric,
  	"perimetro_izq" numeric,
  	"perimetro_der" numeric,
  	"terapias" varchar,
  	"nota_interna" varchar,
  	"nota_tutor" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reh_ejercicios_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reh_planes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reh_sesiones_id" integer;
  ALTER TABLE "reh_planes_ejercicios" ADD CONSTRAINT "reh_planes_ejercicios_ejercicio_id_reh_ejercicios_id_fk" FOREIGN KEY ("ejercicio_id") REFERENCES "public"."reh_ejercicios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_planes_ejercicios" ADD CONSTRAINT "reh_planes_ejercicios_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."reh_planes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reh_planes_casa" ADD CONSTRAINT "reh_planes_casa_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."reh_planes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reh_planes" ADD CONSTRAINT "reh_planes_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_planes" ADD CONSTRAINT "reh_planes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_planes" ADD CONSTRAINT "reh_planes_responsable_id_users_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_planes" ADD CONSTRAINT "reh_planes_hoja_id_cir_hojas_id_fk" FOREIGN KEY ("hoja_id") REFERENCES "public"."cir_hojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_planes" ADD CONSTRAINT "reh_planes_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_planes" ADD CONSTRAINT "reh_planes_creado_por_id_users_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_planes" ADD CONSTRAINT "reh_planes_terminado_por_id_users_id_fk" FOREIGN KEY ("terminado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_sesiones_mediciones" ADD CONSTRAINT "reh_sesiones_mediciones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."reh_sesiones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reh_sesiones" ADD CONSTRAINT "reh_sesiones_plan_id_reh_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."reh_planes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_sesiones" ADD CONSTRAINT "reh_sesiones_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_sesiones" ADD CONSTRAINT "reh_sesiones_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reh_sesiones" ADD CONSTRAINT "reh_sesiones_terapeuta_id_users_id_fk" FOREIGN KEY ("terapeuta_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "reh_ejercicios_nombre_idx" ON "reh_ejercicios" USING btree ("nombre");
  CREATE INDEX "reh_ejercicios_updated_at_idx" ON "reh_ejercicios" USING btree ("updated_at");
  CREATE INDEX "reh_ejercicios_created_at_idx" ON "reh_ejercicios" USING btree ("created_at");
  CREATE INDEX "reh_planes_ejercicios_order_idx" ON "reh_planes_ejercicios" USING btree ("_order");
  CREATE INDEX "reh_planes_ejercicios_parent_id_idx" ON "reh_planes_ejercicios" USING btree ("_parent_id");
  CREATE INDEX "reh_planes_ejercicios_ejercicio_idx" ON "reh_planes_ejercicios" USING btree ("ejercicio_id");
  CREATE INDEX "reh_planes_casa_order_idx" ON "reh_planes_casa" USING btree ("_order");
  CREATE INDEX "reh_planes_casa_parent_id_idx" ON "reh_planes_casa" USING btree ("_parent_id");
  CREATE INDEX "reh_planes_mascota_idx" ON "reh_planes" USING btree ("mascota_id");
  CREATE INDEX "reh_planes_cliente_idx" ON "reh_planes" USING btree ("cliente_id");
  CREATE INDEX "reh_planes_responsable_idx" ON "reh_planes" USING btree ("responsable_id");
  CREATE INDEX "reh_planes_hoja_idx" ON "reh_planes" USING btree ("hoja_id");
  CREATE INDEX "reh_planes_servicio_idx" ON "reh_planes" USING btree ("servicio_id");
  CREATE INDEX "reh_planes_estado_idx" ON "reh_planes" USING btree ("estado");
  CREATE INDEX "reh_planes_creado_por_idx" ON "reh_planes" USING btree ("creado_por_id");
  CREATE INDEX "reh_planes_terminado_por_idx" ON "reh_planes" USING btree ("terminado_por_id");
  CREATE INDEX "reh_planes_updated_at_idx" ON "reh_planes" USING btree ("updated_at");
  CREATE INDEX "reh_planes_created_at_idx" ON "reh_planes" USING btree ("created_at");
  CREATE INDEX "reh_sesiones_mediciones_order_idx" ON "reh_sesiones_mediciones" USING btree ("_order");
  CREATE INDEX "reh_sesiones_mediciones_parent_id_idx" ON "reh_sesiones_mediciones" USING btree ("_parent_id");
  CREATE INDEX "reh_sesiones_plan_idx" ON "reh_sesiones" USING btree ("plan_id");
  CREATE INDEX "reh_sesiones_mascota_idx" ON "reh_sesiones" USING btree ("mascota_id");
  CREATE INDEX "reh_sesiones_cita_idx" ON "reh_sesiones" USING btree ("cita_id");
  CREATE INDEX "reh_sesiones_terapeuta_idx" ON "reh_sesiones" USING btree ("terapeuta_id");
  CREATE INDEX "reh_sesiones_updated_at_idx" ON "reh_sesiones" USING btree ("updated_at");
  CREATE INDEX "reh_sesiones_created_at_idx" ON "reh_sesiones" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reh_ejercicios_fk" FOREIGN KEY ("reh_ejercicios_id") REFERENCES "public"."reh_ejercicios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reh_planes_fk" FOREIGN KEY ("reh_planes_id") REFERENCES "public"."reh_planes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reh_sesiones_fk" FOREIGN KEY ("reh_sesiones_id") REFERENCES "public"."reh_sesiones"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_reh_ejercicios_id_idx" ON "payload_locked_documents_rels" USING btree ("reh_ejercicios_id");
  CREATE INDEX "payload_locked_documents_rels_reh_planes_id_idx" ON "payload_locked_documents_rels" USING btree ("reh_planes_id");
  CREATE INDEX "payload_locked_documents_rels_reh_sesiones_id_idx" ON "payload_locked_documents_rels" USING btree ("reh_sesiones_id");
  ALTER TABLE "reh_ejercicios" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_planes_ejercicios" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_planes_casa" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_planes" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_sesiones_mediciones" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_sesiones" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reh_ejercicios" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_planes_ejercicios" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_planes_casa" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_planes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_sesiones_mediciones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reh_sesiones" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "reh_ejercicios" CASCADE;
  DROP TABLE "reh_planes_ejercicios" CASCADE;
  DROP TABLE "reh_planes_casa" CASCADE;
  DROP TABLE "reh_planes" CASCADE;
  DROP TABLE "reh_sesiones_mediciones" CASCADE;
  DROP TABLE "reh_sesiones" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reh_ejercicios_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reh_planes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reh_sesiones_fk";
  
  DROP INDEX "payload_locked_documents_rels_reh_ejercicios_id_idx";
  DROP INDEX "payload_locked_documents_rels_reh_planes_id_idx";
  DROP INDEX "payload_locked_documents_rels_reh_sesiones_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reh_ejercicios_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reh_planes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reh_sesiones_id";
  DROP TYPE "public"."enum_reh_planes_estado";
  DROP TYPE "public"."enum_reh_sesiones_mediciones_articulacion";
  DROP TYPE "public"."enum_reh_sesiones_mediciones_lado";
  DROP TYPE "public"."enum_reh_sesiones_mediciones_movimiento";`)
}
