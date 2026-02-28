import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "maths"."games" ADD COLUMN "game_id" varchar;
   UPDATE "maths"."games" SET "game_id" = gen_random_uuid()::varchar WHERE "game_id" IS NULL;
   ALTER TABLE "maths"."games" ALTER COLUMN "game_id" SET NOT NULL;
   CREATE UNIQUE INDEX "games_game_id_idx" ON "maths"."games" USING btree ("game_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "maths"."games_game_id_idx";
  ALTER TABLE "maths"."games" DROP COLUMN "game_id";`)
}
