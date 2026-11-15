import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "far_recompras" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar NOT NULL,
  	"cliente_id" integer,
  	"correo" varchar,
  	"nombre" varchar,
  	"mascota_id" integer,
  	"producto_id" integer NOT NULL,
  	"presentacion_id" integer NOT NULL,
  	"cantidad" numeric NOT NULL,
  	"unidades" numeric NOT NULL,
  	"ultima_venta_id" integer NOT NULL,
  	"ultima_compra" varchar NOT NULL,
  	"fecha_estimada" varchar NOT NULL,
  	"avisado_para" varchar,
  	"avisado_en" timestamp(3) with time zone,
  	"activa" boolean DEFAULT true,
  	"token" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_recompras_id" integer;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_recompra_activa" boolean DEFAULT true;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_recompra_dias_antes" numeric DEFAULT 5;
  ALTER TABLE "far_recompras" ADD CONSTRAINT "far_recompras_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recompras" ADD CONSTRAINT "far_recompras_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recompras" ADD CONSTRAINT "far_recompras_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recompras" ADD CONSTRAINT "far_recompras_presentacion_id_far_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recompras" ADD CONSTRAINT "far_recompras_ultima_venta_id_far_ventas_id_fk" FOREIGN KEY ("ultima_venta_id") REFERENCES "public"."far_ventas"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "far_recompras_clave_idx" ON "far_recompras" USING btree ("clave");
  CREATE INDEX "far_recompras_cliente_idx" ON "far_recompras" USING btree ("cliente_id");
  CREATE INDEX "far_recompras_correo_idx" ON "far_recompras" USING btree ("correo");
  CREATE INDEX "far_recompras_mascota_idx" ON "far_recompras" USING btree ("mascota_id");
  CREATE INDEX "far_recompras_producto_idx" ON "far_recompras" USING btree ("producto_id");
  CREATE INDEX "far_recompras_presentacion_idx" ON "far_recompras" USING btree ("presentacion_id");
  CREATE INDEX "far_recompras_ultima_venta_idx" ON "far_recompras" USING btree ("ultima_venta_id");
  CREATE INDEX "far_recompras_fecha_estimada_idx" ON "far_recompras" USING btree ("fecha_estimada");
  CREATE INDEX "far_recompras_activa_idx" ON "far_recompras" USING btree ("activa");
  CREATE UNIQUE INDEX "far_recompras_token_idx" ON "far_recompras" USING btree ("token");
  CREATE INDEX "far_recompras_updated_at_idx" ON "far_recompras" USING btree ("updated_at");
  CREATE INDEX "far_recompras_created_at_idx" ON "far_recompras" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_recompras_fk" FOREIGN KEY ("far_recompras_id") REFERENCES "public"."far_recompras"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_far_recompras_id_idx" ON "payload_locked_documents_rels" USING btree ("far_recompras_id");
  ALTER TABLE "far_recompras" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "far_recompras" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "far_recompras" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_recompras_fk";
  
  DROP INDEX "payload_locked_documents_rels_far_recompras_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_recompras_id";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_recompra_activa";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_recompra_dias_antes";`)
}
