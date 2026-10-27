import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Farmacia, fase 4 (27-oct-2026): alertas (una abierta por objeto y tipo), promociones por caducidad, días sin rotación y control del resumen diario. */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_far_alertas_tipo" AS ENUM('caducidad', 'desabasto', 'reorden_sugerido', 'sin_rotacion', 'receta_por_validar', 'original_pendiente', 'plan_por_renovar');
  CREATE TYPE "public"."enum_far_alertas_severidad" AS ENUM('aviso', 'urgente', 'critica');
  CREATE TYPE "public"."enum_far_alertas_estado" AS ENUM('abierta', 'atendida', 'descartada');
  CREATE TYPE "public"."enum_far_promociones_origen" AS ENUM('caducidad', 'manual');
  CREATE TYPE "public"."enum_far_promociones_estado" AS ENUM('propuesta', 'aprobada', 'rechazada', 'vencida');
  CREATE TABLE "far_alertas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tipo" "enum_far_alertas_tipo" NOT NULL,
  	"severidad" "enum_far_alertas_severidad" DEFAULT 'aviso' NOT NULL,
  	"estado" "enum_far_alertas_estado" DEFAULT 'abierta' NOT NULL,
  	"objeto" varchar NOT NULL,
  	"clave_abierta" varchar,
  	"mensaje" varchar NOT NULL,
  	"producto_id" integer,
  	"lote_id" integer,
  	"receta_id" integer,
  	"valor" numeric,
  	"abierta_en" timestamp(3) with time zone NOT NULL,
  	"actualizada_en" timestamp(3) with time zone,
  	"cerrada_en" timestamp(3) with time zone,
  	"cerrada_por_id" integer,
  	"cierre_automatico" boolean DEFAULT false,
  	"nota" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_promociones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL,
  	"producto_id" integer NOT NULL,
  	"lote_id" integer,
  	"descuento_porciento" numeric NOT NULL,
  	"dias_para_caducar" numeric,
  	"vigente_desde" varchar NOT NULL,
  	"vigente_hasta" varchar NOT NULL,
  	"origen" "enum_far_promociones_origen" DEFAULT 'caducidad' NOT NULL,
  	"estado" "enum_far_promociones_estado" DEFAULT 'propuesta' NOT NULL,
  	"clave_abierta" varchar,
  	"decidida_por_id" integer,
  	"decidida_en" timestamp(3) with time zone,
  	"motivo" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_alertas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_promociones_id" integer;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "aprendizaje_dias_sin_rotacion" numeric DEFAULT 90;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "correos_alertas" varchar;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "ultimo_resumen" varchar;
  ALTER TABLE "far_alertas" ADD CONSTRAINT "far_alertas_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_alertas" ADD CONSTRAINT "far_alertas_lote_id_far_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."far_lotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_alertas" ADD CONSTRAINT "far_alertas_receta_id_far_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."far_recetas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_alertas" ADD CONSTRAINT "far_alertas_cerrada_por_id_users_id_fk" FOREIGN KEY ("cerrada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_promociones" ADD CONSTRAINT "far_promociones_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_promociones" ADD CONSTRAINT "far_promociones_lote_id_far_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."far_lotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_promociones" ADD CONSTRAINT "far_promociones_decidida_por_id_users_id_fk" FOREIGN KEY ("decidida_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "far_alertas_tipo_idx" ON "far_alertas" USING btree ("tipo");
  CREATE INDEX "far_alertas_severidad_idx" ON "far_alertas" USING btree ("severidad");
  CREATE INDEX "far_alertas_estado_idx" ON "far_alertas" USING btree ("estado");
  CREATE INDEX "far_alertas_objeto_idx" ON "far_alertas" USING btree ("objeto");
  CREATE UNIQUE INDEX "far_alertas_clave_abierta_idx" ON "far_alertas" USING btree ("clave_abierta");
  CREATE INDEX "far_alertas_producto_idx" ON "far_alertas" USING btree ("producto_id");
  CREATE INDEX "far_alertas_lote_idx" ON "far_alertas" USING btree ("lote_id");
  CREATE INDEX "far_alertas_receta_idx" ON "far_alertas" USING btree ("receta_id");
  CREATE INDEX "far_alertas_cerrada_por_idx" ON "far_alertas" USING btree ("cerrada_por_id");
  CREATE INDEX "far_alertas_updated_at_idx" ON "far_alertas" USING btree ("updated_at");
  CREATE INDEX "far_alertas_created_at_idx" ON "far_alertas" USING btree ("created_at");
  CREATE INDEX "far_promociones_producto_idx" ON "far_promociones" USING btree ("producto_id");
  CREATE INDEX "far_promociones_lote_idx" ON "far_promociones" USING btree ("lote_id");
  CREATE INDEX "far_promociones_vigente_hasta_idx" ON "far_promociones" USING btree ("vigente_hasta");
  CREATE INDEX "far_promociones_estado_idx" ON "far_promociones" USING btree ("estado");
  CREATE UNIQUE INDEX "far_promociones_clave_abierta_idx" ON "far_promociones" USING btree ("clave_abierta");
  CREATE INDEX "far_promociones_decidida_por_idx" ON "far_promociones" USING btree ("decidida_por_id");
  CREATE INDEX "far_promociones_updated_at_idx" ON "far_promociones" USING btree ("updated_at");
  CREATE INDEX "far_promociones_created_at_idx" ON "far_promociones" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_alertas_fk" FOREIGN KEY ("far_alertas_id") REFERENCES "public"."far_alertas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_promociones_fk" FOREIGN KEY ("far_promociones_id") REFERENCES "public"."far_promociones"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_far_alertas_id_idx" ON "payload_locked_documents_rels" USING btree ("far_alertas_id");
  CREATE INDEX "payload_locked_documents_rels_far_promociones_id_idx" ON "payload_locked_documents_rels" USING btree ("far_promociones_id");`)
  await activarRls({ db })
}

/** Toda tabla nueva nace con RLS (Supabase expone `public` por su API). */
async function activarRls({ db }: Pick<MigrateUpArgs, 'db'>): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
    END $$;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "far_alertas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_promociones" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "far_alertas" CASCADE;
  DROP TABLE "far_promociones" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_alertas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_promociones_fk";
  
  DROP INDEX "payload_locked_documents_rels_far_alertas_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_promociones_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_alertas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_promociones_id";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "aprendizaje_dias_sin_rotacion";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "correos_alertas";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "ultimo_resumen";
  DROP TYPE "public"."enum_far_alertas_tipo";
  DROP TYPE "public"."enum_far_alertas_severidad";
  DROP TYPE "public"."enum_far_alertas_estado";
  DROP TYPE "public"."enum_far_promociones_origen";
  DROP TYPE "public"."enum_far_promociones_estado";`)
}
