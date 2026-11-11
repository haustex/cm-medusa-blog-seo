import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRules } from "../../../_lib"
import { CATEGORY_RELATIONS, categoryPostCounts, createCategory } from "../../../../lib/categories"
import { toAdminCategory, type CategoryRow } from "../../../../lib/serialize"
import { BLOG_SEO_MODULE } from "../../../../modules/blog-seo"
import type { AdminCategoryBodyType } from "../../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(BLOG_SEO_MODULE) as any
  const rows: CategoryRow[] = await svc.listBseoCategories({}, { relations: CATEGORY_RELATIONS, order: { rank: "ASC", created_at: "ASC" }, take: 500 })
  const counts = await categoryPostCounts(req.scope)
  res.json({ categories: rows.map((c) => toAdminCategory(c, { post_count: counts[c.id] ?? 0 })) })
}

export async function POST(req: AuthenticatedMedusaRequest<AdminCategoryBodyType>, res: MedusaResponse) {
  await withRules(res, async () => {
    res.status(201).json({ category: toAdminCategory(await createCategory(req.scope, req.validatedBody ?? {}), { post_count: 0 }) })
  })
}
