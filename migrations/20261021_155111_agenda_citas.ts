import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_recursos_tipo" AS ENUM('consultorio', 'quirofano', 'estetica', 'sala', 'otro');
  CREATE TYPE "public"."enum_servicios_reserva_en_linea" AS ENUM('inmediata', 'valoracion', 'no');
  CREATE TYPE "public"."enum_citas_estado" AS ENUM('solicitada', 'confirmada', 'llegada', 'atencion', 'finalizada', 'cancelada', 'no_asistio');
  CREATE TYPE "public"."enum_citas_origen" AS ENUM('panel', 'portal');
  CREATE TYPE "public"."enum_agenda_configuracion_horario_dia" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TABLE "recursos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"tipo" "enum_recursos_tipo" DEFAULT 'consultorio' NOT NULL,
  	"orden" numeric DEFAULT 0,
  	"activo" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "servicios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"descripcion" varchar,
  	"indicaciones" varchar,
  	"duracion_min" numeric DEFAULT 30 NOT NULL,
  	"precio" numeric,
  	"recurso_por_defecto_id" integer NOT NULL,
  	"area_id" integer,
  	"categoria_finanzas_id" integer,
  	"reserva_en_linea" "enum_servicios_reserva_en_linea" DEFAULT 'inmediata' NOT NULL,
  	"orden" numeric DEFAULT 0,
  	"activo" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "citas_historial" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"estado" varchar NOT NULL,
  	"fecha" timestamp(3) with time zone NOT NULL,
  	"por" varchar,
  	"detalle" varchar
  );
  
  CREATE TABLE "citas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"cliente_id" integer,
  	"servicio_id" integer NOT NULL,
  	"recurso_id" integer NOT NULL,
  	"profesional_id" integer,
  	"dia" varchar NOT NULL,
  	"hora_inicio" varchar NOT NULL,
  	"duracion_min" numeric NOT NULL,
  	"inicio" timestamp(3) with time zone NOT NULL,
  	"fin" timestamp(3) with time zone NOT NULL,
  	"estado" "enum_citas_estado" DEFAULT 'solicitada' NOT NULL,
  	"origen" "enum_citas_origen" DEFAULT 'panel' NOT NULL,
  	"notas_tutor" varchar,
  	"notas_internas" varchar,
  	"motivo_cancelacion" varchar,
  	"cargo_finanzas_id" integer,
  	"creado_por_id" integer,
  	"creado_por_tutor_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "agenda_configuracion_horario" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"dia" "enum_agenda_configuracion_horario_dia" NOT NULL,
  	"abierto" boolean DEFAULT true,
  	"de" varchar DEFAULT '09:00',
  	"a" varchar DEFAULT '19:00'
  );
  
  CREATE TABLE "agenda_configuracion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"intervalo_min" numeric DEFAULT 30,
  	"anticipacion_horas" numeric DEFAULT 2,
  	"dias_adelante" numeric DEFAULT 60,
  	"cancelacion_horas" numeric DEFAULT 12,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "roles" ADD COLUMN "clinica_agenda" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "clinica_configurar_agenda" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "recursos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "servicios_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "citas_id" integer;
  ALTER TABLE "servicios" ADD CONSTRAINT "servicios_recurso_por_defecto_id_recursos_id_fk" FOREIGN KEY ("recurso_por_defecto_id") REFERENCES "public"."recursos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "servicios" ADD CONSTRAINT "servicios_area_id_fin_actividades_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."fin_actividades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "servicios" ADD CONSTRAINT "servicios_categoria_finanzas_id_fin_categorias_id_fk" FOREIGN KEY ("categoria_finanzas_id") REFERENCES "public"."fin_categorias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas_historial" ADD CONSTRAINT "citas_historial_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."citas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "citas" ADD CONSTRAINT "citas_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas" ADD CONSTRAINT "citas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas" ADD CONSTRAINT "citas_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas" ADD CONSTRAINT "citas_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas" ADD CONSTRAINT "citas_profesional_id_users_id_fk" FOREIGN KEY ("profesional_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas" ADD CONSTRAINT "citas_cargo_finanzas_id_fin_operaciones_id_fk" FOREIGN KEY ("cargo_finanzas_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas" ADD CONSTRAINT "citas_creado_por_id_users_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citas" ADD CONSTRAINT "citas_creado_por_tutor_id_tutores_id_fk" FOREIGN KEY ("creado_por_tutor_id") REFERENCES "public"."tutores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agenda_configuracion_horario" ADD CONSTRAINT "agenda_configuracion_horario_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."agenda_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "recursos_nombre_idx" ON "recursos" USING btree ("nombre");
  CREATE INDEX "recursos_activo_idx" ON "recursos" USING btree ("activo");
  CREATE INDEX "recursos_updated_at_idx" ON "recursos" USING btree ("updated_at");
  CREATE INDEX "recursos_created_at_idx" ON "recursos" USING btree ("created_at");
  CREATE UNIQUE INDEX "servicios_nombre_idx" ON "servicios" USING btree ("nombre");
  CREATE INDEX "servicios_recurso_por_defecto_idx" ON "servicios" USING btree ("recurso_por_defecto_id");
  CREATE INDEX "servicios_area_idx" ON "servicios" USING btree ("area_id");
  CREATE INDEX "servicios_categoria_finanzas_idx" ON "servicios" USING btree ("categoria_finanzas_id");
  CREATE INDEX "servicios_activo_idx" ON "servicios" USING btree ("activo");
  CREATE INDEX "servicios_updated_at_idx" ON "servicios" USING btree ("updated_at");
  CREATE INDEX "servicios_created_at_idx" ON "servicios" USING btree ("created_at");
  CREATE INDEX "citas_historial_order_idx" ON "citas_historial" USING btree ("_order");
  CREATE INDEX "citas_historial_parent_id_idx" ON "citas_historial" USING btree ("_parent_id");
  CREATE INDEX "citas_mascota_idx" ON "citas" USING btree ("mascota_id");
  CREATE INDEX "citas_cliente_idx" ON "citas" USING btree ("cliente_id");
  CREATE INDEX "citas_servicio_idx" ON "citas" USING btree ("servicio_id");
  CREATE INDEX "citas_recurso_idx" ON "citas" USING btree ("recurso_id");
  CREATE INDEX "citas_profesional_idx" ON "citas" USING btree ("profesional_id");
  CREATE INDEX "citas_dia_idx" ON "citas" USING btree ("dia");
  CREATE INDEX "citas_inicio_idx" ON "citas" USING btree ("inicio");
  CREATE INDEX "citas_fin_idx" ON "citas" USING btree ("fin");
  CREATE INDEX "citas_estado_idx" ON "citas" USING btree ("estado");
  CREATE INDEX "citas_cargo_finanzas_idx" ON "citas" USING btree ("cargo_finanzas_id");
  CREATE INDEX "citas_creado_por_idx" ON "citas" USING btree ("creado_por_id");
  CREATE INDEX "citas_creado_por_tutor_idx" ON "citas" USING btree ("creado_por_tutor_id");
  CREATE INDEX "citas_updated_at_idx" ON "citas" USING btree ("updated_at");
  CREATE INDEX "citas_created_at_idx" ON "citas" USING btree ("created_at");
  CREATE INDEX "agenda_configuracion_horario_order_idx" ON "agenda_configuracion_horario" USING btree ("_order");
  CREATE INDEX "agenda_configuracion_horario_parent_id_idx" ON "agenda_configuracion_horario" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_recursos_fk" FOREIGN KEY ("recursos_id") REFERENCES "public"."recursos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_servicios_fk" FOREIGN KEY ("servicios_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_citas_fk" FOREIGN KEY ("citas_id") REFERENCES "public"."citas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_recursos_id_idx" ON "payload_locked_documents_rels" USING btree ("recursos_id");
  CREATE INDEX "payload_locked_documents_rels_servicios_id_idx" ON "payload_locked_documents_rels" USING btree ("servicios_id");
  CREATE INDEX "payload_locked_documents_rels_citas_id_idx" ON "payload_locked_documents_rels" USING btree ("citas_id");`)
  await activarRls({ db })
}

/** Toda tabla nueva nace con RLS (Supabase expone `public` por su API). Ver 20261011_210000_rls_supabase.ts. */
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
   ALTER TABLE "recursos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "servicios" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "citas_historial" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "citas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "agenda_configuracion_horario" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "agenda_configuracion" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "recursos" CASCADE;
  DROP TABLE "servicios" CASCADE;
  DROP TABLE "citas_historial" CASCADE;
  DROP TABLE "citas" CASCADE;
  DROP TABLE "agenda_configuracion_horario" CASCADE;
  DROP TABLE "agenda_configuracion" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_recursos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_servicios_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_citas_fk";
  
  DROP INDEX "payload_locked_documents_rels_recursos_id_idx";
  DROP INDEX "payload_locked_documents_rels_servicios_id_idx";
  DROP INDEX "payload_locked_documents_rels_citas_id_idx";
  ALTER TABLE "roles" DROP COLUMN "clinica_agenda";
  ALTER TABLE "roles" DROP COLUMN "clinica_configurar_agenda";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "recursos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "servicios_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "citas_id";
  DROP TYPE "public"."enum_recursos_tipo";
  DROP TYPE "public"."enum_servicios_reserva_en_linea";
  DROP TYPE "public"."enum_citas_estado";
  DROP TYPE "public"."enum_citas_origen";
  DROP TYPE "public"."enum_agenda_configuracion_horario_dia";`)
}
