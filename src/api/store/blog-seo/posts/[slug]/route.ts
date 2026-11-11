import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requestLocale } from "../../../../_lib"
import { toStoreArticle } from "../../../../../lib/serialize"
import { getSettings } from "../../../../../lib/settings"
import { findPublicPostBySlug, listPublicPosts, morePosts, storeContext } from "../../../../../lib/store"

/** GET /store/blog-seo/posts/{slug}?locale= — one public article in the locale (fallback applied), plus up to 3 more */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const settings = await getSettings(req.scope)
  const ctx = await storeContext(req.scope, requestLocale(req, settings))
  const slug = String(req.params.slug ?? "").toLowerCase()
  const post = /^[a-z0-9][a-z0-9-]{0,119}$/.test(slug) ? await findPublicPostBySlug(req.scope, ctx, slug) : null
  const article = post ? toStoreArticle(post, ctx.locale, ctx.settings, ctx.options) : null
  if (!post || !article) {
    res.status(404).json({ type: "not_found", message: "Post not found" })
    return
  }
  res.json({ post: article, more: morePosts(await listPublicPosts(req.scope, ctx), post, ctx) })
}
