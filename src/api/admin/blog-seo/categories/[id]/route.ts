import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRules } from "../../../../_lib"
import { categoryPostCounts, deleteCategory, retrieveCategory, updateCategory } from "../../../../../lib/categories"
import { toAdminCategory } from "../../../../../lib/serialize"
import type { AdminCategoryBodyType } from "../../../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    const c = await retrieveCategory(req.scope, req.params.id)
    res.json({ category: toAdminCategory(c, { post_count: (await categoryPostCounts(req.scope))[c.id] ?? 0 }) })
  })
}

export async function POST(req: AuthenticatedMedusaRequest<AdminCategoryBodyType>, res: MedusaResponse) {
  await withRules(res, async () => {
    const c = await updateCategory(req.scope, req.params.id, req.validatedBody ?? {})
    res.json({ category: toAdminCategory(c, { post_count: (await categoryPostCounts(req.scope))[c.id] ?? 0 }) })
  })
}

/** Posts in the category stay, without a category */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    await deleteCategory(req.scope, req.params.id)
    res.json({ id: req.params.id, object: "category", deleted: true })
  })
}
