import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import publishScheduledJob from "medusa-blog-seo/jobs/blog-seo-publish-scheduled"
import { publishDue } from "medusa-blog-seo/lib/posts"

/** Runs the plugin's scheduled job on demand (cron is not waited for in tests). */
export const POST = async (req: MedusaRequest<{ job: string; now?: string }>, res: MedusaResponse) => {
  const job = req.body?.job
  if (job === "publish") {
    const summary = await publishDue(req.scope, req.body?.now ? new Date(req.body.now) : new Date())
    res.json({ ok: true, summary })
    return
  }
  if (job === "publish-job") await publishScheduledJob(req.scope)
  else {
    res.status(400).json({ message: "job must be publish | publish-job" })
    return
  }
  res.json({ ok: true })
}
