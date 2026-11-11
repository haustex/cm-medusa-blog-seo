import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { withRules } from "../../../_lib"
import { BlogSeoEvents } from "../../../../lib/events"
import { getSettings, saveSettings } from "../../../../lib/settings"
import type { AdminSettingsBodyType } from "../../../validators"

/** GET/POST /admin/blog-seo/settings — locales, default locale, fallback rule, routing (locked fields are refused with 403) */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ settings: await getSettings(req.scope) })
}

export async function POST(req: AuthenticatedMedusaRequest<AdminSettingsBodyType>, res: MedusaResponse) {
  await withRules(res, async () => {
    const settings = await saveSettings(req.scope, req.validatedBody ?? {})
    try {
      await req.scope.resolve(Modules.EVENT_BUS).emit({ name: BlogSeoEvents.SETTINGS_CHANGED, data: { all: true } })
    } catch (e) {
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`[blog-seo] could not emit settings event: ${(e as Error).message}`)
    }
    res.json({ settings })
  })
}
