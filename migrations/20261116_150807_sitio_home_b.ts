import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "sitio_fotos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL,
  	"imagen" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sitio_configuracion_razones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL,
  	"texto" varchar
  );
  
  CREATE TABLE "sitio_configuracion_doctor_credenciales" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"etiqueta" varchar NOT NULL,
  	"valor" varchar NOT NULL
  );
  
  CREATE TABLE "sitio_configuracion_testimonios" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"texto" varchar NOT NULL,
  	"autor" varchar
  );
  
  CREATE TABLE "sitio_configuracion_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"sitio_fotos_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sitio_fotos_id" integer;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "campana_activa" boolean DEFAULT false;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "campana_etiqueta" varchar;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "campana_hasta" varchar;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "campana_titulo" varchar;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "campana_texto" varchar;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "campana_boton" varchar;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "doctor_nombre" varchar;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "doctor_titulo" varchar;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "doctor_presentacion" varchar;
  ALTER TABLE "sitio_configuracion" ADD COLUMN "doctor_foto_id" integer;
  ALTER TABLE "sitio_configuracion_razones" ADD CONSTRAINT "sitio_configuracion_razones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sitio_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sitio_configuracion_doctor_credenciales" ADD CONSTRAINT "sitio_configuracion_doctor_credenciales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sitio_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sitio_configuracion_testimonios" ADD CONSTRAINT "sitio_configuracion_testimonios_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sitio_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sitio_configuracion_rels" ADD CONSTRAINT "sitio_configuracion_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sitio_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sitio_configuracion_rels" ADD CONSTRAINT "sitio_configuracion_rels_sitio_fotos_fk" FOREIGN KEY ("sitio_fotos_id") REFERENCES "public"."sitio_fotos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sitio_fotos_updated_at_idx" ON "sitio_fotos" USING btree ("updated_at");
  CREATE INDEX "sitio_fotos_created_at_idx" ON "sitio_fotos" USING btree ("created_at");
  CREATE INDEX "sitio_configuracion_razones_order_idx" ON "sitio_configuracion_razones" USING btree ("_order");
  CREATE INDEX "sitio_configuracion_razones_parent_id_idx" ON "sitio_configuracion_razones" USING btree ("_parent_id");
  CREATE INDEX "sitio_configuracion_doctor_credenciales_order_idx" ON "sitio_configuracion_doctor_credenciales" USING btree ("_order");
  CREATE INDEX "sitio_configuracion_doctor_credenciales_parent_id_idx" ON "sitio_configuracion_doctor_credenciales" USING btree ("_parent_id");
  CREATE INDEX "sitio_configuracion_testimonios_order_idx" ON "sitio_configuracion_testimonios" USING btree ("_order");
  CREATE INDEX "sitio_configuracion_testimonios_parent_id_idx" ON "sitio_configuracion_testimonios" USING btree ("_parent_id");
  CREATE INDEX "sitio_configuracion_rels_order_idx" ON "sitio_configuracion_rels" USING btree ("order");
  CREATE INDEX "sitio_configuracion_rels_parent_idx" ON "sitio_configuracion_rels" USING btree ("parent_id");
  CREATE INDEX "sitio_configuracion_rels_path_idx" ON "sitio_configuracion_rels" USING btree ("path");
  CREATE INDEX "sitio_configuracion_rels_sitio_fotos_id_idx" ON "sitio_configuracion_rels" USING btree ("sitio_fotos_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sitio_fotos_fk" FOREIGN KEY ("sitio_fotos_id") REFERENCES "public"."sitio_fotos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sitio_configuracion" ADD CONSTRAINT "sitio_configuracion_doctor_foto_id_sitio_fotos_id_fk" FOREIGN KEY ("doctor_foto_id") REFERENCES "public"."sitio_fotos"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_sitio_fotos_id_idx" ON "payload_locked_documents_rels" USING btree ("sitio_fotos_id");
  CREATE INDEX "sitio_configuracion_doctor_doctor_foto_idx" ON "sitio_configuracion" USING btree ("doctor_foto_id");
  ALTER TABLE "sitio_fotos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "sitio_configuracion_razones" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "sitio_configuracion_doctor_credenciales" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "sitio_configuracion_testimonios" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "sitio_configuracion_rels" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sitio_fotos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sitio_configuracion_razones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sitio_configuracion_doctor_credenciales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sitio_configuracion_testimonios" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sitio_configuracion_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sitio_fotos" CASCADE;
  DROP TABLE "sitio_configuracion_razones" CASCADE;
  DROP TABLE "sitio_configuracion_doctor_credenciales" CASCADE;
  DROP TABLE "sitio_configuracion_testimonios" CASCADE;
  DROP TABLE "sitio_configuracion_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sitio_fotos_fk";
  
  ALTER TABLE "sitio_configuracion" DROP CONSTRAINT "sitio_configuracion_doctor_foto_id_sitio_fotos_id_fk";
  
  DROP INDEX "payload_locked_documents_rels_sitio_fotos_id_idx";
  DROP INDEX "sitio_configuracion_doctor_doctor_foto_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sitio_fotos_id";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "campana_activa";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "campana_etiqueta";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "campana_hasta";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "campana_titulo";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "campana_texto";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "campana_boton";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "doctor_nombre";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "doctor_titulo";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "doctor_presentacion";
  ALTER TABLE "sitio_configuracion" DROP COLUMN "doctor_foto_id";`)
}
