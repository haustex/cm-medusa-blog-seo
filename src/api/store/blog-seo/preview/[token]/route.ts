import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { timingSafeEqual } from "node:crypto"
import { requestLocale } from "../../../../_lib"
import { RELATIONS } from "../../../../../lib/posts"
import { pickTranslation, rulesOf, toStoreArticle, type Picked, type PostRow } from "../../../../../lib/serialize"
import { getSettings } from "../../../../../lib/settings"
import { listPublicPosts, morePosts, storeContext } from "../../../../../lib/store"
import { BLOG_SEO_MODULE } from "../../../../../modules/blog-seo"

/**
 * GET /store/blog-seo/preview/{token}?locale= — any post (draft, scheduled, published) by its secret preview token,
 * for the Admin's preview button. In preview the locale's own translation is shown even when incomplete (so a
 * translator sees their draft); `translated` and `complete` tell the page what it is looking at. Never cache this.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const token = String(req.params.token ?? "")
  const svc = req.scope.resolve(BLOG_SEO_MODULE) as any
  const [post] = (/^[A-Za-z0-9_-]{20,64}$/.test(token) ? await svc.listBseoPosts({ preview_token: token }, { relations: RELATIONS, take: 1 }) : []) as PostRow[]
  const a = new Uint8Array(Buffer.from(token)), b = new Uint8Array(Buffer.from(String(post?.preview_token ?? "")))
  if (!post || a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(404).json({ type: "not_found", message: "Preview not found" })
    return
  }
  const settings = await getSettings(req.scope)
  const ctx = await storeContext(req.scope, requestLocale(req, settings))
  const rules = rulesOf(ctx.options)
  const own = (post.translations ?? []).find((t) => t.locale.toLowerCase() === ctx.locale.toLowerCase())
  const picked = pickTranslation(post, ctx.locale, ctx.settings, rules)
  const def = (post.translations ?? []).find((t) => t.locale.toLowerCase() === ctx.settings.default_locale.toLowerCase())
  // the locale's own draft when there is one (even incomplete); else what readers would get; else the default locale as is
  const shown = own && (!picked || !picked.translated) ? own : picked ? null : (def ?? (post.translations ?? [])[0])
  const force: Picked | undefined = shown ? { translation: { ...shown, title: shown.title || "(untitled)", body: shown.body || "<p></p>", slug: shown.slug || "preview" }, translated: shown === own } : undefined
  const article = toStoreArticle(post, ctx.locale, ctx.settings, ctx.options, force)
  if (!article) {
    res.status(404).json({ type: "not_found", message: "Nothing to preview in this locale" })
    return
  }
  const complete = !!picked?.translated
  res.json({ post: { ...article, status: post.status, complete, preview: true }, more: morePosts(await listPublicPosts(req.scope, ctx), post, ctx) })
}
