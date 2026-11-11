import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { matchLocale } from "../lib/locales"
import { getOptions } from "../lib/options"
import { BlogRuleError } from "../lib/schedule"
import { toAdminPost, type PostRow } from "../lib/serialize"
import type { BlogSettings } from "../lib/settings"
import { postUrl, previewUrl } from "../lib/urls"

/** The request's locale: ?locale= → x-medusa-locale header → Medusa's req.locale → the blog's default; always one of the enabled locales */
export function requestLocale(req: MedusaRequest, settings: BlogSettings): string {
  const q = typeof req.query.locale === "string" ? req.query.locale : undefined
  const h = typeof req.headers["x-medusa-locale"] === "string" ? req.headers["x-medusa-locale"] : undefined
  return matchLocale(q || h || (req as MedusaRequest & { locale?: string }).locale, settings.locales, settings.default_locale)
}

export function pagination(query: Record<string, unknown>, defaultLimit: number, max: number) {
  const limit = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), max)
  const offset = Math.max(Math.trunc(Number(query.offset) || 0), 0)
  return { limit, offset }
}

/** Public: published and not dated in the future */
export const publicFilter = (now: Date) => ({ status: "published", published_at: { $lte: now } })

const STATUS: Record<BlogRuleError["code"], number> = {
  not_found: 404,
  incomplete: 400,
  slug_taken: 409,
  invalid_slug: 400,
  invalid_date: 400,
  category_not_found: 400,
  author_not_found: 400,
  locale_unknown: 400,
  invalid: 400,
  locked: 403,
}

/** Runs a handler; rule violations answer with { type, code, message, detail } (the Admin translates by code) */
export async function withRules(res: MedusaResponse, run: () => Promise<void>) {
  try {
    await run()
  } catch (e) {
    if (e instanceof BlogRuleError) {
      const status = STATUS[e.code] ?? 400
      res.status(status).json({ type: status === 404 ? "not_found" : "invalid_data", code: e.code, message: e.message, detail: e.detail ?? null })
      return
    }
    throw e
  }
}

/** Admin shape plus the links the Admin shows (preview per locale, public URL per readable locale) */
export function adminPostView(req: MedusaRequest, post: PostRow, settings: BlogSettings) {
  const options = getOptions(req.scope)
  const view = toAdminPost(post, settings, options)
  const ctx = { routing: settings.routing, default_locale: settings.default_locale, storefront_url: options.storefront_url }
  const preview_urls: Record<string, string> = {}
  const public_urls: Record<string, string> = {}
  for (const l of settings.locales) {
    if (!l.enabled) continue
    preview_urls[l.code] = previewUrl(ctx, l.code, post.preview_token)
    const t = view.translations[l.code]
    if (t?.slug) public_urls[l.code] = postUrl(ctx, l.code, t.slug)
  }
  return { ...view, preview_urls, public_urls }
}

export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "")
