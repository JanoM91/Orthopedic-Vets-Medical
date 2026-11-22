import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cir_presupuestos_estado" AS ENUM('borrador', 'enviado', 'aceptado', 'rechazado', 'cancelado');
  CREATE TYPE "public"."enum_cir_consentimientos_via" AS ENUM('portal', 'clinica');
  CREATE TABLE "cir_presupuestos_renglones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"concepto" varchar NOT NULL,
  	"servicio_id" integer,
  	"cantidad" numeric NOT NULL,
  	"precio_unitario" numeric NOT NULL,
  	"importe" numeric NOT NULL
  );
  
  CREATE TABLE "cir_presupuestos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"cliente_id" integer,
  	"medico_id" integer,
  	"procedimiento" varchar NOT NULL,
  	"explicacion" varchar,
  	"riesgos" varchar,
  	"indicaciones" varchar,
  	"total" numeric NOT NULL,
  	"anticipo" numeric,
  	"vence" varchar,
  	"estado" "enum_cir_presupuestos_estado" DEFAULT 'borrador' NOT NULL,
  	"enviado_en" timestamp(3) with time zone,
  	"respondido_en" timestamp(3) with time zone,
  	"motivo_rechazo" varchar,
  	"motivo_cancelacion" varchar,
  	"consentimiento_id" integer,
  	"notas_internas" varchar,
  	"creado_por_id" integer,
  	"token" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cir_consentimientos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"presupuesto_id" integer NOT NULL,
  	"mascota_id" integer NOT NULL,
  	"cliente_id" integer,
  	"texto" varchar NOT NULL,
  	"resumen" jsonb NOT NULL,
  	"firma" varchar NOT NULL,
  	"nombre_firmante" varchar NOT NULL,
  	"via" "enum_cir_consentimientos_via" NOT NULL,
  	"tutor_id" integer,
  	"testigo_id" integer,
  	"firmado_en" timestamp(3) with time zone NOT NULL,
  	"ip" varchar,
  	"navegador" varchar,
  	"huella" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cirugia_configuracion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"texto_consentimiento" varchar DEFAULT 'Yo, {{tutor}}, como propietario(a) o responsable de {{mascota}} ({{especie}}), autorizo a {{clinica}} y a su equipo médico, a cargo de {{medico}}, a realizar el procedimiento: {{procedimiento}}, junto con la anestesia, los estudios y los medicamentos que el equipo considere necesarios para ese procedimiento.
  
  Se me explicó en qué consiste, por qué se recomienda, qué alternativas hay y cuáles son sus riesgos. Entiendo que todo procedimiento con anestesia tiene riesgos, incluso de complicaciones graves o de muerte, aun cuando se tomen todas las precauciones. Riesgos particulares de este caso: {{riesgos}}
  
  Si durante el procedimiento surge una situación que ponga en riesgo la vida de mi mascota, autorizo al equipo médico a actuar de inmediato; intentarán comunicarse conmigo en cuanto sea posible.
  
  Conozco el presupuesto ({{total}}). Sé que puede cambiar si se presentan hallazgos o complicaciones; en ese caso me avisarán antes de continuar, salvo una urgencia.
  
  Me comprometo a seguir las indicaciones de antes y después del procedimiento (ayuno, cuidados en casa, medicamentos y revisiones).
  
  Declaro que pude hacer todas mis preguntas y que me fueron respondidas.' NOT NULL,
  	"vigencia_dias" numeric DEFAULT 15 NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "citas" ADD COLUMN "presupuesto_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cir_presupuestos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cir_consentimientos_id" integer;
  ALTER TABLE "cir_presupuestos_renglones" ADD CONSTRAINT "cir_presupuestos_renglones_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_presupuestos_renglones" ADD CONSTRAINT "cir_presupuestos_renglones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cir_presupuestos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cir_presupuestos" ADD CONSTRAINT "cir_presupuestos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_presupuestos" ADD CONSTRAINT "cir_presupuestos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_presupuestos" ADD CONSTRAINT "cir_presupuestos_medico_id_users_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_presupuestos" ADD CONSTRAINT "cir_presupuestos_consentimiento_id_cir_consentimientos_id_fk" FOREIGN KEY ("consentimiento_id") REFERENCES "public"."cir_consentimientos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_presupuestos" ADD CONSTRAINT "cir_presupuestos_creado_por_id_users_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_consentimientos" ADD CONSTRAINT "cir_consentimientos_presupuesto_id_cir_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."cir_presupuestos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_consentimientos" ADD CONSTRAINT "cir_consentimientos_mascota_id_mascotas_id_fk" FOREIGN KEY ("mascota_id") REFERENCES "public"."mascotas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_consentimientos" ADD CONSTRAINT "cir_consentimientos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_consentimientos" ADD CONSTRAINT "cir_consentimientos_tutor_id_tutores_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cir_consentimientos" ADD CONSTRAINT "cir_consentimientos_testigo_id_users_id_fk" FOREIGN KEY ("testigo_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "cir_presupuestos_renglones_order_idx" ON "cir_presupuestos_renglones" USING btree ("_order");
  CREATE INDEX "cir_presupuestos_renglones_parent_id_idx" ON "cir_presupuestos_renglones" USING btree ("_parent_id");
  CREATE INDEX "cir_presupuestos_renglones_servicio_idx" ON "cir_presupuestos_renglones" USING btree ("servicio_id");
  CREATE INDEX "cir_presupuestos_mascota_idx" ON "cir_presupuestos" USING btree ("mascota_id");
  CREATE INDEX "cir_presupuestos_cliente_idx" ON "cir_presupuestos" USING btree ("cliente_id");
  CREATE INDEX "cir_presupuestos_medico_idx" ON "cir_presupuestos" USING btree ("medico_id");
  CREATE INDEX "cir_presupuestos_vence_idx" ON "cir_presupuestos" USING btree ("vence");
  CREATE INDEX "cir_presupuestos_estado_idx" ON "cir_presupuestos" USING btree ("estado");
  CREATE INDEX "cir_presupuestos_consentimiento_idx" ON "cir_presupuestos" USING btree ("consentimiento_id");
  CREATE INDEX "cir_presupuestos_creado_por_idx" ON "cir_presupuestos" USING btree ("creado_por_id");
  CREATE INDEX "cir_presupuestos_token_idx" ON "cir_presupuestos" USING btree ("token");
  CREATE INDEX "cir_presupuestos_updated_at_idx" ON "cir_presupuestos" USING btree ("updated_at");
  CREATE INDEX "cir_presupuestos_created_at_idx" ON "cir_presupuestos" USING btree ("created_at");
  CREATE UNIQUE INDEX "cir_consentimientos_presupuesto_idx" ON "cir_consentimientos" USING btree ("presupuesto_id");
  CREATE INDEX "cir_consentimientos_mascota_idx" ON "cir_consentimientos" USING btree ("mascota_id");
  CREATE INDEX "cir_consentimientos_cliente_idx" ON "cir_consentimientos" USING btree ("cliente_id");
  CREATE INDEX "cir_consentimientos_tutor_idx" ON "cir_consentimientos" USING btree ("tutor_id");
  CREATE INDEX "cir_consentimientos_testigo_idx" ON "cir_consentimientos" USING btree ("testigo_id");
  CREATE INDEX "cir_consentimientos_updated_at_idx" ON "cir_consentimientos" USING btree ("updated_at");
  CREATE INDEX "cir_consentimientos_created_at_idx" ON "cir_consentimientos" USING btree ("created_at");
  ALTER TABLE "citas" ADD CONSTRAINT "citas_presupuesto_id_cir_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."cir_presupuestos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cir_presupuestos_fk" FOREIGN KEY ("cir_presupuestos_id") REFERENCES "public"."cir_presupuestos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cir_consentimientos_fk" FOREIGN KEY ("cir_consentimientos_id") REFERENCES "public"."cir_consentimientos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "citas_presupuesto_idx" ON "citas" USING btree ("presupuesto_id");
  CREATE INDEX "payload_locked_documents_rels_cir_presupuestos_id_idx" ON "payload_locked_documents_rels" USING btree ("cir_presupuestos_id");
  CREATE INDEX "payload_locked_documents_rels_cir_consentimientos_id_idx" ON "payload_locked_documents_rels" USING btree ("cir_consentimientos_id");
  ALTER TABLE "cir_presupuestos_renglones" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "cir_presupuestos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "cir_consentimientos" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "cirugia_configuracion" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cir_presupuestos_renglones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cir_presupuestos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cir_consentimientos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cirugia_configuracion" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cir_presupuestos_renglones" CASCADE;
  DROP TABLE "cir_presupuestos" CASCADE;
  DROP TABLE "cir_consentimientos" CASCADE;
  DROP TABLE "cirugia_configuracion" CASCADE;
  ALTER TABLE "citas" DROP CONSTRAINT "citas_presupuesto_id_cir_presupuestos_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_cir_presupuestos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_cir_consentimientos_fk";
  
  DROP INDEX "citas_presupuesto_idx";
  DROP INDEX "payload_locked_documents_rels_cir_presupuestos_id_idx";
  DROP INDEX "payload_locked_documents_rels_cir_consentimientos_id_idx";
  ALTER TABLE "citas" DROP COLUMN "presupuesto_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cir_presupuestos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cir_consentimientos_id";
  DROP TYPE "public"."enum_cir_presupuestos_estado";
  DROP TYPE "public"."enum_cir_consentimientos_via";`)
}
