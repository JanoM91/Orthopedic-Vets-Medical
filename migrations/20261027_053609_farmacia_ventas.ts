import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Farmacia, fase 3 (27-oct-2026): ventas, recetas, libro de control Grupo I, cierres del día, métodos de pago y cédula del MVZ. */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_far_recetas_origen" AS ENUM('interna', 'externa');
  CREATE TYPE "public"."enum_far_recetas_estado" AS ENUM('borrador', 'por_validar', 'valida', 'rechazada', 'cancelada');
  CREATE TYPE "public"."enum_far_ventas_pagos_estado" AS ENUM('confirmado', 'por_confirmar');
  CREATE TYPE "public"."enum_far_ventas_canal" AS ENUM('mostrador', 'tienda');
  CREATE TYPE "public"."enum_far_ventas_estado" AS ENUM('pagada', 'por_confirmar', 'anulada');
  CREATE TYPE "public"."enum_far_libro_control_tipo" AS ENUM('salida', 'cancelacion');
  CREATE TYPE "public"."enum_farmacia_configuracion_metodos_pago_tipo" AS ENUM('efectivo', 'terminal', 'transferencia', 'otro');
  CREATE TABLE "far_recetas_renglones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"producto_id" integer,
  	"principio" varchar,
  	"dosis" varchar,
  	"frecuencia" varchar,
  	"duracion" varchar,
  	"surtidos_permitidos" numeric DEFAULT 1,
  	"surtidos_usados" numeric DEFAULT 0
  );
  
  CREATE TABLE "far_recetas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"origen" "enum_far_recetas_origen" NOT NULL,
  	"estado" "enum_far_recetas_estado" DEFAULT 'borrador' NOT NULL,
  	"mascota_id" integer,
  	"cliente_id" integer,
  	"paciente_texto" varchar,
  	"nota_id" integer,
  	"mvz_nombre" varchar NOT NULL,
  	"mvz_cedula" varchar,
  	"emitida_por_id" integer,
  	"fecha_emision" varchar NOT NULL,
  	"vigente_hasta" varchar NOT NULL,
  	"folio_cuantificado" varchar,
  	"peso_kg" numeric,
  	"indicaciones" varchar,
  	"archivo" varchar,
  	"archivo_nombre" varchar,
  	"firmada_por_id" integer,
  	"firmada_en" timestamp(3) with time zone,
  	"validada_por_id" integer,
  	"validada_en" timestamp(3) with time zone,
  	"motivo_rechazo" varchar,
  	"original_recibido" boolean DEFAULT false,
  	"original_recibido_por_id" integer,
  	"original_recibido_en" timestamp(3) with time zone,
  	"capturada_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_ventas_renglones_lotes" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"lote_id" integer NOT NULL,
  	"numero_lote" varchar,
  	"caducidad" varchar,
  	"unidades" numeric NOT NULL
  );
  
  CREATE TABLE "far_ventas_renglones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"presentacion_id" integer NOT NULL,
  	"producto_id" integer NOT NULL,
  	"descripcion" varchar NOT NULL,
  	"grupo" varchar,
  	"cantidad" numeric NOT NULL,
  	"factor" numeric NOT NULL,
  	"unidades" numeric NOT NULL,
  	"precio_unitario" numeric NOT NULL,
  	"descuento_porciento" numeric DEFAULT 0,
  	"importe" numeric NOT NULL,
  	"costo" numeric,
  	"receta_id" integer,
  	"folio_cuantificado" varchar,
  	"autorizacion_mascota" varchar
  );
  
  CREATE TABLE "far_ventas_pagos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"metodo" varchar NOT NULL,
  	"etiqueta" varchar,
  	"tipo" varchar,
  	"monto" numeric NOT NULL,
  	"recibido" numeric,
  	"cambio" numeric,
  	"cuenta_id" integer,
  	"referencia" varchar,
  	"estado" "enum_far_ventas_pagos_estado" DEFAULT 'confirmado' NOT NULL,
  	"confirmado_por_id" integer,
  	"confirmado_en" timestamp(3) with time zone
  );
  
  CREATE TABLE "far_ventas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"canal" "enum_far_ventas_canal" DEFAULT 'mostrador' NOT NULL,
  	"estado" "enum_far_ventas_estado" DEFAULT 'pagada' NOT NULL,
  	"clave_idempotencia" varchar NOT NULL,
  	"dia" varchar NOT NULL,
  	"almacen_id" integer,
  	"cliente_id" integer,
  	"mascota_id" integer,
  	"peso_usado_kg" numeric,
  	"subtotal" numeric NOT NULL,
  	"descuento" numeric DEFAULT 0,
  	"total" numeric NOT NULL,
  	"costo_total" numeric,
  	"vendedor_id" integer,
  	"autorizo_descuento_id" integer,
  	"autorizo_id" integer,
  	"ingreso_finanzas_id" integer,
  	"correo_ticket" varchar,
  	"notas" varchar,
  	"anulada_por_id" integer,
  	"anulada_en" timestamp(3) with time zone,
  	"motivo_anulacion" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_libro_control" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tipo" "enum_far_libro_control_tipo" DEFAULT 'salida' NOT NULL,
  	"venta_id" integer,
  	"laboratorio" varchar,
  	"producto" varchar NOT NULL,
  	"producto_ref_id" integer,
  	"registro_senasica" varchar,
  	"lote_id" integer,
  	"numero_lote" varchar,
  	"fecha_compra" varchar,
  	"folio_receta" varchar NOT NULL,
  	"receta_id" integer,
  	"mvz" varchar,
  	"fecha_uso" varchar NOT NULL,
  	"cantidad" numeric NOT NULL,
  	"unidad" varchar,
  	"animal" varchar,
  	"mascota_id" integer,
  	"usuario_id" integer,
  	"motivo" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_cierres_dia" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar NOT NULL,
  	"fecha" varchar NOT NULL,
  	"cuenta_id" integer NOT NULL,
  	"esperado" numeric NOT NULL,
  	"contado" numeric NOT NULL,
  	"diferencia" numeric NOT NULL,
  	"ventas_efectivo" numeric,
  	"ventas" numeric,
  	"nota" varchar,
  	"usuario_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "farmacia_configuracion_metodos_pago" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"clave" varchar NOT NULL,
  	"nombre" varchar NOT NULL,
  	"tipo" "enum_farmacia_configuracion_metodos_pago_tipo" DEFAULT 'otro' NOT NULL,
  	"cuenta_id" integer,
  	"por_confirmar" boolean DEFAULT false,
  	"activo" boolean DEFAULT true
  );
  
  ALTER TABLE "users" ADD COLUMN "cedula_profesional" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_recetas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_ventas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_libro_control_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_cierres_dia_id" integer;
  ALTER TABLE "farmacia_configuracion" ADD COLUMN "exigir_original_grupo_i_i" boolean DEFAULT false;
  ALTER TABLE "far_recetas_renglones" ADD CONSTRAINT "far_recetas_renglones_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recetas_renglones" ADD CONSTRAINT "far_recetas_renglones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."far_recetas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_recetas" ADD CONSTRAINT "far_recetas_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recetas" ADD CONSTRAINT "far_recetas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recetas" ADD CONSTRAINT "far_recetas_nota_id_mas_notas_id_fk" FOREIGN KEY ("nota_id") REFERENCES "public"."mas_notas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recetas" ADD CONSTRAINT "far_recetas_emitida_por_id_users_id_fk" FOREIGN KEY ("emitida_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recetas" ADD CONSTRAINT "far_recetas_firmada_por_id_users_id_fk" FOREIGN KEY ("firmada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recetas" ADD CONSTRAINT "far_recetas_validada_por_id_users_id_fk" FOREIGN KEY ("validada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recetas" ADD CONSTRAINT "far_recetas_original_recibido_por_id_users_id_fk" FOREIGN KEY ("original_recibido_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_recetas" ADD CONSTRAINT "far_recetas_capturada_por_id_users_id_fk" FOREIGN KEY ("capturada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas_renglones_lotes" ADD CONSTRAINT "far_ventas_renglones_lotes_lote_id_far_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."far_lotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas_renglones_lotes" ADD CONSTRAINT "far_ventas_renglones_lotes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."far_ventas_renglones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_ventas_renglones" ADD CONSTRAINT "far_ventas_renglones_presentacion_id_far_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas_renglones" ADD CONSTRAINT "far_ventas_renglones_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas_renglones" ADD CONSTRAINT "far_ventas_renglones_receta_id_far_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."far_recetas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas_renglones" ADD CONSTRAINT "far_ventas_renglones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."far_ventas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_ventas_pagos" ADD CONSTRAINT "far_ventas_pagos_cuenta_id_fin_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."fin_cuentas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas_pagos" ADD CONSTRAINT "far_ventas_pagos_confirmado_por_id_users_id_fk" FOREIGN KEY ("confirmado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas_pagos" ADD CONSTRAINT "far_ventas_pagos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."far_ventas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_almacen_id_far_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."far_almacenes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_vendedor_id_users_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_autorizo_descuento_id_users_id_fk" FOREIGN KEY ("autorizo_descuento_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_autorizo_id_users_id_fk" FOREIGN KEY ("autorizo_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_ingreso_finanzas_id_fin_operaciones_id_fk" FOREIGN KEY ("ingreso_finanzas_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_ventas" ADD CONSTRAINT "far_ventas_anulada_por_id_users_id_fk" FOREIGN KEY ("anulada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_libro_control" ADD CONSTRAINT "far_libro_control_venta_id_far_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."far_ventas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_libro_control" ADD CONSTRAINT "far_libro_control_producto_ref_id_far_productos_id_fk" FOREIGN KEY ("producto_ref_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_libro_control" ADD CONSTRAINT "far_libro_control_lote_id_far_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."far_lotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_libro_control" ADD CONSTRAINT "far_libro_control_receta_id_far_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."far_recetas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_libro_control" ADD CONSTRAINT "far_libro_control_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_libro_control" ADD CONSTRAINT "far_libro_control_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_cierres_dia" ADD CONSTRAINT "far_cierres_dia_cuenta_id_fin_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."fin_cuentas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_cierres_dia" ADD CONSTRAINT "far_cierres_dia_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion_metodos_pago" ADD CONSTRAINT "farmacia_configuracion_metodos_pago_cuenta_id_fin_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."fin_cuentas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion_metodos_pago" ADD CONSTRAINT "farmacia_configuracion_metodos_pago_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."farmacia_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "far_recetas_renglones_order_idx" ON "far_recetas_renglones" USING btree ("_order");
  CREATE INDEX "far_recetas_renglones_parent_id_idx" ON "far_recetas_renglones" USING btree ("_parent_id");
  CREATE INDEX "far_recetas_renglones_producto_idx" ON "far_recetas_renglones" USING btree ("producto_id");
  CREATE INDEX "far_recetas_origen_idx" ON "far_recetas" USING btree ("origen");
  CREATE INDEX "far_recetas_estado_idx" ON "far_recetas" USING btree ("estado");
  CREATE INDEX "far_recetas_mascota_idx" ON "far_recetas" USING btree ("mascota_id");
  CREATE INDEX "far_recetas_cliente_idx" ON "far_recetas" USING btree ("cliente_id");
  CREATE INDEX "far_recetas_nota_idx" ON "far_recetas" USING btree ("nota_id");
  CREATE INDEX "far_recetas_emitida_por_idx" ON "far_recetas" USING btree ("emitida_por_id");
  CREATE INDEX "far_recetas_vigente_hasta_idx" ON "far_recetas" USING btree ("vigente_hasta");
  CREATE INDEX "far_recetas_folio_cuantificado_idx" ON "far_recetas" USING btree ("folio_cuantificado");
  CREATE INDEX "far_recetas_firmada_por_idx" ON "far_recetas" USING btree ("firmada_por_id");
  CREATE INDEX "far_recetas_validada_por_idx" ON "far_recetas" USING btree ("validada_por_id");
  CREATE INDEX "far_recetas_original_recibido_por_idx" ON "far_recetas" USING btree ("original_recibido_por_id");
  CREATE INDEX "far_recetas_capturada_por_idx" ON "far_recetas" USING btree ("capturada_por_id");
  CREATE INDEX "far_recetas_updated_at_idx" ON "far_recetas" USING btree ("updated_at");
  CREATE INDEX "far_recetas_created_at_idx" ON "far_recetas" USING btree ("created_at");
  CREATE INDEX "far_ventas_renglones_lotes_order_idx" ON "far_ventas_renglones_lotes" USING btree ("_order");
  CREATE INDEX "far_ventas_renglones_lotes_parent_id_idx" ON "far_ventas_renglones_lotes" USING btree ("_parent_id");
  CREATE INDEX "far_ventas_renglones_lotes_lote_idx" ON "far_ventas_renglones_lotes" USING btree ("lote_id");
  CREATE INDEX "far_ventas_renglones_order_idx" ON "far_ventas_renglones" USING btree ("_order");
  CREATE INDEX "far_ventas_renglones_parent_id_idx" ON "far_ventas_renglones" USING btree ("_parent_id");
  CREATE INDEX "far_ventas_renglones_presentacion_idx" ON "far_ventas_renglones" USING btree ("presentacion_id");
  CREATE INDEX "far_ventas_renglones_producto_idx" ON "far_ventas_renglones" USING btree ("producto_id");
  CREATE INDEX "far_ventas_renglones_receta_idx" ON "far_ventas_renglones" USING btree ("receta_id");
  CREATE INDEX "far_ventas_pagos_order_idx" ON "far_ventas_pagos" USING btree ("_order");
  CREATE INDEX "far_ventas_pagos_parent_id_idx" ON "far_ventas_pagos" USING btree ("_parent_id");
  CREATE INDEX "far_ventas_pagos_cuenta_idx" ON "far_ventas_pagos" USING btree ("cuenta_id");
  CREATE INDEX "far_ventas_pagos_confirmado_por_idx" ON "far_ventas_pagos" USING btree ("confirmado_por_id");
  CREATE INDEX "far_ventas_estado_idx" ON "far_ventas" USING btree ("estado");
  CREATE UNIQUE INDEX "far_ventas_clave_idempotencia_idx" ON "far_ventas" USING btree ("clave_idempotencia");
  CREATE INDEX "far_ventas_dia_idx" ON "far_ventas" USING btree ("dia");
  CREATE INDEX "far_ventas_almacen_idx" ON "far_ventas" USING btree ("almacen_id");
  CREATE INDEX "far_ventas_cliente_idx" ON "far_ventas" USING btree ("cliente_id");
  CREATE INDEX "far_ventas_mascota_idx" ON "far_ventas" USING btree ("mascota_id");
  CREATE INDEX "far_ventas_total_idx" ON "far_ventas" USING btree ("total");
  CREATE INDEX "far_ventas_vendedor_idx" ON "far_ventas" USING btree ("vendedor_id");
  CREATE INDEX "far_ventas_autorizo_descuento_idx" ON "far_ventas" USING btree ("autorizo_descuento_id");
  CREATE INDEX "far_ventas_autorizo_idx" ON "far_ventas" USING btree ("autorizo_id");
  CREATE INDEX "far_ventas_ingreso_finanzas_idx" ON "far_ventas" USING btree ("ingreso_finanzas_id");
  CREATE INDEX "far_ventas_anulada_por_idx" ON "far_ventas" USING btree ("anulada_por_id");
  CREATE INDEX "far_ventas_updated_at_idx" ON "far_ventas" USING btree ("updated_at");
  CREATE INDEX "far_ventas_created_at_idx" ON "far_ventas" USING btree ("created_at");
  CREATE INDEX "far_libro_control_venta_idx" ON "far_libro_control" USING btree ("venta_id");
  CREATE INDEX "far_libro_control_producto_ref_idx" ON "far_libro_control" USING btree ("producto_ref_id");
  CREATE INDEX "far_libro_control_lote_idx" ON "far_libro_control" USING btree ("lote_id");
  CREATE INDEX "far_libro_control_receta_idx" ON "far_libro_control" USING btree ("receta_id");
  CREATE INDEX "far_libro_control_fecha_uso_idx" ON "far_libro_control" USING btree ("fecha_uso");
  CREATE INDEX "far_libro_control_mascota_idx" ON "far_libro_control" USING btree ("mascota_id");
  CREATE INDEX "far_libro_control_usuario_idx" ON "far_libro_control" USING btree ("usuario_id");
  CREATE INDEX "far_libro_control_updated_at_idx" ON "far_libro_control" USING btree ("updated_at");
  CREATE INDEX "far_libro_control_created_at_idx" ON "far_libro_control" USING btree ("created_at");
  CREATE UNIQUE INDEX "far_cierres_dia_clave_idx" ON "far_cierres_dia" USING btree ("clave");
  CREATE INDEX "far_cierres_dia_fecha_idx" ON "far_cierres_dia" USING btree ("fecha");
  CREATE INDEX "far_cierres_dia_cuenta_idx" ON "far_cierres_dia" USING btree ("cuenta_id");
  CREATE INDEX "far_cierres_dia_usuario_idx" ON "far_cierres_dia" USING btree ("usuario_id");
  CREATE INDEX "far_cierres_dia_updated_at_idx" ON "far_cierres_dia" USING btree ("updated_at");
  CREATE INDEX "far_cierres_dia_created_at_idx" ON "far_cierres_dia" USING btree ("created_at");
  CREATE INDEX "farmacia_configuracion_metodos_pago_order_idx" ON "farmacia_configuracion_metodos_pago" USING btree ("_order");
  CREATE INDEX "farmacia_configuracion_metodos_pago_parent_id_idx" ON "farmacia_configuracion_metodos_pago" USING btree ("_parent_id");
  CREATE INDEX "farmacia_configuracion_metodos_pago_cuenta_idx" ON "farmacia_configuracion_metodos_pago" USING btree ("cuenta_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_recetas_fk" FOREIGN KEY ("far_recetas_id") REFERENCES "public"."far_recetas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_ventas_fk" FOREIGN KEY ("far_ventas_id") REFERENCES "public"."far_ventas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_libro_control_fk" FOREIGN KEY ("far_libro_control_id") REFERENCES "public"."far_libro_control"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_cierres_dia_fk" FOREIGN KEY ("far_cierres_dia_id") REFERENCES "public"."far_cierres_dia"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_far_recetas_id_idx" ON "payload_locked_documents_rels" USING btree ("far_recetas_id");
  CREATE INDEX "payload_locked_documents_rels_far_ventas_id_idx" ON "payload_locked_documents_rels" USING btree ("far_ventas_id");
  CREATE INDEX "payload_locked_documents_rels_far_libro_control_id_idx" ON "payload_locked_documents_rels" USING btree ("far_libro_control_id");
  CREATE INDEX "payload_locked_documents_rels_far_cierres_dia_id_idx" ON "payload_locked_documents_rels" USING btree ("far_cierres_dia_id");`)
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
   ALTER TABLE "far_recetas_renglones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_recetas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_ventas_renglones_lotes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_ventas_renglones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_ventas_pagos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_ventas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_libro_control" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_cierres_dia" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "farmacia_configuracion_metodos_pago" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "far_recetas_renglones" CASCADE;
  DROP TABLE "far_recetas" CASCADE;
  DROP TABLE "far_ventas_renglones_lotes" CASCADE;
  DROP TABLE "far_ventas_renglones" CASCADE;
  DROP TABLE "far_ventas_pagos" CASCADE;
  DROP TABLE "far_ventas" CASCADE;
  DROP TABLE "far_libro_control" CASCADE;
  DROP TABLE "far_cierres_dia" CASCADE;
  DROP TABLE "farmacia_configuracion_metodos_pago" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_recetas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_ventas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_libro_control_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_cierres_dia_fk";
  
  DROP INDEX "payload_locked_documents_rels_far_recetas_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_ventas_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_libro_control_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_cierres_dia_id_idx";
  ALTER TABLE "users" DROP COLUMN "cedula_profesional";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_recetas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_ventas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_libro_control_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_cierres_dia_id";
  ALTER TABLE "farmacia_configuracion" DROP COLUMN "exigir_original_grupo_i_i";
  DROP TYPE "public"."enum_far_recetas_origen";
  DROP TYPE "public"."enum_far_recetas_estado";
  DROP TYPE "public"."enum_far_ventas_pagos_estado";
  DROP TYPE "public"."enum_far_ventas_canal";
  DROP TYPE "public"."enum_far_ventas_estado";
  DROP TYPE "public"."enum_far_libro_control_tipo";
  DROP TYPE "public"."enum_farmacia_configuracion_metodos_pago_tipo";`)
}
