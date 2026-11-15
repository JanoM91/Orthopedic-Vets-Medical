import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_far_pedidos_estado" AS ENUM('pago_pendiente', 'creado', 'pagado', 'receta_por_validar', 'preparando', 'listo_para_recoger', 'en_ruta', 'entregado', 'cancelado', 'expirado');
  CREATE TYPE "public"."enum_far_pedidos_entrega" AS ENUM('recoger', 'domicilio');
  CREATE TYPE "public"."enum_far_pedidos_pago_forma" AS ENUM('al_recoger', 'en_linea');
  CREATE TYPE "public"."enum_far_pedidos_pago_estado" AS ENUM('pendiente', 'pagado', 'reembolso_pendiente');
  ALTER TYPE "public"."enum_farmacia_configuracion_pasarela_activa" ADD VALUE 'prueba';
  CREATE TABLE "far_pedidos_renglones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"presentacion_id" integer NOT NULL,
  	"producto_id" integer NOT NULL,
  	"descripcion" varchar NOT NULL,
  	"grupo" varchar,
  	"cantidad" numeric NOT NULL,
  	"unidades" numeric NOT NULL,
  	"precio_unitario" numeric NOT NULL,
  	"importe" numeric NOT NULL,
  	"receta_id" integer
  );
  
  CREATE TABLE "far_pedidos_historial" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"estado" varchar NOT NULL,
  	"fecha" timestamp(3) with time zone NOT NULL,
  	"por" varchar,
  	"detalle" varchar
  );
  
  CREATE TABLE "far_pedidos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"estado" "enum_far_pedidos_estado" DEFAULT 'creado' NOT NULL,
  	"clave_idempotencia" varchar NOT NULL,
  	"token" varchar NOT NULL,
  	"tutor_id" integer,
  	"cliente_id" integer,
  	"mascota_id" integer,
  	"contacto_nombre" varchar NOT NULL,
  	"contacto_correo" varchar NOT NULL,
  	"contacto_telefono" varchar,
  	"perfil_especie" varchar,
  	"perfil_peso_kg" numeric,
  	"total" numeric NOT NULL,
  	"entrega" "enum_far_pedidos_entrega" DEFAULT 'recoger' NOT NULL,
  	"pago_forma" "enum_far_pedidos_pago_forma" DEFAULT 'al_recoger' NOT NULL,
  	"pago_estado" "enum_far_pedidos_pago_estado" DEFAULT 'pendiente' NOT NULL,
  	"pago_proveedor" varchar,
  	"pago_referencia" varchar,
  	"pago_pagado_en" timestamp(3) with time zone,
  	"expira_en" timestamp(3) with time zone,
  	"venta_id" integer,
  	"notas_cliente" varchar,
  	"motivo_cancelacion" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_pagos_eventos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar NOT NULL,
  	"pedido_id" integer,
  	"tipo" varchar,
  	"resultado" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_pedidos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_pagos_eventos_id" integer;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_pagar_al_recoger" boolean DEFAULT true;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_metodo_pago_en_linea" varchar DEFAULT 'en_linea';
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "tienda_correos_pedidos" varchar;
  ALTER TABLE "far_pedidos_renglones" ADD CONSTRAINT "far_pedidos_renglones_presentacion_id_far_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pedidos_renglones" ADD CONSTRAINT "far_pedidos_renglones_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pedidos_renglones" ADD CONSTRAINT "far_pedidos_renglones_receta_id_far_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."far_recetas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pedidos_renglones" ADD CONSTRAINT "far_pedidos_renglones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."far_pedidos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_pedidos_historial" ADD CONSTRAINT "far_pedidos_historial_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."far_pedidos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_pedidos" ADD CONSTRAINT "far_pedidos_tutor_id_tutores_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pedidos" ADD CONSTRAINT "far_pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pedidos" ADD CONSTRAINT "far_pedidos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pedidos" ADD CONSTRAINT "far_pedidos_venta_id_far_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."far_ventas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_pagos_eventos" ADD CONSTRAINT "far_pagos_eventos_pedido_id_far_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."far_pedidos"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "far_pedidos_renglones_order_idx" ON "far_pedidos_renglones" USING btree ("_order");
  CREATE INDEX "far_pedidos_renglones_parent_id_idx" ON "far_pedidos_renglones" USING btree ("_parent_id");
  CREATE INDEX "far_pedidos_renglones_presentacion_idx" ON "far_pedidos_renglones" USING btree ("presentacion_id");
  CREATE INDEX "far_pedidos_renglones_producto_idx" ON "far_pedidos_renglones" USING btree ("producto_id");
  CREATE INDEX "far_pedidos_renglones_receta_idx" ON "far_pedidos_renglones" USING btree ("receta_id");
  CREATE INDEX "far_pedidos_historial_order_idx" ON "far_pedidos_historial" USING btree ("_order");
  CREATE INDEX "far_pedidos_historial_parent_id_idx" ON "far_pedidos_historial" USING btree ("_parent_id");
  CREATE INDEX "far_pedidos_estado_idx" ON "far_pedidos" USING btree ("estado");
  CREATE UNIQUE INDEX "far_pedidos_clave_idempotencia_idx" ON "far_pedidos" USING btree ("clave_idempotencia");
  CREATE UNIQUE INDEX "far_pedidos_token_idx" ON "far_pedidos" USING btree ("token");
  CREATE INDEX "far_pedidos_tutor_idx" ON "far_pedidos" USING btree ("tutor_id");
  CREATE INDEX "far_pedidos_cliente_idx" ON "far_pedidos" USING btree ("cliente_id");
  CREATE INDEX "far_pedidos_mascota_idx" ON "far_pedidos" USING btree ("mascota_id");
  CREATE INDEX "far_pedidos_pago_pago_referencia_idx" ON "far_pedidos" USING btree ("pago_referencia");
  CREATE INDEX "far_pedidos_expira_en_idx" ON "far_pedidos" USING btree ("expira_en");
  CREATE INDEX "far_pedidos_venta_idx" ON "far_pedidos" USING btree ("venta_id");
  CREATE INDEX "far_pedidos_updated_at_idx" ON "far_pedidos" USING btree ("updated_at");
  CREATE INDEX "far_pedidos_created_at_idx" ON "far_pedidos" USING btree ("created_at");
  CREATE UNIQUE INDEX "far_pagos_eventos_clave_idx" ON "far_pagos_eventos" USING btree ("clave");
  CREATE INDEX "far_pagos_eventos_pedido_idx" ON "far_pagos_eventos" USING btree ("pedido_id");
  CREATE INDEX "far_pagos_eventos_updated_at_idx" ON "far_pagos_eventos" USING btree ("updated_at");
  CREATE INDEX "far_pagos_eventos_created_at_idx" ON "far_pagos_eventos" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_pedidos_fk" FOREIGN KEY ("far_pedidos_id") REFERENCES "public"."far_pedidos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_pagos_eventos_fk" FOREIGN KEY ("far_pagos_eventos_id") REFERENCES "public"."far_pagos_eventos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_far_pedidos_id_idx" ON "payload_locked_documents_rels" USING btree ("far_pedidos_id");
  CREATE INDEX "payload_locked_documents_rels_far_pagos_eventos_id_idx" ON "payload_locked_documents_rels" USING btree ("far_pagos_eventos_id");
  -- Supabase expone public por su API: sin RLS las tablas quedarían abiertas.
  ALTER TABLE "far_pedidos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_pedidos_renglones" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_pedidos_historial" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_pagos_eventos" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "far_pedidos_renglones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_pedidos_historial" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_pedidos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_pagos_eventos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "far_pedidos_renglones" CASCADE;
  DROP TABLE "far_pedidos_historial" CASCADE;
  DROP TABLE "far_pedidos" CASCADE;
  DROP TABLE "far_pagos_eventos" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_pedidos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_pagos_eventos_fk";
  
  ALTER TABLE "farmacia_configuracion" ALTER COLUMN "pasarela_activa" SET DATA TYPE text;
  ALTER TABLE "farmacia_configuracion" ALTER COLUMN "pasarela_activa" SET DEFAULT 'ninguna'::text;
  DROP TYPE "public"."enum_farmacia_configuracion_pasarela_activa";
  CREATE TYPE "public"."enum_farmacia_configuracion_pasarela_activa" AS ENUM('ninguna', 'mercadopago');
  ALTER TABLE "farmacia_configuracion" ALTER COLUMN "pasarela_activa" SET DEFAULT 'ninguna'::"public"."enum_farmacia_configuracion_pasarela_activa";
  ALTER TABLE "farmacia_configuracion" ALTER COLUMN "pasarela_activa" SET DATA TYPE "public"."enum_farmacia_configuracion_pasarela_activa" USING "pasarela_activa"::"public"."enum_farmacia_configuracion_pasarela_activa";
  DROP INDEX "payload_locked_documents_rels_far_pedidos_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_pagos_eventos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_pedidos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_pagos_eventos_id";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_pagar_al_recoger";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_metodo_pago_en_linea";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "tienda_correos_pedidos";
  DROP TYPE "public"."enum_far_pedidos_estado";
  DROP TYPE "public"."enum_far_pedidos_entrega";
  DROP TYPE "public"."enum_far_pedidos_pago_forma";
  DROP TYPE "public"."enum_far_pedidos_pago_estado";`)
}
