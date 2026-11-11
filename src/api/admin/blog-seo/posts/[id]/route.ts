import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminPostView, withRules } from "../../../../_lib"
import { deletePost, retrievePost, updatePost } from "../../../../../lib/posts"
import { getSettings } from "../../../../../lib/settings"
import type { AdminPostBodyType } from "../../../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    res.json({ post: adminPostView(req, await retrievePost(req.scope, req.params.id), await getSettings(req.scope)) })
  })
}

/** Partial update; translations given are upserted per locale */
export async function POST(req: AuthenticatedMedusaRequest<AdminPostBodyType>, res: MedusaResponse) {
  await withRules(res, async () => {
    const post = await updatePost(req.scope, req.params.id, req.validatedBody ?? {})
    res.json({ post: adminPostView(req, post, await getSettings(req.scope)) })
  })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    await deletePost(req.scope, req.params.id)
    res.json({ id: req.params.id, object: "post", deleted: true })
  })
}
