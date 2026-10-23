import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "sitio_configuracion_equipo" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"cargo" varchar,
  	"descripcion" varchar
  );
  
  CREATE TABLE "sitio_configuracion_preguntas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"pregunta" varchar NOT NULL,
  	"respuesta" varchar NOT NULL
  );
  
  CREATE TABLE "sitio_configuracion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"publicado" boolean DEFAULT false,
  	"lema" varchar,
  	"descripcion" varchar,
  	"contacto_direccion" varchar,
  	"contacto_mapa_url" varchar,
  	"contacto_telefono" varchar,
  	"contacto_whatsapp" varchar,
  	"contacto_correo" varchar,
  	"contacto_urgencias" varchar,
  	"redes_facebook" varchar,
  	"redes_instagram" varchar,
  	"redes_tiktok" varchar,
  	"aviso_privacidad" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "sitio_configuracion_equipo" ADD CONSTRAINT "sitio_configuracion_equipo_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sitio_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sitio_configuracion_preguntas" ADD CONSTRAINT "sitio_configuracion_preguntas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sitio_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sitio_configuracion_equipo_order_idx" ON "sitio_configuracion_equipo" USING btree ("_order");
  CREATE INDEX "sitio_configuracion_equipo_parent_id_idx" ON "sitio_configuracion_equipo" USING btree ("_parent_id");
  CREATE INDEX "sitio_configuracion_preguntas_order_idx" ON "sitio_configuracion_preguntas" USING btree ("_order");
  CREATE INDEX "sitio_configuracion_preguntas_parent_id_idx" ON "sitio_configuracion_preguntas" USING btree ("_parent_id");`)
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
   DROP TABLE "sitio_configuracion_equipo" CASCADE;
  DROP TABLE "sitio_configuracion_preguntas" CASCADE;
  DROP TABLE "sitio_configuracion" CASCADE;`)
}
