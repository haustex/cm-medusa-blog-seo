import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requestLocale } from "../../../_lib"
import { AUTHOR_RELATIONS } from "../../../../lib/authors"
import { toStoreAuthor, type AuthorRow } from "../../../../lib/serialize"
import { getSettings } from "../../../../lib/settings"
import { listPublicPosts, readable, storeContext } from "../../../../lib/store"
import { BLOG_SEO_MODULE } from "../../../../modules/blog-seo"

/** GET /store/blog-seo/authors?locale= — authors with at least one readable post */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const settings = await getSettings(req.scope)
  const ctx = await storeContext(req.scope, requestLocale(req, settings))
  const svc = req.scope.resolve(BLOG_SEO_MODULE) as any
  const rows: AuthorRow[] = await svc.listBseoAuthors({}, { relations: AUTHOR_RELATIONS, order: { name: "ASC" }, take: 500 })
  const posts = readable(await listPublicPosts(req.scope, ctx), ctx)
  const counts: Record<string, number> = {}
  for (const p of posts) if (p.author_id) counts[p.author_id] = (counts[p.author_id] ?? 0) + 1
  res.json({ authors: rows.filter((a) => counts[a.id]).map((a) => ({ ...toStoreAuthor(a, ctx.locale, ctx.settings), post_count: counts[a.id] })), locale: ctx.locale })
}
