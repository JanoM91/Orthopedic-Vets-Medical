/**
 * Farmacia 5b (13-nov-2026): entrega a domicilio (zonas, dirección, repartidor,
 * evidencia), envío en la venta, pago al recibir, reembolso y id del pago en la
 * pasarela (Mercado Pago). Las tablas nuevas llevan RLS (Supabase).
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_far_pedidos_pago_forma" ADD VALUE 'al_recibir';
  ALTER TYPE "public"."enum_far_pedidos_pago_estado" ADD VALUE 'reembolsado';
  CREATE TABLE "far_evidencias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"pedido_id" integer NOT NULL,
  	"tipo" varchar NOT NULL,
  	"datos" varchar NOT NULL,
  	"bytes" numeric,
  	"subida_por" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "farmacia_configuracion_tienda_zonas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"codigos_postales" varchar NOT NULL,
  	"costo" numeric DEFAULT 0 NOT NULL,
  	"pedido_minimo" numeric DEFAULT 0,
  	"gratis_desde" numeric,
  	"activa" boolean DEFAULT true
  );
  
  ALTER TABLE "far_ventas" ADD COLUMN "envio" numeric DEFAULT 0;
  ALTER TABLE "far_pedidos" ADD COLUMN "subtotal" numeric;
  ALTER TABLE "far_pedidos" ADD COLUMN "costo_envio" numeric DEFAULT 0;
  ALTER TABLE "far_pedidos" ADD COLUMN "pago_id_pago" varchar;
  ALTER TABLE "far_pedidos" ADD COLUMN "direccion_calle" varchar;
  ALTER TABLE "far_pedidos" ADD COLUMN "direccion_colonia" varchar;
  ALTER TABLE "far_pedidos" ADD COLUMN "direccion_codigo_postal" varchar;
  ALTER TABLE "far_pedidos" ADD COLUMN "direccion_referencias" varchar;
  ALTER TABLE "far_pedidos" ADD COLUMN "direccion_zona" varchar;
  ALTER TABLE "far_pedidos" ADD COLUMN "repartidor_id" integer;
  ALTER TABLE "far_pedidos" ADD COLUMN "entrega_domicilio_salio_en" timestamp(3) with time zone;
  ALTER TABLE "far_pedidos" ADD COLUMN "entrega_domicilio_entregado_en" timestamp(3) with time zone;
  ALTER TABLE "far_pedidos" ADD COLUMN "entrega_domicilio_recibio" varchar;
  ALTER TABLE "far_pedidos" ADD COLUMN "entrega_domicilio_nota" varchar;
  ALTER TABLE "far_pedidos" ADD COLUMN "entrega_domicilio_intentos" numeric DEFAULT 0;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_evidencias_id" integer;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_domicilio_activo" boolean DEFAULT false;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_pagar_al_recibir" boolean DEFAULT true;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_metodo_contra_entrega" varchar DEFAULT 'contra_entrega';
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_horario_entrega" varchar;
  ALTER TABLE "far_evidencias" ADD CONSTRAINT "far_evidencias_pedido_id_far_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."far_pedidos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion_tienda_zonas" ADD CONSTRAINT "farmacia_configuracion_tienda_zonas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."farmacia_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "far_evidencias_pedido_idx" ON "far_evidencias" USING btree ("pedido_id");
  CREATE INDEX "far_evidencias_updated_at_idx" ON "far_evidencias" USING btree ("updated_at");
  CREATE INDEX "far_evidencias_created_at_idx" ON "far_evidencias" USING btree ("created_at");
  CREATE INDEX "farmacia_configuracion_tienda_zonas_order_idx" ON "farmacia_configuracion_tienda_zonas" USING btree ("_order");
  CREATE INDEX "farmacia_configuracion_tienda_zonas_parent_id_idx" ON "farmacia_configuracion_tienda_zonas" USING btree ("_parent_id");
  ALTER TABLE "far_pedidos" ADD CONSTRAINT "far_pedidos_repartidor_id_users_id_fk" FOREIGN KEY ("repartidor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_evidencias_fk" FOREIGN KEY ("far_evidencias_id") REFERENCES "public"."far_evidencias"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "far_pedidos_repartidor_idx" ON "far_pedidos" USING btree ("repartidor_id");
  CREATE INDEX "payload_locked_documents_rels_far_evidencias_id_idx" ON "payload_locked_documents_rels" USING btree ("far_evidencias_id");
  ALTER TABLE "far_evidencias" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "farmacia_configuracion_tienda_zonas" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "far_evidencias" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "farmacia_configuracion_tienda_zonas" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "far_evidencias" CASCADE;
  DROP TABLE "farmacia_configuracion_tienda_zonas" CASCADE;
  ALTER TABLE "far_pedidos" DROP CONSTRAINT "far_pedidos_repartidor_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_evidencias_fk";
  
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_forma" SET DATA TYPE text;
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_forma" SET DEFAULT 'al_recoger'::text;
  DROP TYPE "public"."enum_far_pedidos_pago_forma";
  CREATE TYPE "public"."enum_far_pedidos_pago_forma" AS ENUM('al_recoger', 'en_linea');
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_forma" SET DEFAULT 'al_recoger'::"public"."enum_far_pedidos_pago_forma";
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_forma" SET DATA TYPE "public"."enum_far_pedidos_pago_forma" USING "pago_forma"::"public"."enum_far_pedidos_pago_forma";
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_estado" SET DATA TYPE text;
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_estado" SET DEFAULT 'pendiente'::text;
  DROP TYPE "public"."enum_far_pedidos_pago_estado";
  CREATE TYPE "public"."enum_far_pedidos_pago_estado" AS ENUM('pendiente', 'pagado', 'reembolso_pendiente');
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_estado" SET DEFAULT 'pendiente'::"public"."enum_far_pedidos_pago_estado";
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_estado" SET DATA TYPE "public"."enum_far_pedidos_pago_estado" USING "pago_estado"::"public"."enum_far_pedidos_pago_estado";
  DROP INDEX "far_pedidos_repartidor_idx";
  DROP INDEX "payload_locked_documents_rels_far_evidencias_id_idx";
  ALTER TABLE "far_ventas" DROP COLUMN "envio";
  ALTER TABLE "far_pedidos" DROP COLUMN "subtotal";
  ALTER TABLE "far_pedidos" DROP COLUMN "costo_envio";
  ALTER TABLE "far_pedidos" DROP COLUMN "pago_id_pago";
  ALTER TABLE "far_pedidos" DROP COLUMN "direccion_calle";
  ALTER TABLE "far_pedidos" DROP COLUMN "direccion_colonia";
  ALTER TABLE "far_pedidos" DROP COLUMN "direccion_codigo_postal";
  ALTER TABLE "far_pedidos" DROP COLUMN "direccion_referencias";
  ALTER TABLE "far_pedidos" DROP COLUMN "direccion_zona";
  ALTER TABLE "far_pedidos" DROP COLUMN "repartidor_id";
  ALTER TABLE "far_pedidos" DROP COLUMN "entrega_domicilio_salio_en";
  ALTER TABLE "far_pedidos" DROP COLUMN "entrega_domicilio_entregado_en";
  ALTER TABLE "far_pedidos" DROP COLUMN "entrega_domicilio_recibio";
  ALTER TABLE "far_pedidos" DROP COLUMN "entrega_domicilio_nota";
  ALTER TABLE "far_pedidos" DROP COLUMN "entrega_domicilio_intentos";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_evidencias_id";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_domicilio_activo";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_pagar_al_recibir";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_metodo_contra_entrega";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_horario_entrega";`)
}
