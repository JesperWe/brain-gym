import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "maths"."players" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ably_client_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"avatar" varchar NOT NULL,
  	"last_seen_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "maths"."games" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player1_id" integer NOT NULL,
  	"player2_id" integer NOT NULL,
  	"player1_score" numeric NOT NULL,
  	"player2_score" numeric NOT NULL,
  	"ended_at" timestamp(3) with time zone NOT NULL,
  	"channel" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "maths"."payload_locked_documents_rels" ADD COLUMN "players_id" integer;
  ALTER TABLE "maths"."payload_locked_documents_rels" ADD COLUMN "games_id" integer;
  ALTER TABLE "maths"."games" ADD CONSTRAINT "games_player1_id_players_id_fk" FOREIGN KEY ("player1_id") REFERENCES "maths"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maths"."games" ADD CONSTRAINT "games_player2_id_players_id_fk" FOREIGN KEY ("player2_id") REFERENCES "maths"."players"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "players_ably_client_id_idx" ON "maths"."players" USING btree ("ably_client_id");
  CREATE INDEX "players_updated_at_idx" ON "maths"."players" USING btree ("updated_at");
  CREATE INDEX "players_created_at_idx" ON "maths"."players" USING btree ("created_at");
  CREATE INDEX "games_player1_idx" ON "maths"."games" USING btree ("player1_id");
  CREATE INDEX "games_player2_idx" ON "maths"."games" USING btree ("player2_id");
  CREATE INDEX "games_updated_at_idx" ON "maths"."games" USING btree ("updated_at");
  CREATE INDEX "games_created_at_idx" ON "maths"."games" USING btree ("created_at");
  ALTER TABLE "maths"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_players_fk" FOREIGN KEY ("players_id") REFERENCES "maths"."players"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maths"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_games_fk" FOREIGN KEY ("games_id") REFERENCES "maths"."games"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_players_id_idx" ON "maths"."payload_locked_documents_rels" USING btree ("players_id");
  CREATE INDEX "payload_locked_documents_rels_games_id_idx" ON "maths"."payload_locked_documents_rels" USING btree ("games_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "maths"."players" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "maths"."games" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "maths"."players" CASCADE;
  DROP TABLE "maths"."games" CASCADE;
  ALTER TABLE "maths"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_players_fk";
  
  ALTER TABLE "maths"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_games_fk";
  
  DROP INDEX "maths"."payload_locked_documents_rels_players_id_idx";
  DROP INDEX "maths"."payload_locked_documents_rels_games_id_idx";
  ALTER TABLE "maths"."payload_locked_documents_rels" DROP COLUMN "players_id";
  ALTER TABLE "maths"."payload_locked_documents_rels" DROP COLUMN "games_id";`)
}
