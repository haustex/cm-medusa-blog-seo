import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminPostView, withRules } from "../../../../../_lib"
import { publishPost } from "../../../../../../lib/posts"
import { getSettings } from "../../../../../../lib/settings"
import type { AdminPublishBodyType } from "../../../../../validators"

/** POST { at?: ISO date | null } — now, or scheduled when `at` is in the future */
export async function POST(req: AuthenticatedMedusaRequest<AdminPublishBodyType>, res: MedusaResponse) {
  await withRules(res, async () => {
    const post = await publishPost(req.scope, req.params.id, req.validatedBody?.at ?? null)
    res.json({ post: adminPostView(req, post, await getSettings(req.scope)) })
  })
}
