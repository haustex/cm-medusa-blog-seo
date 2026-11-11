import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRules } from "../../../../_lib"
import { authorPostCounts, deleteAuthor, retrieveAuthor, updateAuthor } from "../../../../../lib/authors"
import { toAdminAuthor } from "../../../../../lib/serialize"
import type { AdminAuthorBodyType } from "../../../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    const a = await retrieveAuthor(req.scope, req.params.id)
    res.json({ author: toAdminAuthor(a, { post_count: (await authorPostCounts(req.scope))[a.id] ?? 0 }) })
  })
}

export async function POST(req: AuthenticatedMedusaRequest<AdminAuthorBodyType>, res: MedusaResponse) {
  await withRules(res, async () => {
    const a = await updateAuthor(req.scope, req.params.id, req.validatedBody ?? {})
    res.json({ author: toAdminAuthor(a, { post_count: (await authorPostCounts(req.scope))[a.id] ?? 0 }) })
  })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    await deleteAuthor(req.scope, req.params.id)
    res.json({ id: req.params.id, object: "author", deleted: true })
  })
}
