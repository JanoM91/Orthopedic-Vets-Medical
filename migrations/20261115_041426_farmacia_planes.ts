import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_far_planes_modalidad" AS ENUM('recurrente', 'anual');
  CREATE TYPE "public"."enum_far_planes_estado" AS ENUM('por_pagar', 'activo', 'detenido', 'cancelado', 'terminado');
  ALTER TYPE "public"."enum_far_pedidos_pago_forma" ADD VALUE 'plan';
  CREATE TABLE "far_planes_historial" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"fecha" timestamp(3) with time zone NOT NULL,
  	"evento" varchar NOT NULL,
  	"por" varchar
  );
  
  CREATE TABLE "far_planes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"modalidad" "enum_far_planes_modalidad" NOT NULL,
  	"estado" "enum_far_planes_estado" DEFAULT 'por_pagar' NOT NULL,
  	"tutor_id" integer NOT NULL,
  	"cliente_id" integer NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"producto_id" integer NOT NULL,
  	"presentacion_id" integer NOT NULL,
  	"cantidad" numeric NOT NULL,
  	"cada_dias" numeric NOT NULL,
  	"entregas_totales" numeric,
  	"entregas_hechas" numeric DEFAULT 0,
  	"proxima_entrega" varchar,
  	"precio_entrega" numeric NOT NULL,
  	"descuento_porciento" numeric DEFAULT 0,
  	"total" numeric,
  	"pago_proveedor" varchar,
  	"pago_referencia" varchar,
  	"pago_id_suscripcion" varchar,
  	"pago_id_pago" varchar,
  	"pago_pagado_en" timestamp(3) with time zone,
  	"anticipo_operacion_finanzas_id" integer,
  	"anticipo_reconocido" numeric DEFAULT 0,
  	"motivo" varchar,
  	"token" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "far_ventas" ADD COLUMN "plan_id" integer;
  ALTER TABLE "far_pedidos" ADD COLUMN "plan_id" integer;
  ALTER TABLE "far_pedidos" ADD COLUMN "ciclo" numeric;
  ALTER TABLE "far_pagos_eventos" ADD COLUMN "plan_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_planes_id" integer;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "planes_activo" boolean DEFAULT false;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "planes_descuento_anual" numeric DEFAULT 0;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "planes_entregas_anual" numeric DEFAULT 12;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "planes_dias_antes" numeric DEFAULT 3;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "planes_categoria_anticipos_id" integer;
  ALTER TABLE "far_planes_historial" ADD CONSTRAINT "far_planes_historial_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."far_planes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_planes" ADD CONSTRAINT "far_planes_tutor_id_tutores_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_planes" ADD CONSTRAINT "far_planes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_planes" ADD CONSTRAINT "far_planes_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_planes" ADD CONSTRAINT "far_planes_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_planes" ADD CONSTRAINT "far_planes_presentacion_id_far_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_planes" ADD CONSTRAINT "far_planes_anticipo_operacion_finanzas_id_fin_operaciones_id_fk" FOREIGN KEY ("anticipo_operacion_finanzas_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "far_planes_historial_order_idx" ON "far_planes_historial" USING btree ("_order");
  CREATE INDEX "far_planes_historial_parent_id_idx" ON "far_planes_historial" USING btree ("_parent_id");
  CREATE INDEX "far_planes_modalidad_idx" ON "far_planes" USING btree ("modalidad");
  CREATE INDEX "far_planes_estado_idx" ON "far_planes" USING btree ("estado");
  CREATE INDEX "far_planes_tutor_idx" ON "far_planes" USING btree ("tutor_id");
  CREATE INDEX "far_planes_cliente_idx" ON "far_planes" USING btree ("cliente_id");
  CREATE INDEX "far_planes_mascota_idx" ON "far_planes" USING btree ("mascota_id");
  CREATE INDEX "far_planes_producto_idx" ON "far_planes" USING btree ("producto_id");
  CREATE INDEX "far_planes_presentacion_idx" ON "far_planes" USING btree ("presentacion_id");
  CREATE INDEX "far_planes_proxima_entrega_idx" ON "far_planes" USING btree ("proxima_entrega");
  CREATE INDEX "far_planes_pago_pago_referencia_idx" ON "far_planes" USING btree ("pago_referencia");
  CREATE INDEX "far_planes_pago_pago_id_suscripcion_idx" ON "far_planes" USING btree ("pago_id_suscripcion");
  CREATE INDEX "far_planes_anticipo_anticipo_operacion_finanzas_idx" ON "far_planes" USING btree ("anticipo_operacion_finanzas_id");
  CREATE UNIQUE INDEX "far_planes_token_idx" ON "far_planes" USING btree ("token");
  CREATE INDEX "far_planes_updated_at_idx" ON "far_planes" USING btree ("updated_at");
  CREATE INDEX "far_planes_created_at_idx" ON "far_planes" USING btree ("created_at");
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_plan_id_far_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."far_planes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pedidos" ADD CONSTRAINT "far_pedidos_plan_id_far_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."far_planes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pagos_eventos" ADD CONSTRAINT "far_pagos_eventos_plan_id_far_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."far_planes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_planes_fk" FOREIGN KEY ("far_planes_id") REFERENCES "public"."far_planes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion" ADD CONSTRAINT "farmacia_configuracion_planes_categoria_anticipos_id_fin_categorias_id_fk" FOREIGN KEY ("planes_categoria_anticipos_id") REFERENCES "public"."fin_categorias"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "far_ventas_plan_idx" ON "far_ventas" USING btree ("plan_id");
  CREATE INDEX "far_pedidos_plan_idx" ON "far_pedidos" USING btree ("plan_id");
  CREATE INDEX "far_pagos_eventos_plan_idx" ON "far_pagos_eventos" USING btree ("plan_id");
  CREATE INDEX "payload_locked_documents_rels_far_planes_id_idx" ON "payload_locked_documents_rels" USING btree ("far_planes_id");
  CREATE INDEX "farmacia_configuracion_planes_planes_categoria_anticipos_idx" ON "farmacia_configuracion" USING btree ("planes_categoria_anticipos_id");
  ALTER TABLE "far_planes" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_planes_historial" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "far_planes_historial" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_planes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "far_planes_historial" CASCADE;
  DROP TABLE "far_planes" CASCADE;
  ALTER TABLE "far_ventas" DROP CONSTRAINT "far_ventas_plan_id_far_planes_id_fk";
  
  ALTER TABLE "far_pedidos" DROP CONSTRAINT "far_pedidos_plan_id_far_planes_id_fk";
  
  ALTER TABLE "far_pagos_eventos" DROP CONSTRAINT "far_pagos_eventos_plan_id_far_planes_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_planes_fk";
  
  ALTER TABLE "farmacia_configuracion" DROP CONSTRAINT "farmacia_configuracion_planes_categoria_anticipos_id_fin_categorias_id_fk";
  
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_forma" SET DATA TYPE text;
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_forma" SET DEFAULT 'al_recoger'::text;
  DROP TYPE "public"."enum_far_pedidos_pago_forma";
  CREATE TYPE "public"."enum_far_pedidos_pago_forma" AS ENUM('al_recoger', 'en_linea', 'al_recibir');
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_forma" SET DEFAULT 'al_recoger'::"public"."enum_far_pedidos_pago_forma";
  ALTER TABLE "far_pedidos" ALTER COLUMN "pago_forma" SET DATA TYPE "public"."enum_far_pedidos_pago_forma" USING "pago_forma"::"public"."enum_far_pedidos_pago_forma";
  DROP INDEX "far_ventas_plan_idx";
  DROP INDEX "far_pedidos_plan_idx";
  DROP INDEX "far_pagos_eventos_plan_idx";
  DROP INDEX "payload_locked_documents_rels_far_planes_id_idx";
  DROP INDEX "farmacia_configuracion_planes_planes_categoria_anticipos_idx";
  ALTER TABLE "far_ventas" DROP COLUMN "plan_id";
  ALTER TABLE "far_pedidos" DROP COLUMN "plan_id";
  ALTER TABLE "far_pedidos" DROP COLUMN "ciclo";
  ALTER TABLE "far_pagos_eventos" DROP COLUMN "plan_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_planes_id";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "planes_activo";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "planes_descuento_anual";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "planes_entregas_anual";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "planes_dias_antes";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "planes_categoria_anticipos_id";
  DROP TYPE "public"."enum_far_planes_modalidad";
  DROP TYPE "public"."enum_far_planes_estado";`)
}
