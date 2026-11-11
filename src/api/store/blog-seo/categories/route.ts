import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requestLocale } from "../../../_lib"
import { CATEGORY_RELATIONS } from "../../../../lib/categories"
import type { CategoryRow } from "../../../../lib/serialize"
import { getSettings } from "../../../../lib/settings"
import { categoryView, listPublicPosts, readable, storeContext } from "../../../../lib/store"
import { BLOG_SEO_MODULE } from "../../../../modules/blog-seo"

/** GET /store/blog-seo/categories?locale= — every category, by rank, with the number of readable posts */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const settings = await getSettings(req.scope)
  const ctx = await storeContext(req.scope, requestLocale(req, settings))
  const svc = req.scope.resolve(BLOG_SEO_MODULE) as any
  const rows: CategoryRow[] = await svc.listBseoCategories({}, { relations: CATEGORY_RELATIONS, order: { rank: "ASC", created_at: "ASC" }, take: 500 })
  const posts = readable(await listPublicPosts(req.scope, ctx), ctx)
  const counts: Record<string, number> = {}
  for (const p of posts) if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1
  res.json({ categories: rows.map((c) => ({ ...categoryView(c, ctx), post_count: counts[c.id] ?? 0 })).filter((c) => c.id), locale: ctx.locale })
}
