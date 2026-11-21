import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_paquetes_contenido_tipo" AS ENUM('servicio', 'producto');
  CREATE TYPE "public"."enum_paq_vendidos_renglones_tipo" AS ENUM('servicio', 'producto');
  CREATE TYPE "public"."enum_paq_vendidos_estado" AS ENUM('activo', 'cancelado');
  CREATE TYPE "public"."enum_paq_usos_origen" AS ENUM('cita', 'manual', 'entrega');
  ALTER TYPE "public"."enum_solicitudes_estado" ADD VALUE 'vendida' BEFORE 'descartada';
  CREATE TABLE "paquetes_contenido" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tipo" "enum_paquetes_contenido_tipo" DEFAULT 'servicio' NOT NULL,
  	"cantidad" numeric DEFAULT 1 NOT NULL,
  	"servicio_id" integer,
  	"presentacion_id" integer
  );
  
  CREATE TABLE "paquetes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"descripcion" varchar,
  	"precio" numeric NOT NULL,
  	"vigencia_dias" numeric,
  	"precios_talla_chico" numeric,
  	"precios_talla_mediano" numeric,
  	"precios_talla_grande" numeric,
  	"precios_talla_gigante" numeric,
  	"activo" boolean DEFAULT true,
  	"en_linea" boolean DEFAULT true,
  	"orden" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "paq_vendidos_renglones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tipo" "enum_paq_vendidos_renglones_tipo" NOT NULL,
  	"servicio_id" integer,
  	"presentacion_id" integer,
  	"nombre" varchar NOT NULL,
  	"total" numeric NOT NULL
  );
  
  CREATE TABLE "paq_vendidos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"paquete_id" integer NOT NULL,
  	"nombre" varchar NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"cliente_id" integer,
  	"precio" numeric NOT NULL,
  	"talla" varchar,
  	"fecha" varchar NOT NULL,
  	"vence" varchar,
  	"estado" "enum_paq_vendidos_estado" DEFAULT 'activo' NOT NULL,
  	"cargo_finanzas_id" integer,
  	"solicitud_id" integer,
  	"vendido_por_id" integer,
  	"notas" varchar,
  	"motivo_cancelacion" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "paq_usos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"vendido_id" integer NOT NULL,
  	"renglon" numeric NOT NULL,
  	"cantidad" numeric NOT NULL,
  	"fecha" varchar NOT NULL,
  	"origen" "enum_paq_usos_origen" NOT NULL,
  	"cita_id" integer,
  	"venta_id" integer,
  	"por" varchar,
  	"nota" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "citas" ADD COLUMN "paquete_id" integer;
  ALTER TABLE "solicitudes" ADD COLUMN "paquete_id" integer;
  ALTER TABLE "solicitudes" ADD COLUMN "cliente_id" integer;
  ALTER TABLE "solicitudes" ADD COLUMN "mascota_ficha_id" integer;
  ALTER TABLE "far_presentaciones" ADD COLUMN "titulo" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "paquetes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "paq_vendidos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "paq_usos_id" integer;
  ALTER TABLE "paquetes_contenido" ADD CONSTRAINT "paquetes_contenido_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paquetes_contenido" ADD CONSTRAINT "paquetes_contenido_presentacion_id_far_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paquetes_contenido" ADD CONSTRAINT "paquetes_contenido_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."paquetes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "paq_vendidos_renglones" ADD CONSTRAINT "paq_vendidos_renglones_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_vendidos_renglones" ADD CONSTRAINT "paq_vendidos_renglones_presentacion_id_far_presentaciones_id_fk" FOREIGN KEY ("presentacion_id") REFERENCES "public"."far_presentaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_vendidos_renglones" ADD CONSTRAINT "paq_vendidos_renglones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."paq_vendidos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "paq_vendidos" ADD CONSTRAINT "paq_vendidos_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_vendidos" ADD CONSTRAINT "paq_vendidos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_vendidos" ADD CONSTRAINT "paq_vendidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_vendidos" ADD CONSTRAINT "paq_vendidos_cargo_finanzas_id_fin_operaciones_id_fk" FOREIGN KEY ("cargo_finanzas_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_vendidos" ADD CONSTRAINT "paq_vendidos_solicitud_id_solicitudes_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_vendidos" ADD CONSTRAINT "paq_vendidos_vendido_por_id_users_id_fk" FOREIGN KEY ("vendido_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_usos" ADD CONSTRAINT "paq_usos_vendido_id_paq_vendidos_id_fk" FOREIGN KEY ("vendido_id") REFERENCES "public"."paq_vendidos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_usos" ADD CONSTRAINT "paq_usos_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "paq_usos" ADD CONSTRAINT "paq_usos_venta_id_far_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."far_ventas"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "paquetes_contenido_order_idx" ON "paquetes_contenido" USING btree ("_order");
  CREATE INDEX "paquetes_contenido_parent_id_idx" ON "paquetes_contenido" USING btree ("_parent_id");
  CREATE INDEX "paquetes_contenido_servicio_idx" ON "paquetes_contenido" USING btree ("servicio_id");
  CREATE INDEX "paquetes_contenido_presentacion_idx" ON "paquetes_contenido" USING btree ("presentacion_id");
  CREATE UNIQUE INDEX "paquetes_nombre_idx" ON "paquetes" USING btree ("nombre");
  CREATE INDEX "paquetes_updated_at_idx" ON "paquetes" USING btree ("updated_at");
  CREATE INDEX "paquetes_created_at_idx" ON "paquetes" USING btree ("created_at");
  CREATE INDEX "paq_vendidos_renglones_order_idx" ON "paq_vendidos_renglones" USING btree ("_order");
  CREATE INDEX "paq_vendidos_renglones_parent_id_idx" ON "paq_vendidos_renglones" USING btree ("_parent_id");
  CREATE INDEX "paq_vendidos_renglones_servicio_idx" ON "paq_vendidos_renglones" USING btree ("servicio_id");
  CREATE INDEX "paq_vendidos_renglones_presentacion_idx" ON "paq_vendidos_renglones" USING btree ("presentacion_id");
  CREATE INDEX "paq_vendidos_paquete_idx" ON "paq_vendidos" USING btree ("paquete_id");
  CREATE INDEX "paq_vendidos_mascota_idx" ON "paq_vendidos" USING btree ("mascota_id");
  CREATE INDEX "paq_vendidos_cliente_idx" ON "paq_vendidos" USING btree ("cliente_id");
  CREATE INDEX "paq_vendidos_fecha_idx" ON "paq_vendidos" USING btree ("fecha");
  CREATE INDEX "paq_vendidos_vence_idx" ON "paq_vendidos" USING btree ("vence");
  CREATE INDEX "paq_vendidos_estado_idx" ON "paq_vendidos" USING btree ("estado");
  CREATE INDEX "paq_vendidos_cargo_finanzas_idx" ON "paq_vendidos" USING btree ("cargo_finanzas_id");
  CREATE INDEX "paq_vendidos_solicitud_idx" ON "paq_vendidos" USING btree ("solicitud_id");
  CREATE INDEX "paq_vendidos_vendido_por_idx" ON "paq_vendidos" USING btree ("vendido_por_id");
  CREATE INDEX "paq_vendidos_updated_at_idx" ON "paq_vendidos" USING btree ("updated_at");
  CREATE INDEX "paq_vendidos_created_at_idx" ON "paq_vendidos" USING btree ("created_at");
  CREATE INDEX "paq_usos_vendido_idx" ON "paq_usos" USING btree ("vendido_id");
  CREATE UNIQUE INDEX "paq_usos_cita_idx" ON "paq_usos" USING btree ("cita_id");
  CREATE INDEX "paq_usos_venta_idx" ON "paq_usos" USING btree ("venta_id");
  CREATE INDEX "paq_usos_updated_at_idx" ON "paq_usos" USING btree ("updated_at");
  CREATE INDEX "paq_usos_created_at_idx" ON "paq_usos" USING btree ("created_at");
  ALTER TABLE "citas" ADD CONSTRAINT "citas_paquete_id_paq_vendidos_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paq_vendidos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_mascota_ficha_id_mascotas_id_fk" FOREIGN KEY ("mascota_ficha_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_paquetes_fk" FOREIGN KEY ("paquetes_id") REFERENCES "public"."paquetes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_paq_vendidos_fk" FOREIGN KEY ("paq_vendidos_id") REFERENCES "public"."paq_vendidos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_paq_usos_fk" FOREIGN KEY ("paq_usos_id") REFERENCES "public"."paq_usos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "citas_paquete_idx" ON "citas" USING btree ("paquete_id");
  CREATE INDEX "solicitudes_paquete_idx" ON "solicitudes" USING btree ("paquete_id");
  CREATE INDEX "solicitudes_cliente_idx" ON "solicitudes" USING btree ("cliente_id");
  CREATE INDEX "solicitudes_mascota_ficha_idx" ON "solicitudes" USING btree ("mascota_ficha_id");
  CREATE INDEX "far_presentaciones_titulo_idx" ON "far_presentaciones" USING btree ("titulo");
  CREATE INDEX "payload_locked_documents_rels_paquetes_id_idx" ON "payload_locked_documents_rels" USING btree ("paquetes_id");
  CREATE INDEX "payload_locked_documents_rels_paq_vendidos_id_idx" ON "payload_locked_documents_rels" USING btree ("paq_vendidos_id");
  CREATE INDEX "payload_locked_documents_rels_paq_usos_id_idx" ON "payload_locked_documents_rels" USING btree ("paq_usos_id");
  UPDATE "far_presentaciones" p SET "titulo" = pr."nombre" || ' · ' || p."nombre" FROM "far_productos" pr WHERE pr."id" = p."producto_id";
  ALTER TABLE "paquetes_contenido" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "paquetes" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "paq_vendidos_renglones" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "paq_vendidos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "paq_usos" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "paquetes_contenido" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "paquetes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "paq_vendidos_renglones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "paq_vendidos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "paq_usos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "paquetes_contenido" CASCADE;
  DROP TABLE "paquetes" CASCADE;
  DROP TABLE "paq_vendidos_renglones" CASCADE;
  DROP TABLE "paq_vendidos" CASCADE;
  DROP TABLE "paq_usos" CASCADE;
  ALTER TABLE "citas" DROP CONSTRAINT "citas_paquete_id_paq_vendidos_id_fk";
  
  ALTER TABLE "solicitudes" DROP CONSTRAINT "solicitudes_paquete_id_paquetes_id_fk";
  
  ALTER TABLE "solicitudes" DROP CONSTRAINT "solicitudes_cliente_id_clientes_id_fk";
  
  ALTER TABLE "solicitudes" DROP CONSTRAINT "solicitudes_mascota_ficha_id_mascotas_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_paquetes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_paq_vendidos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_paq_usos_fk";
  
  ALTER TABLE "solicitudes" ALTER COLUMN "estado" SET DATA TYPE text;
  ALTER TABLE "solicitudes" ALTER COLUMN "estado" SET DEFAULT 'nueva'::text;
  DROP TYPE "public"."enum_solicitudes_estado";
  CREATE TYPE "public"."enum_solicitudes_estado" AS ENUM('nueva', 'contactada', 'agendada', 'descartada');
  ALTER TABLE "solicitudes" ALTER COLUMN "estado" SET DEFAULT 'nueva'::"public"."enum_solicitudes_estado";
  ALTER TABLE "solicitudes" ALTER COLUMN "estado" SET DATA TYPE "public"."enum_solicitudes_estado" USING "estado"::"public"."enum_solicitudes_estado";
  DROP INDEX "citas_paquete_idx";
  DROP INDEX "solicitudes_paquete_idx";
  DROP INDEX "solicitudes_cliente_idx";
  DROP INDEX "solicitudes_mascota_ficha_idx";
  DROP INDEX "far_presentaciones_titulo_idx";
  DROP INDEX "payload_locked_documents_rels_paquetes_id_idx";
  DROP INDEX "payload_locked_documents_rels_paq_vendidos_id_idx";
  DROP INDEX "payload_locked_documents_rels_paq_usos_id_idx";
  ALTER TABLE "citas" DROP COLUMN "paquete_id";
  ALTER TABLE "solicitudes" DROP COLUMN "paquete_id";
  ALTER TABLE "solicitudes" DROP COLUMN "cliente_id";
  ALTER TABLE "solicitudes" DROP COLUMN "mascota_ficha_id";
  ALTER TABLE "far_presentaciones" DROP COLUMN "titulo";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "paquetes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "paq_vendidos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "paq_usos_id";
  DROP TYPE "public"."enum_paquetes_contenido_tipo";
  DROP TYPE "public"."enum_paq_vendidos_renglones_tipo";
  DROP TYPE "public"."enum_paq_vendidos_estado";
  DROP TYPE "public"."enum_paq_usos_origen";`)
}
