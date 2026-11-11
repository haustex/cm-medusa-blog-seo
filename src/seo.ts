/**
 * Storefront helpers for URLs, hreflang, sitemaps and RSS, fed by `/store/blog-seo/settings` and the
 * `/store/blog-seo/posts?view=index` rows. Import from "medusa-blog-seo/seo". Pure functions, no Medusa imports:
 * usable in Next.js route handlers, `sitemap.ts`, `generateMetadata` and server components.
 *
 *   const { settings } = await blogSeoStore(sdk).settings()
 *   const urls = blogUrls(settings, "https://example.com")
 *   urls.post("en", "caring-for-teak")          → https://example.com/us/blog/caring-for-teak
 *   hreflang(urls, post.alternates)             → { "id": …, "en": …, "x-default": … }
 *   sitemapEntries(urls, index.posts)           → Next.js MetadataRoute.Sitemap entries
 *   rssFeed(urls, "id", index.posts, { title, description })
 */
import type { IndexRow, StoreBlogSettings, StorePostResponse } from "./sdk"
import { blogUrl, categoryUrl, feedUrl, localeBase, pageUrl, postUrl, previewUrl, xDefaultLocale, type UrlContext } from "./lib/urls"

export type { UrlContext }
export { blogUrl, categoryUrl, feedUrl, localeBase, pageUrl, postUrl, previewUrl, xDefaultLocale }

export type BlogUrls = {
  ctx: UrlContext
  locales: StoreBlogSettings["locales"]
  default_locale: string
  x_default: string
  base: (locale: string) => string
  blog: (locale: string) => string
  post: (locale: string, slug: string) => string
  category: (locale: string, slug: string) => string
  page: (locale: string, page: number) => string
  feed: (locale: string) => string
  preview: (locale: string, token: string) => string
}

/** URL builders bound to the blog's settings. `storefrontUrl` wins over the settings' storefront_url. */
export function blogUrls(settings: Pick<StoreBlogSettings, "routing" | "default_locale" | "locales" | "x_default"> & { storefront_url?: string | null }, storefrontUrl?: string | null): BlogUrls {
  const ctx: UrlContext = { routing: settings.routing, default_locale: settings.default_locale, storefront_url: storefrontUrl ?? settings.storefront_url ?? null }
  return {
    ctx,
    locales: settings.locales,
    default_locale: settings.default_locale,
    x_default: settings.x_default ?? xDefaultLocale(ctx),
    base: (l) => localeBase(ctx, l),
    blog: (l) => blogUrl(ctx, l),
    post: (l, slug) => postUrl(ctx, l, slug),
    category: (l, slug) => categoryUrl(ctx, l, slug),
    page: (l, n) => pageUrl(ctx, l, n),
    feed: (l) => feedUrl(ctx, l),
    preview: (l, token) => previewUrl(ctx, l, token),
  }
}

/**
 * hreflang map for a post (`alternates` = slug per readable locale), a category (slug per locale) or the blog root
 * (`alternates` omitted). "x-default" points at the x_default locale when that locale is in the map.
 */
export function hreflang(urls: BlogUrls, alternates?: Record<string, string> | null, kind: "post" | "category" | "blog" = "post"): Record<string, string> {
  const out: Record<string, string> = {}
  const codes = alternates ? Object.keys(alternates) : urls.locales.map((l) => l.code)
  for (const code of codes) {
    const slug = alternates?.[code]
    out[code] = kind === "blog" || !slug ? urls.blog(code) : kind === "category" ? urls.category(code, slug) : urls.post(code, slug)
  }
  const x = codes.find((c) => c.toLowerCase() === urls.x_default.toLowerCase()) ?? codes[0]
  if (x) out["x-default"] = out[x]
  return out
}

export type SitemapEntry = { url: string; lastModified?: Date; alternates?: { languages: Record<string, string> }; images?: string[] }

const newest = (rows: IndexRow[]) => (rows.length ? new Date(rows.reduce((max, p) => ((p.updated_at ?? "") > max ? p.updated_at! : max), rows[0].updated_at ?? "")) : undefined)

/**
 * Sitemap entries for the blog: the root and category pages per locale (dated by their newest post) and every
 * post per readable locale, each with hreflang alternates and the post's images. Matches Next.js `MetadataRoute.Sitemap`.
 */
