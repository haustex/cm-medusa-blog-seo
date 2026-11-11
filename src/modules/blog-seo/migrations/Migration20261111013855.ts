import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261111013855 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "bseo_post_slug_history" ("id" text not null, "locale" text not null, "slug" text not null, "post_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bseo_post_slug_history_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_slug_history_post_id" ON "bseo_post_slug_history" ("post_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_slug_history_deleted_at" ON "bseo_post_slug_history" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_slug_history_locale_slug" ON "bseo_post_slug_history" ("locale", "slug") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "bseo_post_slug_history" add constraint "bseo_post_slug_history_post_id_foreign" foreign key ("post_id") references "bseo_post" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bseo_post_slug_history" cascade;`);
  }

}
