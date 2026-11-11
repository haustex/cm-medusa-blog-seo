import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { pagination, requestLocale } from "../../../_lib"
import { BLOG_SEO_MODULE } from "../../../../modules/blog-seo"
import { toIndexRow, toStoreCard, type CategoryRow, type StoreCard } from "../../../../lib/serialize"
import { getSettings } from "../../../../lib/settings"
import { categoryView, findCategoryBySlug, listPublicPosts, readable, storeContext } from "../../../../lib/store"
import type { StoreListPostsType } from "../../../validators"

/**
 * GET /store/blog-seo/posts?locale=&category={slug}&author={slug}&tag=&featured=separate|none&limit=12&offset=0
 *   Public posts readable in the locale, newest first. Without a filter the featured post (flagged, else the newest)
 *   is answered separately and left out of `posts`, so pages never repeat it (`featured=none` turns that off).
 * GET /store/blog-seo/posts?view=index
 *   Every public post with every readable locale's slug/title/excerpt: sitemaps, feeds, hreflang, llms.txt.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = req.validatedQuery as StoreListPostsType
  const settings = await getSettings(req.scope)
  const ctx = await storeContext(req.scope, requestLocale(req, settings))
  if (q.view === "index") {
    const posts = await listPublicPosts(req.scope, ctx)
    res.json({ posts: posts.map((p) => toIndexRow(p, ctx.settings, ctx.options)).filter((r) => Object.keys(r.locales).length) })
    return
  }
  const { limit, offset } = pagination(q as Record<string, unknown>, 12, 100)
  const filters: Record<string, unknown> = {}
  let category: CategoryRow | null = null
  if (q.category) {
    const c = await findCategoryBySlug(req.scope, ctx, q.category)
    if (!c) {
      res.status(404).json({ type: "not_found", message: "Category not found" })
      return
    }
    category = c
    filters.category_id = c.id
  }
  let author: { id: string } | null = null
  if (q.author) {
    const svc = req.scope.resolve(BLOG_SEO_MODULE) as any
    ;[author] = await svc.listBseoAuthors({ slug: q.author }, { select: ["id"], take: 1 })
    if (!author) {
      res.status(404).json({ type: "not_found", message: "Author not found" })
      return
    }
    filters.author_id = author.id
  }
  let posts = readable(await listPublicPosts(req.scope, ctx, filters), ctx)
  if (q.tag) {
    const tag = q.tag.toLowerCase()
    posts = posts.filter((p) => (p.translations ?? []).some((t) => (t.tags ?? []).some((x) => x.toLowerCase() === tag)))
  }
  const separate = q.featured ? q.featured === "separate" : !q.category && !q.author && !q.tag
  let featured: StoreCard | null = null
  if (separate && posts.length) {
    const f = posts.find((p) => p.featured) ?? posts[0]
    featured = toStoreCard(f, ctx.locale, ctx.settings, ctx.options)
    posts = posts.filter((p) => p.id !== f.id)
  }
  res.json({
    posts: posts.slice(offset, offset + limit).map((p) => toStoreCard(p, ctx.locale, ctx.settings, ctx.options)),
    featured,
    category: categoryView(category, ctx),
    locale: ctx.locale,
    count: posts.length,
    limit,
    offset,
  })
}
