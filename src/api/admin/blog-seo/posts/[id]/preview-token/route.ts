import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminPostView, withRules } from "../../../../../_lib"
import { rotatePreviewToken } from "../../../../../../lib/posts"
import { getSettings } from "../../../../../../lib/settings"

/** POST — a new preview secret; the old preview links stop working */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    const post = await rotatePreviewToken(req.scope, req.params.id)
    res.json({ post: adminPostView(req, post, await getSettings(req.scope)) })
  })
}
