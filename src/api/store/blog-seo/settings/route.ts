import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getOptions } from "../../../../lib/options"
import { getSettings } from "../../../../lib/settings"
import { xDefaultLocale } from "../../../../lib/urls"

/** GET /store/blog-seo/settings — the blog's languages, fallback rule and routing, for storefront helpers */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const s = await getSettings(req.scope)
  const o = getOptions(req.scope)
  res.json({
    settings: {
      locales: s.locales.filter((l) => l.enabled).map(({ code, name, dir }) => ({ code, name, dir })),
      default_locale: s.default_locale,
      fallback: s.fallback,
      routing: s.routing,
      x_default: xDefaultLocale({ routing: s.routing, default_locale: s.default_locale }),
      storefront_url: o.storefront_url,
    },
  })
}
