import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requestLocale } from "../../../../_lib"
import { AUTHOR_RELATIONS } from "../../../../../lib/authors"
import { toStoreAuthor, type AuthorRow } from "../../../../../lib/serialize"
import { getSettings } from "../../../../../lib/settings"
import { listPublicPosts, readable, storeContext } from "../../../../../lib/store"
import { BLOG_SEO_MODULE } from "../../../../../modules/blog-seo"

/** GET /store/blog-seo/authors/{slug}?locale= — one author (posts: /store/blog-seo/posts?author={slug}) */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const settings = await getSettings(req.scope)
  const ctx = await storeContext(req.scope, requestLocale(req, settings))
  const svc = req.scope.resolve(BLOG_SEO_MODULE) as any
  const [author] = (await svc.listBseoAuthors({ slug: String(req.params.slug ?? "").toLowerCase() }, { relations: AUTHOR_RELATIONS, take: 1 })) as AuthorRow[]
  if (!author) {
    res.status(404).json({ type: "not_found", message: "Author not found" })
    return
  }
  const posts = readable(await listPublicPosts(req.scope, ctx, { author_id: author.id }), ctx)
  res.json({ author: { ...toStoreAuthor(author, ctx.locale, ctx.settings), post_count: posts.length }, locale: ctx.locale })
}
