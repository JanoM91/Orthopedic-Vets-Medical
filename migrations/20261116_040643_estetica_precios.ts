import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_mascotas_talla_estetica" AS ENUM('chico', 'mediano', 'grande', 'gigante');
  CREATE TYPE "public"."enum_citas_estetica_talla" AS ENUM('chico', 'mediano', 'grande', 'gigante');
  CREATE TABLE "citas_estetica_adicionales" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"adicional_id" integer,
  	"nombre" varchar NOT NULL,
  	"precio" numeric NOT NULL,
  	"duracion_min" numeric
  );
  
  CREATE TABLE "est_adicionales" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"descripcion" varchar,
  	"precio" numeric NOT NULL,
  	"duracion_min" numeric DEFAULT 0,
  	"en_linea" boolean DEFAULT true,
  	"orden" numeric DEFAULT 0,
  	"activo" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "estetica_configuracion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre_marca" varchar,
  	"logo" varchar,
  	"tallas_chico_hasta" numeric DEFAULT 10,
  	"tallas_mediano_hasta" numeric DEFAULT 25,
  	"tallas_grande_hasta" numeric DEFAULT 40,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "mascotas" ADD COLUMN "talla_estetica" "enum_mascotas_talla_estetica";
  ALTER TABLE "servicios" ADD COLUMN "estetica" boolean DEFAULT false;
  ALTER TABLE "servicios" ADD COLUMN "precios_talla_chico" numeric;
  ALTER TABLE "servicios" ADD COLUMN "precios_talla_mediano" numeric;
  ALTER TABLE "servicios" ADD COLUMN "precios_talla_grande" numeric;
  ALTER TABLE "servicios" ADD COLUMN "precios_talla_gigante" numeric;
  ALTER TABLE "servicios" ADD COLUMN "duracion_talla_chico" numeric;
  ALTER TABLE "servicios" ADD COLUMN "duracion_talla_mediano" numeric;
  ALTER TABLE "servicios" ADD COLUMN "duracion_talla_grande" numeric;
  ALTER TABLE "servicios" ADD COLUMN "duracion_talla_gigante" numeric;
  ALTER TABLE "citas" ADD COLUMN "estetica_cotizada" boolean DEFAULT false;
  ALTER TABLE "citas" ADD COLUMN "estetica_talla" "enum_citas_estetica_talla";
  ALTER TABLE "citas" ADD COLUMN "estetica_precio_base" numeric;
  ALTER TABLE "citas" ADD COLUMN "estetica_total" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "est_adicionales_id" integer;
  ALTER TABLE "instalacion_configuracion" ADD COLUMN "modulos_estetica" boolean DEFAULT false;
  ALTER TABLE "citas_estetica_adicionales" ADD CONSTRAINT "citas_estetica_adicionales_adicional_id_est_adicionales_id_fk" FOREIGN KEY ("adicional_id") REFERENCES "public"."est_adicionales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas_estetica_adicionales" ADD CONSTRAINT "citas_estetica_adicionales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."citas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "citas_estetica_adicionales_order_idx" ON "citas_estetica_adicionales" USING btree ("_order");
  CREATE INDEX "citas_estetica_adicionales_parent_id_idx" ON "citas_estetica_adicionales" USING btree ("_parent_id");
  CREATE INDEX "citas_estetica_adicionales_adicional_idx" ON "citas_estetica_adicionales" USING btree ("adicional_id");
  CREATE UNIQUE INDEX "est_adicionales_nombre_idx" ON "est_adicionales" USING btree ("nombre");
  CREATE INDEX "est_adicionales_activo_idx" ON "est_adicionales" USING btree ("activo");
  CREATE INDEX "est_adicionales_updated_at_idx" ON "est_adicionales" USING btree ("updated_at");
  CREATE INDEX "est_adicionales_created_at_idx" ON "est_adicionales" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_est_adicionales_fk" FOREIGN KEY ("est_adicionales_id") REFERENCES "public"."est_adicionales"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_est_adicionales_id_idx" ON "payload_locked_documents_rels" USING btree ("est_adicionales_id");
  ALTER TABLE "citas_estetica_adicionales" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "est_adicionales" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "estetica_configuracion" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "citas_estetica_adicionales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "est_adicionales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "estetica_configuracion" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "citas_estetica_adicionales" CASCADE;
  DROP TABLE "est_adicionales" CASCADE;
  DROP TABLE "estetica_configuracion" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_est_adicionales_fk";
  
  DROP INDEX "payload_locked_documents_rels_est_adicionales_id_idx";
  ALTER TABLE "mascotas" DROP COLUMN "talla_estetica";
  ALTER TABLE "servicios" DROP COLUMN "estetica";
  ALTER TABLE "servicios" DROP COLUMN "precios_talla_chico";
  ALTER TABLE "servicios" DROP COLUMN "precios_talla_mediano";
  ALTER TABLE "servicios" DROP COLUMN "precios_talla_grande";
  ALTER TABLE "servicios" DROP COLUMN "precios_talla_gigante";
  ALTER TABLE "servicios" DROP COLUMN "duracion_talla_chico";
  ALTER TABLE "servicios" DROP COLUMN "duracion_talla_mediano";
  ALTER TABLE "servicios" DROP COLUMN "duracion_talla_grande";
  ALTER TABLE "servicios" DROP COLUMN "duracion_talla_gigante";
  ALTER TABLE "citas" DROP COLUMN "estetica_cotizada";
  ALTER TABLE "citas" DROP COLUMN "estetica_talla";
  ALTER TABLE "citas" DROP COLUMN "estetica_precio_base";
  ALTER TABLE "citas" DROP COLUMN "estetica_total";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "est_adicionales_id";
  ALTER TABLE "instalacion_configuracion" DROP COLUMN "modulos_estetica";
  DROP TYPE "public"."enum_mascotas_talla_estetica";
  DROP TYPE "public"."enum_citas_estetica_talla";`)
}
