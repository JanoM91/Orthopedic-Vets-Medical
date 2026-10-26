import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Farmacia, fase 2 (26-oct-2026): far-compras (con renglones) y far-proveedor-claves. */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_far_compras_estado" AS ENUM('borrador', 'recibida', 'anulada');
  CREATE TYPE "public"."enum_far_compras_origen" AS ENUM('xml', 'manual');
  CREATE TYPE "public"."enum_far_compras_condicion" AS ENUM('contado', 'credito');
  CREATE TABLE "far_proveedor_claves" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"proveedor_id" integer NOT NULL,
  	"clave" varchar NOT NULL,
  	"presentacion_id" integer NOT NULL,
  	"descripcion_proveedor" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_compras_renglones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave_proveedor" varchar,
  	"descripcion" varchar,
  	"presentacion_id" integer,
  	"producto_id" integer,
  	"cantidad" numeric NOT NULL,
  	"valor_unitario" numeric,
  	"importe" numeric,
  	"numero_lote" varchar,
  	"caducidad" varchar,
  	"lote_id" integer
  );
  
  CREATE TABLE "far_compras" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"estado" "enum_far_compras_estado" DEFAULT 'borrador' NOT NULL,
  	"proveedor_id" integer NOT NULL,
  	"almacen_id" integer,
  	"fecha" varchar NOT NULL,
  	"serie_factura" varchar,
  	"folio_factura" varchar,
  	"uuid" varchar,
  	"origen" "enum_far_compras_origen" DEFAULT 'manual' NOT NULL,
  	"xml_texto" varchar,
  	"subtotal" numeric,
  	"iva" numeric,
  	"total" numeric,
  	"condicion" "enum_far_compras_condicion" DEFAULT 'contado' NOT NULL,
  	"cuenta_id" integer,
  	"vence_el" varchar,
  	"gasto_finanzas_id" integer,
  	"notas" varchar,
  	"capturada_por_id" integer,
  	"recibida_por_id" integer,
  	"recibida_en" timestamp(3) with time zone,
  	"anulada_por_id" integer,
  	"anulada_en" timestamp(3) with time zone,
  	"motivo_anulacion" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_proveedor_claves_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_compras_id" integer;
  ALTER TABLE "far_proveedor_claves" ADD CONSTRAINT "far_proveedor_claves_proveedor_id_far_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."far_proveedores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_proveedor_claves" ADD CONSTRAINT "far_proveedor_claves_presentacion_id_far_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras_renglones" ADD CONSTRAINT "far_compras_renglones_presentacion_id_far_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras_renglones" ADD CONSTRAINT "far_compras_renglones_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras_renglones" ADD CONSTRAINT "far_compras_renglones_lote_id_far_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."far_lotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras_renglones" ADD CONSTRAINT "far_compras_renglones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."far_compras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_compras" ADD CONSTRAINT "far_compras_proveedor_id_far_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."far_proveedores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras" ADD CONSTRAINT "far_compras_almacen_id_far_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."far_almacenes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras" ADD CONSTRAINT "far_compras_cuenta_id_fin_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."fin_cuentas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras" ADD CONSTRAINT "far_compras_gasto_finanzas_id_fin_operaciones_id_fk" FOREIGN KEY ("gasto_finanzas_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras" ADD CONSTRAINT "far_compras_capturada_por_id_users_id_fk" FOREIGN KEY ("capturada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras" ADD CONSTRAINT "far_compras_recibida_por_id_users_id_fk" FOREIGN KEY ("recibida_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_compras" ADD CONSTRAINT "far_compras_anulada_por_id_users_id_fk" FOREIGN KEY ("anulada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "far_proveedor_claves_proveedor_idx" ON "far_proveedor_claves" USING btree ("proveedor_id");
  CREATE INDEX "far_proveedor_claves_clave_idx" ON "far_proveedor_claves" USING btree ("clave");
  CREATE INDEX "far_proveedor_claves_presentacion_idx" ON "far_proveedor_claves" USING btree ("presentacion_id");
  CREATE INDEX "far_proveedor_claves_updated_at_idx" ON "far_proveedor_claves" USING btree ("updated_at");
  CREATE INDEX "far_proveedor_claves_created_at_idx" ON "far_proveedor_claves" USING btree ("created_at");
  CREATE INDEX "far_compras_renglones_order_idx" ON "far_compras_renglones" USING btree ("_order");
  CREATE INDEX "far_compras_renglones_parent_id_idx" ON "far_compras_renglones" USING btree ("_parent_id");
  CREATE INDEX "far_compras_renglones_presentacion_idx" ON "far_compras_renglones" USING btree ("presentacion_id");
  CREATE INDEX "far_compras_renglones_producto_idx" ON "far_compras_renglones" USING btree ("producto_id");
  CREATE INDEX "far_compras_renglones_lote_idx" ON "far_compras_renglones" USING btree ("lote_id");
  CREATE INDEX "far_compras_estado_idx" ON "far_compras" USING btree ("estado");
  CREATE INDEX "far_compras_proveedor_idx" ON "far_compras" USING btree ("proveedor_id");
  CREATE INDEX "far_compras_almacen_idx" ON "far_compras" USING btree ("almacen_id");
  CREATE INDEX "far_compras_fecha_idx" ON "far_compras" USING btree ("fecha");
  CREATE INDEX "far_compras_folio_factura_idx" ON "far_compras" USING btree ("folio_factura");
  CREATE UNIQUE INDEX "far_compras_uuid_idx" ON "far_compras" USING btree ("uuid");
  CREATE INDEX "far_compras_cuenta_idx" ON "far_compras" USING btree ("cuenta_id");
  CREATE INDEX "far_compras_gasto_finanzas_idx" ON "far_compras" USING btree ("gasto_finanzas_id");
  CREATE INDEX "far_compras_capturada_por_idx" ON "far_compras" USING btree ("capturada_por_id");
  CREATE INDEX "far_compras_recibida_por_idx" ON "far_compras" USING btree ("recibida_por_id");
  CREATE INDEX "far_compras_anulada_por_idx" ON "far_compras" USING btree ("anulada_por_id");
  CREATE INDEX "far_compras_updated_at_idx" ON "far_compras" USING btree ("updated_at");
  CREATE INDEX "far_compras_created_at_idx" ON "far_compras" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_proveedor_claves_fk" FOREIGN KEY ("far_proveedor_claves_id") REFERENCES "public"."far_proveedor_claves"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_compras_fk" FOREIGN KEY ("far_compras_id") REFERENCES "public"."far_compras"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_far_proveedor_claves_id_idx" ON "payload_locked_documents_rels" USING btree ("far_proveedor_claves_id");
  CREATE INDEX "payload_locked_documents_rels_far_compras_id_idx" ON "payload_locked_documents_rels" USING btree ("far_compras_id");`)
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
   ALTER TABLE "far_proveedor_claves" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_compras_renglones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_compras" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "far_proveedor_claves" CASCADE;
  DROP TABLE "far_compras_renglones" CASCADE;
  DROP TABLE "far_compras" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_proveedor_claves_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_compras_fk";
  
  DROP INDEX "payload_locked_documents_rels_far_proveedor_claves_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_compras_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_proveedor_claves_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_compras_id";
  DROP TYPE "public"."enum_far_compras_estado";
  DROP TYPE "public"."enum_far_compras_origen";
  DROP TYPE "public"."enum_far_compras_condicion";`)
}