export function sitemapEntries(urls: BlogUrls, rows: IndexRow[], opts: { images?: boolean } = {}): SitemapEntry[] {
  const out: SitemapEntry[] = []
  if (!rows.length) return out
  for (const l of urls.locales) {
    out.push({ url: urls.blog(l.code), lastModified: newest(rows), alternates: { languages: hreflang(urls, null, "blog") } })
  }
  const categories = new Map<string, Record<string, string>>()
  for (const p of rows) {
    for (const [code, t] of Object.entries(p.locales)) {
      if (!t.category_slug) continue
      // group by the default locale's category slug when present, else by this locale's
      const key = p.locales[urls.default_locale]?.category_slug ?? t.category_slug
      const m = categories.get(key) ?? {}
      m[code] = t.category_slug
      categories.set(key, m)
    }
  }
  for (const [key, slugs] of categories) {
    const inCategory = rows.filter((p) => Object.values(p.locales).some((t) => t.category_slug === key || t.category_slug === slugs[urls.default_locale]))
    for (const code of Object.keys(slugs)) out.push({ url: urls.category(code, slugs[code]), lastModified: newest(inCategory), alternates: { languages: hreflang(urls, slugs, "category") } })
  }
  for (const p of rows) {
    const alternates = Object.fromEntries(Object.entries(p.locales).map(([code, t]) => [code, t.slug]))
    const languages = hreflang(urls, alternates, "post")
    const images = opts.images === false ? undefined : [p.cover, p.cover_wide, ...p.images.map((i) => i.src)].filter((x): x is string => !!x)
    for (const code of Object.keys(p.locales)) {
      out.push({ url: urls.post(code, p.locales[code].slug), lastModified: p.updated_at ? new Date(p.updated_at) : undefined, alternates: { languages }, ...(images?.length ? { images } : {}) })
    }
  }
  return out
}

const x = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!)

export type RssOptions = {
  title: string
  description: string
  /** <language>; default: the locale code */
  language?: string
  /** <dc:creator> when a post has no author */
  author?: string
  /** Newest N posts. Default 50 */
  limit?: number
  /** true (default): posts shown through the fallback are included; false: only translated ones */
  include_fallback?: boolean
}

/** RSS 2.0 feed of one locale: title, link, date, summary, category, creator and the cover as media:content */
export function rssFeed(urls: BlogUrls, locale: string, rows: IndexRow[], opts: RssOptions): string {
  const posts = rows
    .filter((p) => p.locales[locale] && (opts.include_fallback !== false || p.locales[locale].translated))
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, opts.limit ?? 50)
  const home = urls.blog(locale)
  const self = urls.feed(locale)
  const last = newest(posts) ?? new Date(0)
  const items = posts.map((p) => {
    const t = p.locales[locale]
    const url = urls.post(locale, t.slug)
    return `<item>
<title>${x(t.title)}</title>
<link>${x(url)}</link>
<guid isPermaLink="true">${x(url)}</guid>
<pubDate>${new Date(p.published_at ?? Date.now()).toUTCString()}</pubDate>
<dc:creator>${x(p.author?.name || opts.author || "")}</dc:creator>
${t.category_name ? `<category>${x(t.category_name)}</category>\n` : ""}<description>${x(t.excerpt)}</description>
${p.cover ? `<media:content url="${x(p.cover)}" medium="image" />\n` : ""}</item>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${x(opts.title)}</title>
<link>${x(home)}</link>
<atom:link href="${x(self)}" rel="self" type="application/rss+xml" />
<description>${x(opts.description)}</description>
<language>${x(opts.language ?? locale)}</language>
<lastBuildDate>${last.toUTCString()}</lastBuildDate>
${items.join("\n")}
</channel>
</rss>
`
}

/** `<html lang dir>` values for a locale */
export function htmlAttributes(settings: Pick<StoreBlogSettings, "locales">, locale: string): { lang: string; dir: "ltr" | "rtl" } {
  const l = settings.locales.find((s) => s.code.toLowerCase() === locale.toLowerCase())
  return { lang: l?.code ?? locale, dir: l?.dir ?? "ltr" }
}

/**
 * The URL to redirect to (301) when `getPost` answered a redirect, else null:
 *   const r = await blogSeoStore(sdk).getPost(slug, locale)
 *   const to = postRedirectUrl(urls, locale, r); if (to) permanentRedirect(to)
 */
export function postRedirectUrl(urls: BlogUrls, locale: string, result: Pick<StorePostResponse, "redirect"> | null | undefined): string | null {
  return result?.redirect ? urls.post(locale, result.redirect) : null
}
