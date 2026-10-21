import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clientes_origen" AS ENUM('manual', 'importacion', 'portal');
  CREATE TYPE "public"."enum_mascotas_especie" AS ENUM('perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otra');
  CREATE TYPE "public"."enum_mascotas_sexo" AS ENUM('macho', 'hembra', 'desconocido');
  CREATE TYPE "public"."enum_mascotas_esterilizado" AS ENUM('si', 'no', 'desconocido');
  CREATE TYPE "public"."enum_mascotas_estado" AS ENUM('activo', 'inactivo', 'fallecido');
  CREATE TYPE "public"."enum_mascotas_origen" AS ENUM('manual', 'importacion', 'portal');
  CREATE TYPE "public"."enum_mas_cartilla_tipo" AS ENUM('vacuna', 'desparasitacion_interna', 'desparasitacion_externa', 'otro');
  CREATE TYPE "public"."enum_mas_notas_tipo" AS ENUM('consulta', 'ortopedia', 'cirugia', 'control', 'urgencia', 'hospitalizacion', 'rehabilitacion', 'otro');
  CREATE TYPE "public"."enum_mas_notas_estado" AS ENUM('borrador', 'firmada');
  CREATE TYPE "public"."enum_mas_documentos_tipo" AS ENUM('indicaciones', 'receta', 'consentimiento', 'estudio', 'constancia', 'cartilla', 'otro');
  CREATE TYPE "public"."enum_mas_documentos_origen" AS ENUM('clinica', 'tutor');
  CREATE TYPE "public"."enum_mas_documentos_revision" AS ENUM('no_aplica', 'pendiente', 'revisado');
  CREATE TYPE "public"."enum_importaciones_estado" AS ENUM('previa', 'aplicada', 'descartada');
  CREATE TABLE "clientes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"apellidos" varchar,
  	"nombre_completo" varchar,
  	"telefono" varchar,
  	"telefono_alterno" varchar,
  	"email" varchar,
  	"direccion" varchar,
  	"contacto_emergencia_nombre" varchar,
  	"contacto_emergencia_telefono" varchar,
  	"comunicacion_avisos" boolean DEFAULT true,
  	"comunicacion_promociones" boolean DEFAULT false,
  	"comunicacion_whatsapp" boolean DEFAULT true,
  	"comunicacion_correo" boolean DEFAULT true,
  	"notas_internas" varchar,
  	"activo" boolean DEFAULT true,
  	"origen" "enum_clientes_origen" DEFAULT 'manual',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mascotas_alertas_manejo" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"texto" varchar NOT NULL
  );
  
  CREATE TABLE "mascotas_tutores" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"cliente_id" integer NOT NULL,
  	"principal" boolean DEFAULT false,
  	"parentesco" varchar
  );
  
  CREATE TABLE "mascotas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"especie" "enum_mascotas_especie" DEFAULT 'perro' NOT NULL,
  	"especie_otra" varchar,
  	"raza" varchar,
  	"sexo" "enum_mascotas_sexo" DEFAULT 'desconocido',
  	"esterilizado" "enum_mascotas_esterilizado" DEFAULT 'desconocido',
  	"color" varchar,
  	"fecha_nacimiento" varchar,
  	"nacimiento_estimado" boolean DEFAULT false,
  	"microchip" varchar,
  	"alergias" varchar,
  	"medico_tratante_id" integer,
  	"estado" "enum_mascotas_estado" DEFAULT 'activo',
  	"notas_internas" varchar,
  	"origen" "enum_mascotas_origen" DEFAULT 'manual',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mas_pesos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"fecha" varchar NOT NULL,
  	"kg" numeric NOT NULL,
  	"nota" varchar,
  	"registrado_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mas_cartilla" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"tipo" "enum_mas_cartilla_tipo" DEFAULT 'vacuna' NOT NULL,
  	"producto" varchar NOT NULL,
  	"fecha_aplicacion" varchar NOT NULL,
  	"proxima_fecha" varchar,
  	"lote" varchar,
  	"caducidad" varchar,
  	"aplicado_por_id" integer,
  	"aplicado_por_texto" varchar,
  	"notas" varchar,
  	"registrado_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mas_notas_adendas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"motivo" varchar NOT NULL,
  	"texto" varchar NOT NULL,
  	"fecha" timestamp(3) with time zone,
  	"autor_id" integer
  );
  
  CREATE TABLE "mas_notas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"fecha" varchar NOT NULL,
  	"tipo" "enum_mas_notas_tipo" DEFAULT 'consulta' NOT NULL,
  	"titulo" varchar NOT NULL,
  	"subjetivo" varchar,
  	"objetivo" varchar,
  	"analisis" varchar,
  	"plan" varchar,
  	"autor_id" integer,
  	"estado" "enum_mas_notas_estado" DEFAULT 'borrador' NOT NULL,
  	"firmada_en" timestamp(3) with time zone,
  	"firmada_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mas_documentos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"titulo" varchar NOT NULL,
  	"tipo" "enum_mas_documentos_tipo" DEFAULT 'otro' NOT NULL,
  	"fecha" varchar,
  	"publicado_al_tutor" boolean DEFAULT false,
  	"origen" "enum_mas_documentos_origen" DEFAULT 'clinica' NOT NULL,
  	"revision" "enum_mas_documentos_revision" DEFAULT 'no_aplica',
  	"ruta" varchar NOT NULL,
  	"nombre_archivo" varchar,
  	"tipo_contenido" varchar,
  	"tamano" numeric,
  	"subido_por_id" integer,
  	"subido_por_tutor_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tutores_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "tutores" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"telefono" varchar,
  	"cliente_id" integer,
  	"vinculado_en" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "codigos_vinculacion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"codigo" varchar NOT NULL,
  	"cliente_id" integer NOT NULL,
  	"expira" timestamp(3) with time zone NOT NULL,
  	"usado_en" timestamp(3) with time zone,
  	"usado_por_id" integer,
  	"creado_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "importaciones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"archivo" varchar NOT NULL,
  	"estado" "enum_importaciones_estado" DEFAULT 'previa' NOT NULL,
  	"columnas" jsonb,
  	"filas" jsonb,
  	"mapeo" jsonb,
  	"resumen" jsonb,
  	"creado_por_id" integer,
  	"aplicada_en" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "roles" ADD COLUMN "clinica_ver_pacientes" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "clinica_editar_pacientes" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "clinica_ver_expediente" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "clinica_escribir_expediente" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "clinica_importar" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "clientes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mascotas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mas_pesos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mas_cartilla_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mas_notas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mas_documentos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutores_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "codigos_vinculacion_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "importaciones_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "tutores_id" integer;
  ALTER TABLE "mascotas_alertas_manejo" ADD CONSTRAINT "mascotas_alertas_manejo_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."mascotas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "mascotas_tutores" ADD CONSTRAINT "mascotas_tutores_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mascotas_tutores" ADD CONSTRAINT "mascotas_tutores_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."mascotas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "mascotas" ADD CONSTRAINT "mascotas_medico_tratante_id_users_id_fk" FOREIGN KEY ("medico_tratante_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_pesos" ADD CONSTRAINT "mas_pesos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_pesos" ADD CONSTRAINT "mas_pesos_registrado_por_id_users_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_cartilla" ADD CONSTRAINT "mas_cartilla_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_cartilla" ADD CONSTRAINT "mas_cartilla_aplicado_por_id_users_id_fk" FOREIGN KEY ("aplicado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_cartilla" ADD CONSTRAINT "mas_cartilla_registrado_por_id_users_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_notas_adendas" ADD CONSTRAINT "mas_notas_adendas_autor_id_users_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_notas_adendas" ADD CONSTRAINT "mas_notas_adendas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."mas_notas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "mas_notas" ADD CONSTRAINT "mas_notas_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_notas" ADD CONSTRAINT "mas_notas_autor_id_users_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_notas" ADD CONSTRAINT "mas_notas_firmada_por_id_users_id_fk" FOREIGN KEY ("firmada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_documentos" ADD CONSTRAINT "mas_documentos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_documentos" ADD CONSTRAINT "mas_documentos_subido_por_id_users_id_fk" FOREIGN KEY ("subido_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mas_documentos" ADD CONSTRAINT "mas_documentos_subido_por_tutor_id_tutores_id_fk" FOREIGN KEY ("subido_por_tutor_id") REFERENCES "public"."tutores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tutores_sessions" ADD CONSTRAINT "tutores_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tutores"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tutores" ADD CONSTRAINT "tutores_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "codigos_vinculacion" ADD CONSTRAINT "codigos_vinculacion_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "codigos_vinculacion" ADD CONSTRAINT "codigos_vinculacion_usado_por_id_tutores_id_fk" FOREIGN KEY ("usado_por_id") REFERENCES "public"."tutores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "codigos_vinculacion" ADD CONSTRAINT "codigos_vinculacion_creado_por_id_users_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_creado_por_id_users_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "clientes_nombre_completo_idx" ON "clientes" USING btree ("nombre_completo");
  CREATE INDEX "clientes_telefono_idx" ON "clientes" USING btree ("telefono");
  CREATE INDEX "clientes_email_idx" ON "clientes" USING btree ("email");
  CREATE INDEX "clientes_activo_idx" ON "clientes" USING btree ("activo");
  CREATE INDEX "clientes_updated_at_idx" ON "clientes" USING btree ("updated_at");
  CREATE INDEX "clientes_created_at_idx" ON "clientes" USING btree ("created_at");
  CREATE INDEX "mascotas_alertas_manejo_order_idx" ON "mascotas_alertas_manejo" USING btree ("_order");
  CREATE INDEX "mascotas_alertas_manejo_parent_id_idx" ON "mascotas_alertas_manejo" USING btree ("_parent_id");
  CREATE INDEX "mascotas_tutores_order_idx" ON "mascotas_tutores" USING btree ("_order");
  CREATE INDEX "mascotas_tutores_parent_id_idx" ON "mascotas_tutores" USING btree ("_parent_id");
  CREATE INDEX "mascotas_tutores_cliente_idx" ON "mascotas_tutores" USING btree ("cliente_id");
  CREATE INDEX "mascotas_nombre_idx" ON "mascotas" USING btree ("nombre");
  CREATE INDEX "mascotas_especie_idx" ON "mascotas" USING btree ("especie");
  CREATE INDEX "mascotas_microchip_idx" ON "mascotas" USING btree ("microchip");
  CREATE INDEX "mascotas_medico_tratante_idx" ON "mascotas" USING btree ("medico_tratante_id");
  CREATE INDEX "mascotas_estado_idx" ON "mascotas" USING btree ("estado");
  CREATE INDEX "mascotas_updated_at_idx" ON "mascotas" USING btree ("updated_at");
  CREATE INDEX "mascotas_created_at_idx" ON "mascotas" USING btree ("created_at");
  CREATE INDEX "mas_pesos_mascota_idx" ON "mas_pesos" USING btree ("mascota_id");
  CREATE INDEX "mas_pesos_fecha_idx" ON "mas_pesos" USING btree ("fecha");
  CREATE INDEX "mas_pesos_registrado_por_idx" ON "mas_pesos" USING btree ("registrado_por_id");
  CREATE INDEX "mas_pesos_updated_at_idx" ON "mas_pesos" USING btree ("updated_at");
  CREATE INDEX "mas_pesos_created_at_idx" ON "mas_pesos" USING btree ("created_at");
  CREATE INDEX "mas_cartilla_mascota_idx" ON "mas_cartilla" USING btree ("mascota_id");
  CREATE INDEX "mas_cartilla_fecha_aplicacion_idx" ON "mas_cartilla" USING btree ("fecha_aplicacion");
  CREATE INDEX "mas_cartilla_proxima_fecha_idx" ON "mas_cartilla" USING btree ("proxima_fecha");
  CREATE INDEX "mas_cartilla_aplicado_por_idx" ON "mas_cartilla" USING btree ("aplicado_por_id");
  CREATE INDEX "mas_cartilla_registrado_por_idx" ON "mas_cartilla" USING btree ("registrado_por_id");
  CREATE INDEX "mas_cartilla_updated_at_idx" ON "mas_cartilla" USING btree ("updated_at");
  CREATE INDEX "mas_cartilla_created_at_idx" ON "mas_cartilla" USING btree ("created_at");
  CREATE INDEX "mas_notas_adendas_order_idx" ON "mas_notas_adendas" USING btree ("_order");
  CREATE INDEX "mas_notas_adendas_parent_id_idx" ON "mas_notas_adendas" USING btree ("_parent_id");
  CREATE INDEX "mas_notas_adendas_autor_idx" ON "mas_notas_adendas" USING btree ("autor_id");
  CREATE INDEX "mas_notas_mascota_idx" ON "mas_notas" USING btree ("mascota_id");
  CREATE INDEX "mas_notas_fecha_idx" ON "mas_notas" USING btree ("fecha");
  CREATE INDEX "mas_notas_autor_idx" ON "mas_notas" USING btree ("autor_id");
  CREATE INDEX "mas_notas_estado_idx" ON "mas_notas" USING btree ("estado");
  CREATE INDEX "mas_notas_firmada_por_idx" ON "mas_notas" USING btree ("firmada_por_id");
  CREATE INDEX "mas_notas_updated_at_idx" ON "mas_notas" USING btree ("updated_at");
  CREATE INDEX "mas_notas_created_at_idx" ON "mas_notas" USING btree ("created_at");
  CREATE INDEX "mas_documentos_mascota_idx" ON "mas_documentos" USING btree ("mascota_id");
  CREATE INDEX "mas_documentos_publicado_al_tutor_idx" ON "mas_documentos" USING btree ("publicado_al_tutor");
  CREATE INDEX "mas_documentos_subido_por_idx" ON "mas_documentos" USING btree ("subido_por_id");
  CREATE INDEX "mas_documentos_subido_por_tutor_idx" ON "mas_documentos" USING btree ("subido_por_tutor_id");
  CREATE INDEX "mas_documentos_updated_at_idx" ON "mas_documentos" USING btree ("updated_at");
  CREATE INDEX "mas_documentos_created_at_idx" ON "mas_documentos" USING btree ("created_at");
  CREATE INDEX "tutores_sessions_order_idx" ON "tutores_sessions" USING btree ("_order");
  CREATE INDEX "tutores_sessions_parent_id_idx" ON "tutores_sessions" USING btree ("_parent_id");
  CREATE INDEX "tutores_cliente_idx" ON "tutores" USING btree ("cliente_id");
  CREATE INDEX "tutores_updated_at_idx" ON "tutores" USING btree ("updated_at");
  CREATE INDEX "tutores_created_at_idx" ON "tutores" USING btree ("created_at");
  CREATE UNIQUE INDEX "tutores_email_idx" ON "tutores" USING btree ("email");
  CREATE UNIQUE INDEX "codigos_vinculacion_codigo_idx" ON "codigos_vinculacion" USING btree ("codigo");
  CREATE INDEX "codigos_vinculacion_cliente_idx" ON "codigos_vinculacion" USING btree ("cliente_id");
  CREATE INDEX "codigos_vinculacion_usado_por_idx" ON "codigos_vinculacion" USING btree ("usado_por_id");
  CREATE INDEX "codigos_vinculacion_creado_por_idx" ON "codigos_vinculacion" USING btree ("creado_por_id");
  CREATE INDEX "codigos_vinculacion_updated_at_idx" ON "codigos_vinculacion" USING btree ("updated_at");
  CREATE INDEX "codigos_vinculacion_created_at_idx" ON "codigos_vinculacion" USING btree ("created_at");
  CREATE INDEX "importaciones_creado_por_idx" ON "importaciones" USING btree ("creado_por_id");
  CREATE INDEX "importaciones_updated_at_idx" ON "importaciones" USING btree ("updated_at");
  CREATE INDEX "importaciones_created_at_idx" ON "importaciones" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clientes_fk" FOREIGN KEY ("clientes_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mascotas_fk" FOREIGN KEY ("mascotas_id") REFERENCES "public"."mascotas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mas_pesos_fk" FOREIGN KEY ("mas_pesos_id") REFERENCES "public"."mas_pesos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mas_cartilla_fk" FOREIGN KEY ("mas_cartilla_id") REFERENCES "public"."mas_cartilla"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mas_notas_fk" FOREIGN KEY ("mas_notas_id") REFERENCES "public"."mas_notas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mas_documentos_fk" FOREIGN KEY ("mas_documentos_id") REFERENCES "public"."mas_documentos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutores_fk" FOREIGN KEY ("tutores_id") REFERENCES "public"."tutores"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_codigos_vinculacion_fk" FOREIGN KEY ("codigos_vinculacion_id") REFERENCES "public"."codigos_vinculacion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_importaciones_fk" FOREIGN KEY ("importaciones_id") REFERENCES "public"."importaciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_tutores_fk" FOREIGN KEY ("tutores_id") REFERENCES "public"."tutores"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_clientes_id_idx" ON "payload_locked_documents_rels" USING btree ("clientes_id");
  CREATE INDEX "payload_locked_documents_rels_mascotas_id_idx" ON "payload_locked_documents_rels" USING btree ("mascotas_id");
  CREATE INDEX "payload_locked_documents_rels_mas_pesos_id_idx" ON "payload_locked_documents_rels" USING btree ("mas_pesos_id");
  CREATE INDEX "payload_locked_documents_rels_mas_cartilla_id_idx" ON "payload_locked_documents_rels" USING btree ("mas_cartilla_id");
  CREATE INDEX "payload_locked_documents_rels_mas_notas_id_idx" ON "payload_locked_documents_rels" USING btree ("mas_notas_id");
  CREATE INDEX "payload_locked_documents_rels_mas_documentos_id_idx" ON "payload_locked_documents_rels" USING btree ("mas_documentos_id");
  CREATE INDEX "payload_locked_documents_rels_tutores_id_idx" ON "payload_locked_documents_rels" USING btree ("tutores_id");
  CREATE INDEX "payload_locked_documents_rels_codigos_vinculacion_id_idx" ON "payload_locked_documents_rels" USING btree ("codigos_vinculacion_id");
  CREATE INDEX "payload_locked_documents_rels_importaciones_id_idx" ON "payload_locked_documents_rels" USING btree ("importaciones_id");
  CREATE INDEX "payload_preferences_rels_tutores_id_idx" ON "payload_preferences_rels" USING btree ("tutores_id");`)
  await activarRls({ db, payload, req })
}

/**
 * Supabase expone `public` por su API REST: toda tabla nueva nace con RLS
 * activado y sin políticas (ver 20261011_210000_rls_supabase.ts). Para la app
 * no cambia nada: entra como dueña de las tablas.
 */
async function activarRls({ db }: MigrateUpArgs): Promise<void> {
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
   ALTER TABLE "clientes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mascotas_alertas_manejo" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mascotas_tutores" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mascotas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mas_pesos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mas_cartilla" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mas_notas_adendas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mas_notas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mas_documentos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tutores_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tutores" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "codigos_vinculacion" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "importaciones" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "clientes" CASCADE;
  DROP TABLE "mascotas_alertas_manejo" CASCADE;
  DROP TABLE "mascotas_tutores" CASCADE;
  DROP TABLE "mascotas" CASCADE;
  DROP TABLE "mas_pesos" CASCADE;
  DROP TABLE "mas_cartilla" CASCADE;
  DROP TABLE "mas_notas_adendas" CASCADE;
  DROP TABLE "mas_notas" CASCADE;
  DROP TABLE "mas_documentos" CASCADE;
  DROP TABLE "tutores_sessions" CASCADE;
  DROP TABLE "tutores" CASCADE;
  DROP TABLE "codigos_vinculacion" CASCADE;
  DROP TABLE "importaciones" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_clientes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mascotas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mas_pesos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mas_cartilla_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mas_notas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_mas_documentos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutores_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_codigos_vinculacion_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_importaciones_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_tutores_fk";
  
  DROP INDEX "payload_locked_documents_rels_clientes_id_idx";
  DROP INDEX "payload_locked_documents_rels_mascotas_id_idx";
  DROP INDEX "payload_locked_documents_rels_mas_pesos_id_idx";
  DROP INDEX "payload_locked_documents_rels_mas_cartilla_id_idx";
  DROP INDEX "payload_locked_documents_rels_mas_notas_id_idx";
  DROP INDEX "payload_locked_documents_rels_mas_documentos_id_idx";
  DROP INDEX "payload_locked_documents_rels_tutores_id_idx";
  DROP INDEX "payload_locked_documents_rels_codigos_vinculacion_id_idx";
  DROP INDEX "payload_locked_documents_rels_importaciones_id_idx";
  DROP INDEX "payload_preferences_rels_tutores_id_idx";
  ALTER TABLE "roles" DROP COLUMN "clinica_ver_pacientes";
  ALTER TABLE "roles" DROP COLUMN "clinica_editar_pacientes";
  ALTER TABLE "roles" DROP COLUMN "clinica_ver_expediente";
  ALTER TABLE "roles" DROP COLUMN "clinica_escribir_expediente";
  ALTER TABLE "roles" DROP COLUMN "clinica_importar";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "clientes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mascotas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mas_pesos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mas_cartilla_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mas_notas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mas_documentos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutores_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "codigos_vinculacion_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "importaciones_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "tutores_id";
  DROP TYPE "public"."enum_clientes_origen";
  DROP TYPE "public"."enum_mascotas_especie";
  DROP TYPE "public"."enum_mascotas_sexo";
  DROP TYPE "public"."enum_mascotas_esterilizado";
  DROP TYPE "public"."enum_mascotas_estado";
  DROP TYPE "public"."enum_mascotas_origen";
  DROP TYPE "public"."enum_mas_cartilla_tipo";
  DROP TYPE "public"."enum_mas_notas_tipo";
  DROP TYPE "public"."enum_mas_notas_estado";
  DROP TYPE "public"."enum_mas_documentos_tipo";
  DROP TYPE "public"."enum_mas_documentos_origen";
  DROP TYPE "public"."enum_mas_documentos_revision";
  DROP TYPE "public"."enum_importaciones_estado";`)
}
