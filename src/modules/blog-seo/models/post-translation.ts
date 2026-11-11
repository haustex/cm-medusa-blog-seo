import { model } from "@medusajs/framework/utils"
import Post from "./post"

/** One language of an article. `body` is sanitized HTML (lib/sanitize.ts); it is only ever written through the plugin. */
const PostTranslation = model
  .define("bseo_post_translation", {
    id: model.id({ prefix: "bseopotr" }).primaryKey(),
    locale: model.text(),
    title: model.text().searchable().default(""),
    /** Unique per locale: /blog/{slug}. Made from the title until set by hand. */
    slug: model.text(),
    excerpt: model.text().default(""),
    body: model.text().default(""),
    seo_title: model.text().nullable(),
    seo_description: model.text().nullable(),
    /** Share image for this language (File Module URL); default: the wide cover */
    og_image: model.text().nullable(),
    cover_alt: model.text().nullable(),
    /** string[] */
    tags: model.json().nullable(),
    post: model.belongsTo(() => Post, { mappedBy: "translations" }),
  })
  .indexes([
    { on: ["post_id", "locale"], unique: true, where: "deleted_at IS NULL" },
    { on: ["locale", "slug"], unique: true, where: "deleted_at IS NULL" },
  ])

export default PostTranslation
