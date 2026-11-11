import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requestLocale } from "../../../../_lib"
import { toStoreArticle } from "../../../../../lib/serialize"
import { getSettings } from "../../../../../lib/settings"
import { findPublicPostBySlug, listPublicPosts, morePosts, storeContext } from "../../../../../lib/store"

/**
 * GET /store/blog-seo/posts/{slug}?locale= — one public article in the locale (fallback applied), plus up to 3 more.
 * A former slug, another locale's slug, or the default slug of a since-translated locale answers
 * { post: null, redirect: "<current slug>", status: 301, locale } (HTTP 200): the storefront redirects permanently.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const settings = await getSettings(req.scope)
  const ctx = await storeContext(req.scope, requestLocale(req, settings))
  const slug = String(req.params.slug ?? "").toLowerCase()
  const found = /^[a-z0-9][a-z0-9-]{0,119}$/.test(slug) ? await findPublicPostBySlug(req.scope, ctx, slug) : null
  if (found?.redirect) {
    res.json({ post: null, redirect: found.redirect, status: 301, locale: ctx.locale })
    return
  }
  const article = found ? toStoreArticle(found.post, ctx.locale, ctx.settings, ctx.options) : null
  if (!found || !article) {
    res.status(404).json({ type: "not_found", message: "Post not found" })
    return
  }
  res.json({ post: article, more: morePosts(await listPublicPosts(req.scope, ctx), found.post, ctx) })
}
