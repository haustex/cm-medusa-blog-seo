import { model } from "@medusajs/framework/utils"
import Author from "./author"
import Category from "./category"
import PostTranslation from "./post-translation"

/**
 * An article. Everything readers see in a language lives in its translation (one row per locale); this row holds
 * what is shared: status and dates, covers, author, category, related products.
 *
 * status: draft → scheduled (published_at in the future, the job publishes it) → published.
 * The default locale must be complete before a post can be scheduled or published; other locales follow the
 * settings' fallback rule (lib/visibility.ts).
 */
const Post = model
  .define("bseo_post", {
    id: model.id({ prefix: "bseopost" }).primaryKey(),
    status: model.enum(["draft", "scheduled", "published"]).default("draft"),
    /** When the article went (or will go) public: datePublished */
    published_at: model.dateTime().nullable(),
    /** Last change of public content: dateModified, sitemap lastmod */
    content_updated_at: model.dateTime().nullable(),
    /** Shown large at the top of the blog; at most one */
    featured: model.boolean().default(false),
    /** Square cover (cards) and the wide one (article page, og:image): File Module URLs */
    cover: model.text().nullable(),
    cover_wide: model.text().nullable(),
    /** Secret of the preview link; any status, every locale */
    preview_token: model.text(),
    /** Related products in display order (the module link bseo_post <-> product holds the relation) */
    product_ids: model.json().nullable(),
    metadata: model.json().nullable(),
    author: model.belongsTo(() => Author, { mappedBy: "posts" }).nullable(),
    category: model.belongsTo(() => Category, { mappedBy: "posts" }).nullable(),
    translations: model.hasMany(() => PostTranslation, { mappedBy: "post" }),
  })
  .cascades({ delete: ["translations"] })
  .indexes([{ on: ["status", "published_at"] }, { on: ["preview_token"], unique: true, where: "deleted_at IS NULL" }])

export default Post
