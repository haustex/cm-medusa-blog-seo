import { model } from "@medusajs/framework/utils"
import Post from "./post"

/**
 * Former slugs of a post per locale. A request for an old slug answers a permanent redirect to the post's current
 * slug in that locale, so an edited slug (or a locale that moved from the fallback text to its own translation)
 * never 404s. Rows point at the post, never at another slug: no redirect chains, no loops.
 */
const PostSlugHistory = model
  .define("bseo_post_slug_history", {
    id: model.id({ prefix: "bseoslug" }).primaryKey(),
    locale: model.text(),
    slug: model.text(),
    post: model.belongsTo(() => Post, { mappedBy: "slug_history" }),
  })
  .indexes([{ on: ["locale", "slug"] }])

export default PostSlugHistory
