import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Farmacia, fase 1 (25-oct-2026, docs/FARMACIA-PROMPT.md): catálogo
 * (far-productos, far-presentaciones, far-almacenes, far-proveedores),
 * inventario por lote (far-lotes, far-movimientos), globales
 * farmacia-configuracion e instalacion-configuracion (módulos activables) y
 * casillas «farmacia_*» en roles.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_far_productos_especies" AS ENUM('perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otra');
  CREATE TYPE "public"."enum_far_productos_linea" AS ENUM('medicamento', 'antiparasitario', 'alimento', 'dieta_prescripcion', 'accesorio', 'higiene', 'suplemento');
  CREATE TYPE "public"."enum_far_productos_grupo" AS ENUM('I', 'II', 'III', 'desregulado');
  CREATE TYPE "public"."enum_far_almacenes_tipo" AS ENUM('farmacia', 'clinica', 'sucursal');
  CREATE TYPE "public"."enum_far_movimientos_tipo" AS ENUM('compra', 'venta', 'ajuste', 'merma', 'traspaso', 'devolucion');
  CREATE TYPE "public"."enum_farmacia_configuracion_pasarela_activa" AS ENUM('ninguna', 'mercadopago');
  CREATE TABLE "far_productos_especies" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_far_productos_especies",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "far_productos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"principio_activo" varchar,
  	"laboratorio" varchar,
  	"linea" "enum_far_productos_linea" DEFAULT 'medicamento' NOT NULL,
  	"grupo" "enum_far_productos_grupo" DEFAULT 'III' NOT NULL,
  	"registro_senasica" varchar,
  	"peso_min_kg" numeric,
  	"peso_max_kg" numeric,
  	"edad_min_meses" numeric,
  	"alergenos" varchar,
  	"unidad_base" varchar DEFAULT 'pieza' NOT NULL,
  	"refrigeracion" boolean DEFAULT false,
  	"duracion_dias" numeric,
  	"descripcion" varchar,
  	"imagen_url" varchar,
  	"publicado_tienda" boolean DEFAULT false,
  	"minimo_inventario" numeric DEFAULT 0,
  	"punto_reorden_propuesto" numeric,
  	"punto_reorden_aceptado" numeric,
  	"proveedor_preferente_id" integer,
  	"activo" boolean DEFAULT true,
  	"notas_internas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_presentaciones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"producto_id" integer NOT NULL,
  	"nombre" varchar NOT NULL,
  	"factor" numeric DEFAULT 1 NOT NULL,
  	"precio" numeric NOT NULL,
  	"codigo_barras" varchar,
  	"fraccionada" boolean DEFAULT false,
  	"activa" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_almacenes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"tipo" "enum_far_almacenes_tipo" DEFAULT 'farmacia' NOT NULL,
  	"activo" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_proveedores" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"rfc" varchar,
  	"dias_entrega" numeric DEFAULT 3,
  	"contacto_nombre" varchar,
  	"contacto_telefono" varchar,
  	"contacto_correo" varchar,
  	"notas" varchar,
  	"activo" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_lotes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"producto_id" integer NOT NULL,
  	"almacen_id" integer NOT NULL,
  	"numero_lote" varchar NOT NULL,
  	"caducidad" varchar NOT NULL,
  	"cantidad_recibida" numeric NOT NULL,
  	"existencia" numeric DEFAULT 0 NOT NULL,
  	"costo_unidad" numeric,
  	"referencia" varchar,
  	"bloqueado" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "far_movimientos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tipo" "enum_far_movimientos_tipo" NOT NULL,
  	"producto_id" integer NOT NULL,
  	"lote_id" integer NOT NULL,
  	"almacen_id" integer NOT NULL,
  	"cantidad" numeric NOT NULL,
  	"costo_unidad" numeric,
  	"dia" varchar NOT NULL,
  	"referencia" varchar,
  	"motivo" varchar,
  	"usuario_id" integer,
  	"existencia_despues" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "farmacia_configuracion_promociones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"dias_antes" numeric NOT NULL,
  	"descuento_porciento" numeric NOT NULL
  );
  
  CREATE TABLE "farmacia_configuracion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"caducidad_medicamentos" numeric DEFAULT 90,
  	"caducidad_alimento" numeric DEFAULT 60,
  	"caducidad_otros" numeric DEFAULT 60,
  	"caducidad_urgente" numeric DEFAULT 30,
  	"horas_apartado" numeric DEFAULT 24,
  	"cierre_dia_activo" boolean DEFAULT true,
  	"receta_grupo_i_i_domicilio" boolean DEFAULT false,
  	"aprendizaje_semanas_historial" numeric DEFAULT 8,
  	"aprendizaje_dias_cobertura" numeric DEFAULT 30,
  	"aprendizaje_dias_entrega_por_omision" numeric DEFAULT 3,
  	"politica_devoluciones" varchar,
  	"almacen_por_omision_id" integer,
  	"finanzas_area_id" integer,
  	"finanzas_categoria_ventas_id" integer,
  	"finanzas_categoria_compras_id" integer,
  	"pasarela_activa" "enum_farmacia_configuracion_pasarela_activa" DEFAULT 'ninguna',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "instalacion_configuracion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"modulos_clinica" boolean DEFAULT true,
  	"modulos_farmacia" boolean DEFAULT true,
  	"modulos_tienda" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "roles" ADD COLUMN "farmacia_vender" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_ver_costos" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_descuentos" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_catalogo" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_recibir_compras" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_ajustes" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_recetas" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_aprobar" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_asignar_repartidor" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_entregas" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_cierre_dia" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_reportes" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "farmacia_configurar" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_productos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_presentaciones_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_almacenes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_proveedores_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_lotes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "far_movimientos_id" integer;
  ALTER TABLE "far_productos_especies" ADD CONSTRAINT "far_productos_especies_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."far_productos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "far_productos" ADD CONSTRAINT "far_productos_proveedor_preferente_id_far_proveedores_id_fk" FOREIGN KEY ("proveedor_preferente_id") REFERENCES "public"."far_proveedores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_presentaciones" ADD CONSTRAINT "far_presentaciones_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_lotes" ADD CONSTRAINT "far_lotes_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_lotes" ADD CONSTRAINT "far_lotes_almacen_id_far_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."far_almacenes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_movimientos" ADD CONSTRAINT "far_movimientos_producto_id_far_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."far_productos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_movimientos" ADD CONSTRAINT "far_movimientos_lote_id_far_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."far_lotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_movimientos" ADD CONSTRAINT "far_movimientos_almacen_id_far_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."far_almacenes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "far_movimientos" ADD CONSTRAINT "far_movimientos_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion_promociones" ADD CONSTRAINT "farmacia_configuracion_promociones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."farmacia_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion" ADD CONSTRAINT "farmacia_configuracion_almacen_por_omision_id_far_almacenes_id_fk" FOREIGN KEY ("almacen_por_omision_id") REFERENCES "public"."far_almacenes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion" ADD CONSTRAINT "farmacia_configuracion_finanzas_area_id_fin_actividades_id_fk" FOREIGN KEY ("finanzas_area_id") REFERENCES "public"."fin_actividades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion" ADD CONSTRAINT "farmacia_configuracion_finanzas_categoria_ventas_id_fin_categorias_id_fk" FOREIGN KEY ("finanzas_categoria_ventas_id") REFERENCES "public"."fin_categorias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "farmacia_configuracion" ADD CONSTRAINT "farmacia_configuracion_finanzas_categoria_compras_id_fin_categorias_id_fk" FOREIGN KEY ("finanzas_categoria_compras_id") REFERENCES "public"."fin_categorias"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "far_productos_especies_order_idx" ON "far_productos_especies" USING btree ("order");
  CREATE INDEX "far_productos_especies_parent_idx" ON "far_productos_especies" USING btree ("parent_id");
  CREATE INDEX "far_productos_nombre_idx" ON "far_productos" USING btree ("nombre");
  CREATE INDEX "far_productos_principio_activo_idx" ON "far_productos" USING btree ("principio_activo");
  CREATE INDEX "far_productos_linea_idx" ON "far_productos" USING btree ("linea");
  CREATE INDEX "far_productos_grupo_idx" ON "far_productos" USING btree ("grupo");
  CREATE INDEX "far_productos_publicado_tienda_idx" ON "far_productos" USING btree ("publicado_tienda");
  CREATE INDEX "far_productos_proveedor_preferente_idx" ON "far_productos" USING btree ("proveedor_preferente_id");
  CREATE INDEX "far_productos_activo_idx" ON "far_productos" USING btree ("activo");
  CREATE INDEX "far_productos_updated_at_idx" ON "far_productos" USING btree ("updated_at");
  CREATE INDEX "far_productos_created_at_idx" ON "far_productos" USING btree ("created_at");
  CREATE INDEX "far_presentaciones_producto_idx" ON "far_presentaciones" USING btree ("producto_id");
  CREATE INDEX "far_presentaciones_codigo_barras_idx" ON "far_presentaciones" USING btree ("codigo_barras");
  CREATE INDEX "far_presentaciones_updated_at_idx" ON "far_presentaciones" USING btree ("updated_at");
  CREATE INDEX "far_presentaciones_created_at_idx" ON "far_presentaciones" USING btree ("created_at");
  CREATE UNIQUE INDEX "far_almacenes_nombre_idx" ON "far_almacenes" USING btree ("nombre");
  CREATE INDEX "far_almacenes_updated_at_idx" ON "far_almacenes" USING btree ("updated_at");
  CREATE INDEX "far_almacenes_created_at_idx" ON "far_almacenes" USING btree ("created_at");
  CREATE UNIQUE INDEX "far_proveedores_nombre_idx" ON "far_proveedores" USING btree ("nombre");
  CREATE INDEX "far_proveedores_rfc_idx" ON "far_proveedores" USING btree ("rfc");
  CREATE INDEX "far_proveedores_updated_at_idx" ON "far_proveedores" USING btree ("updated_at");
  CREATE INDEX "far_proveedores_created_at_idx" ON "far_proveedores" USING btree ("created_at");
  CREATE INDEX "far_lotes_producto_idx" ON "far_lotes" USING btree ("producto_id");
  CREATE INDEX "far_lotes_almacen_idx" ON "far_lotes" USING btree ("almacen_id");
  CREATE INDEX "far_lotes_numero_lote_idx" ON "far_lotes" USING btree ("numero_lote");
  CREATE INDEX "far_lotes_caducidad_idx" ON "far_lotes" USING btree ("caducidad");
  CREATE INDEX "far_lotes_existencia_idx" ON "far_lotes" USING btree ("existencia");
  CREATE INDEX "far_lotes_updated_at_idx" ON "far_lotes" USING btree ("updated_at");
  CREATE INDEX "far_lotes_created_at_idx" ON "far_lotes" USING btree ("created_at");
  CREATE INDEX "far_movimientos_tipo_idx" ON "far_movimientos" USING btree ("tipo");
  CREATE INDEX "far_movimientos_producto_idx" ON "far_movimientos" USING btree ("producto_id");
  CREATE INDEX "far_movimientos_lote_idx" ON "far_movimientos" USING btree ("lote_id");
  CREATE INDEX "far_movimientos_almacen_idx" ON "far_movimientos" USING btree ("almacen_id");
  CREATE INDEX "far_movimientos_dia_idx" ON "far_movimientos" USING btree ("dia");
  CREATE INDEX "far_movimientos_referencia_idx" ON "far_movimientos" USING btree ("referencia");
  CREATE INDEX "far_movimientos_usuario_idx" ON "far_movimientos" USING btree ("usuario_id");
  CREATE INDEX "far_movimientos_updated_at_idx" ON "far_movimientos" USING btree ("updated_at");
  CREATE INDEX "far_movimientos_created_at_idx" ON "far_movimientos" USING btree ("created_at");
  CREATE INDEX "farmacia_configuracion_promociones_order_idx" ON "farmacia_configuracion_promociones" USING btree ("_order");
  CREATE INDEX "farmacia_configuracion_promociones_parent_id_idx" ON "farmacia_configuracion_promociones" USING btree ("_parent_id");
  CREATE INDEX "farmacia_configuracion_almacen_por_omision_idx" ON "farmacia_configuracion" USING btree ("almacen_por_omision_id");
  CREATE INDEX "farmacia_configuracion_finanzas_finanzas_area_idx" ON "farmacia_configuracion" USING btree ("finanzas_area_id");
  CREATE INDEX "farmacia_configuracion_finanzas_finanzas_categoria_venta_idx" ON "farmacia_configuracion" USING btree ("finanzas_categoria_ventas_id");
  CREATE INDEX "farmacia_configuracion_finanzas_finanzas_categoria_compr_idx" ON "farmacia_configuracion" USING btree ("finanzas_categoria_compras_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_productos_fk" FOREIGN KEY ("far_productos_id") REFERENCES "public"."far_productos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_presentaciones_fk" FOREIGN KEY ("far_presentaciones_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_almacenes_fk" FOREIGN KEY ("far_almacenes_id") REFERENCES "public"."far_almacenes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_proveedores_fk" FOREIGN KEY ("far_proveedores_id") REFERENCES "public"."far_proveedores"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_lotes_fk" FOREIGN KEY ("far_lotes_id") REFERENCES "public"."far_lotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_far_movimientos_fk" FOREIGN KEY ("far_movimientos_id") REFERENCES "public"."far_movimientos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_far_productos_id_idx" ON "payload_locked_documents_rels" USING btree ("far_productos_id");
  CREATE INDEX "payload_locked_documents_rels_far_presentaciones_id_idx" ON "payload_locked_documents_rels" USING btree ("far_presentaciones_id");
  CREATE INDEX "payload_locked_documents_rels_far_almacenes_id_idx" ON "payload_locked_documents_rels" USING btree ("far_almacenes_id");
  CREATE INDEX "payload_locked_documents_rels_far_proveedores_id_idx" ON "payload_locked_documents_rels" USING btree ("far_proveedores_id");
  CREATE INDEX "payload_locked_documents_rels_far_lotes_id_idx" ON "payload_locked_documents_rels" USING btree ("far_lotes_id");
  CREATE INDEX "payload_locked_documents_rels_far_movimientos_id_idx" ON "payload_locked_documents_rels" USING btree ("far_movimientos_id");`)
  await activarRls({ db })
}

/** Toda tabla nueva nace con RLS (Supabase expone `public` por su API). Ver migrations/20261011_210000_rls_supabase.ts. */
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
   ALTER TABLE "far_productos_especies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_productos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_presentaciones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_almacenes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_proveedores" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_lotes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "far_movimientos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "farmacia_configuracion_promociones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "farmacia_configuracion" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "instalacion_configuracion" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "far_productos_especies" CASCADE;
  DROP TABLE "far_productos" CASCADE;
  DROP TABLE "far_presentaciones" CASCADE;
  DROP TABLE "far_almacenes" CASCADE;
  DROP TABLE "far_proveedores" CASCADE;
  DROP TABLE "far_lotes" CASCADE;
  DROP TABLE "far_movimientos" CASCADE;
  DROP TABLE "farmacia_configuracion_promociones" CASCADE;
  DROP TABLE "farmacia_configuracion" CASCADE;
  DROP TABLE "instalacion_configuracion" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_productos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_presentaciones_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_almacenes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_proveedores_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_lotes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_far_movimientos_fk";
  
  DROP INDEX "payload_locked_documents_rels_far_productos_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_presentaciones_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_almacenes_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_proveedores_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_lotes_id_idx";
  DROP INDEX "payload_locked_documents_rels_far_movimientos_id_idx";
  ALTER TABLE "roles" DROP COLUMN "farmacia_vender";
  ALTER TABLE "roles" DROP COLUMN "farmacia_ver_costos";
  ALTER TABLE "roles" DROP COLUMN "farmacia_descuentos";
  ALTER TABLE "roles" DROP COLUMN "farmacia_catalogo";
  ALTER TABLE "roles" DROP COLUMN "farmacia_recibir_compras";
  ALTER TABLE "roles" DROP COLUMN "farmacia_ajustes";
  ALTER TABLE "roles" DROP COLUMN "farmacia_recetas";
  ALTER TABLE "roles" DROP COLUMN "farmacia_aprobar";
  ALTER TABLE "roles" DROP COLUMN "farmacia_asignar_repartidor";
  ALTER TABLE "roles" DROP COLUMN "farmacia_entregas";
  ALTER TABLE "roles" DROP COLUMN "farmacia_cierre_dia";
  ALTER TABLE "roles" DROP COLUMN "farmacia_reportes";
  ALTER TABLE "roles" DROP COLUMN "farmacia_configurar";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_productos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_presentaciones_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_almacenes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_proveedores_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_lotes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "far_movimientos_id";
  DROP TYPE "public"."enum_far_productos_especies";
  DROP TYPE "public"."enum_far_productos_linea";
  DROP TYPE "public"."enum_far_productos_grupo";
  DROP TYPE "public"."enum_far_almacenes_tipo";
  DROP TYPE "public"."enum_far_movimientos_tipo";
  DROP TYPE "public"."enum_farmacia_configuracion_pasarela_activa";`)
}
