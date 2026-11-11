import type { ResolvedRouting } from "./options"

/**
 * Public URLs of the blog per locale, from the routing settings:
 *   base(locale)      → "{origin}{prefix}"   origin = routing.locales[code].origin ?? storefront_url ?? ""
 *                                            prefix = routing.locales[code].prefix ?? (default locale ? "" : "/{code}")
 *   post              → base + routing.base + "/" + slug
 *   category          → base + routing.base + "/" + routing.category + "/" + slug
 *   page n            → base + routing.base + "/" + routing.page + "/" + n   (page 1 = the blog root)
 *   feed              → base + routing.base + "/" + routing.feed
 *   preview           → base + routing.base + "/" + routing.preview + "/" + token
 * Used by the Admin (open/preview links), `medusa-blog-seo/seo` (hreflang, sitemap, RSS) and storefront helpers.
 */
export type UrlContext = { routing: ResolvedRouting; default_locale: string; storefront_url?: string | null }

const trim = (s: string) => s.replace(/\/+$/, "")

export function localeBase(ctx: UrlContext, locale: string): string {
  const entry = ctx.routing.locales[locale] ?? ctx.routing.locales[locale.toLowerCase()] ?? {}
  const origin = trim(entry.origin ?? ctx.storefront_url ?? "")
  const prefix = entry.prefix !== undefined ? entry.prefix : locale.toLowerCase() === ctx.default_locale.toLowerCase() ? "" : `/${locale}`
  return origin + (prefix ? "/" + prefix.replace(/^\/+|\/+$/g, "") : "")
}

export const blogUrl = (ctx: UrlContext, locale: string) => localeBase(ctx, locale) + ctx.routing.base
export const postUrl = (ctx: UrlContext, locale: string, slug: string) => `${blogUrl(ctx, locale)}/${slug}`
export const categoryUrl = (ctx: UrlContext, locale: string, slug: string) => `${blogUrl(ctx, locale)}/${ctx.routing.category}/${slug}`
export const pageUrl = (ctx: UrlContext, locale: string, page: number) => (page <= 1 ? blogUrl(ctx, locale) : `${blogUrl(ctx, locale)}/${ctx.routing.page}/${page}`)
export const feedUrl = (ctx: UrlContext, locale: string) => `${blogUrl(ctx, locale)}/${ctx.routing.feed}`
export const previewUrl = (ctx: UrlContext, locale: string, token: string) => `${blogUrl(ctx, locale)}/${ctx.routing.preview}/${token}`

/** The locale whose URL is hreflang="x-default" */
export const xDefaultLocale = (ctx: UrlContext) => ctx.routing.x_default ?? ctx.default_locale
