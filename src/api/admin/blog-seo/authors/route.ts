import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRules } from "../../../_lib"
import { AUTHOR_RELATIONS, authorPostCounts, createAuthor } from "../../../../lib/authors"
import { toAdminAuthor, type AuthorRow } from "../../../../lib/serialize"
import { BLOG_SEO_MODULE } from "../../../../modules/blog-seo"
import type { AdminAuthorBodyType } from "../../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(BLOG_SEO_MODULE) as any
  const rows: AuthorRow[] = await svc.listBseoAuthors({}, { relations: AUTHOR_RELATIONS, order: { name: "ASC" }, take: 500 })
  const counts = await authorPostCounts(req.scope)
  res.json({ authors: rows.map((a) => toAdminAuthor(a, { post_count: counts[a.id] ?? 0 })) })
}

export async function POST(req: AuthenticatedMedusaRequest<AdminAuthorBodyType>, res: MedusaResponse) {
  await withRules(res, async () => {
    res.status(201).json({ author: toAdminAuthor(await createAuthor(req.scope, req.validatedBody ?? {}), { post_count: 0 }) })
  })
}
