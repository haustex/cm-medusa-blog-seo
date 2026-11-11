import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminPostView, withRules } from "../../../../../_lib"
import { unpublishPost } from "../../../../../../lib/posts"
import { getSettings } from "../../../../../../lib/settings"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    const post = await unpublishPost(req.scope, req.params.id)
    res.json({ post: adminPostView(req, post, await getSettings(req.scope)) })
  })
}
