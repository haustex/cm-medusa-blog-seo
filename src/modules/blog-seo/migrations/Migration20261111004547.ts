import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261111004547 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "bseo_post_translation" drop constraint if exists "bseo_post_translation_locale_slug_unique";`);
    this.addSql(`alter table if exists "bseo_post_translation" drop constraint if exists "bseo_post_translation_post_id_locale_unique";`);
    this.addSql(`alter table if exists "bseo_post" drop constraint if exists "bseo_post_preview_token_unique";`);
    this.addSql(`alter table if exists "bseo_category_translation" drop constraint if exists "bseo_category_translation_locale_slug_unique";`);
    this.addSql(`alter table if exists "bseo_category_translation" drop constraint if exists "bseo_category_translation_category_id_locale_unique";`);
    this.addSql(`alter table if exists "bseo_author_translation" drop constraint if exists "bseo_author_translation_author_id_locale_unique";`);
    this.addSql(`alter table if exists "bseo_author" drop constraint if exists "bseo_author_slug_unique";`);
    this.addSql(`create table if not exists "bseo_author" ("id" text not null, "slug" text not null, "name" text not null, "type" text check ("type" in ('person', 'organization')) not null default 'person', "avatar" text null, "url" text null, "same_as" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bseo_author_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_author_deleted_at" ON "bseo_author" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bseo_author_slug_unique" ON "bseo_author" ("slug") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "bseo_author_translation" ("id" text not null, "locale" text not null, "job_title" text null, "bio" text null, "author_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bseo_author_translation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_author_translation_author_id" ON "bseo_author_translation" ("author_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_author_translation_deleted_at" ON "bseo_author_translation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bseo_author_translation_author_id_locale_unique" ON "bseo_author_translation" ("author_id", "locale") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "bseo_category" ("id" text not null, "rank" integer not null default 0, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bseo_category_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_category_deleted_at" ON "bseo_category" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "bseo_category_translation" ("id" text not null, "locale" text not null, "name" text not null, "slug" text not null, "description" text null, "category_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bseo_category_translation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_category_translation_category_id" ON "bseo_category_translation" ("category_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_category_translation_deleted_at" ON "bseo_category_translation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bseo_category_translation_category_id_locale_unique" ON "bseo_category_translation" ("category_id", "locale") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bseo_category_translation_locale_slug_unique" ON "bseo_category_translation" ("locale", "slug") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "bseo_post" ("id" text not null, "status" text check ("status" in ('draft', 'scheduled', 'published')) not null default 'draft', "published_at" timestamptz null, "content_updated_at" timestamptz null, "featured" boolean not null default false, "cover" text null, "cover_wide" text null, "preview_token" text not null, "product_ids" jsonb null, "metadata" jsonb null, "author_id" text null, "category_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bseo_post_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_author_id" ON "bseo_post" ("author_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_category_id" ON "bseo_post" ("category_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_deleted_at" ON "bseo_post" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_status_published_at" ON "bseo_post" ("status", "published_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bseo_post_preview_token_unique" ON "bseo_post" ("preview_token") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "bseo_post_translation" ("id" text not null, "locale" text not null, "title" text not null default '', "slug" text not null, "excerpt" text not null default '', "body" text not null default '', "seo_title" text null, "seo_description" text null, "og_image" text null, "cover_alt" text null, "tags" jsonb null, "post_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bseo_post_translation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_translation_post_id" ON "bseo_post_translation" ("post_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_post_translation_deleted_at" ON "bseo_post_translation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bseo_post_translation_post_id_locale_unique" ON "bseo_post_translation" ("post_id", "locale") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bseo_post_translation_locale_slug_unique" ON "bseo_post_translation" ("locale", "slug") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "bseo_settings" ("id" text not null, "locales" jsonb not null, "default_locale" text not null, "fallback" text check ("fallback" in ('default', 'hide', 'label')) not null default 'default', "routing" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bseo_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bseo_settings_deleted_at" ON "bseo_settings" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "bseo_author_translation" add constraint "bseo_author_translation_author_id_foreign" foreign key ("author_id") references "bseo_author" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "bseo_category_translation" add constraint "bseo_category_translation_category_id_foreign" foreign key ("category_id") references "bseo_category" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "bseo_post" add constraint "bseo_post_author_id_foreign" foreign key ("author_id") references "bseo_author" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table if exists "bseo_post" add constraint "bseo_post_category_id_foreign" foreign key ("category_id") references "bseo_category" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table if exists "bseo_post_translation" add constraint "bseo_post_translation_post_id_foreign" foreign key ("post_id") references "bseo_post" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "bseo_author_translation" drop constraint if exists "bseo_author_translation_author_id_foreign";`);

    this.addSql(`alter table if exists "bseo_post" drop constraint if exists "bseo_post_author_id_foreign";`);

    this.addSql(`alter table if exists "bseo_category_translation" drop constraint if exists "bseo_category_translation_category_id_foreign";`);

    this.addSql(`alter table if exists "bseo_post" drop constraint if exists "bseo_post_category_id_foreign";`);

    this.addSql(`alter table if exists "bseo_post_translation" drop constraint if exists "bseo_post_translation_post_id_foreign";`);

    this.addSql(`drop table if exists "bseo_author" cascade;`);

    this.addSql(`drop table if exists "bseo_author_translation" cascade;`);

    this.addSql(`drop table if exists "bseo_category" cascade;`);

    this.addSql(`drop table if exists "bseo_category_translation" cascade;`);

    this.addSql(`drop table if exists "bseo_post" cascade;`);

    this.addSql(`drop table if exists "bseo_post_translation" cascade;`);

    this.addSql(`drop table if exists "bseo_settings" cascade;`);
  }

}
