import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getOptions } from "../../../../lib/options"
import { loadSharp } from "../../../../lib/uploads"

/** Non-secret plugin options the Admin pages adapt to */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const o = getOptions(req.scope)
  res.json({
    show_credit: o.showCredit,
    storefront_url: o.storefront_url,
    publish: o.publish,
    uploads: { process_images: o.uploads.process_images && !!loadSharp(), max_bytes: o.uploads.max_bytes, max_side: o.uploads.max_side },
    content: { faq_from_headings: o.content.faq_from_headings, max_body_bytes: o.content.max_body_bytes, reserved_slugs: o.content.reserved_slugs },
    revalidate: !!o.revalidate,
  })
}
