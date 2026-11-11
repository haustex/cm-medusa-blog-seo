import fs from "node:fs"
import path from "node:path"
import type { ConfigModule, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Dir } from "./locales"

export const PACKAGE_NAME = "medusa-blog-seo"

export type FallbackMode = "default" | "hide" | "label"

/** How a storefront builds URLs per locale; only used by the helpers in `medusa-blog-seo/seo` and the Admin preview links. */
export type RoutingOptions = {
  /** Per locale: a path prefix ("" for none, "/us") or a different origin ("https://example.de") */
  locales?: Record<string, { prefix?: string; origin?: string }>
  /** Blog root path. Default "/blog" */
  base?: string
  /** Segment under the root for category pages. Default "category" */
  category?: string
  /** Segment for pagination: /blog/page/2. Default "page" */
  page?: string
  /** File name of the RSS feed under the root. Default "feed.xml" */
  feed?: string
  /** Segment for preview pages: /blog/preview/{token}. Default "preview" */
  preview?: string
  /** Locale whose URLs carry hreflang="x-default". Default: the default locale */
  x_default?: string
}

export type PluginOptions = {
  /**
   * The blog's languages. Given here they are locked (the Admin shows them read-only); left out, they are managed
   * in Admin → Blog → Settings. Codes are BCP 47 ("id", "en", "pt-BR").
   */
  locales?: { code: string; name?: string; dir?: Dir }[]
  /** Default: the first of `locales`, else what the Admin settings say, else "en" */
  default_locale?: string
  /** What a locale without its own translation shows. Default "default" */
  fallback?: FallbackMode
  routing?: RoutingOptions
  /** Public URL of the storefront, for the Admin's "open" and "preview" links (e.g. "https://example.com") */
  storefront_url?: string
  content?: {
    /** Origins uploaded images may come from. Default: the File Module's URLs are learned from uploads (see lib/uploads.ts) plus these */
    image_origins?: string[]
    /** Hosts whose links are internal (no target="_blank"). Default: the storefront_url host */
    site_hosts?: string[]
    /** An h3 ending in "?" + its paragraphs becomes a Q&A block and FAQPage data. Default true */
    faq_from_headings?: boolean
    /** For reading time. Default 200 */
    words_per_minute?: number
    /** Max length of a body in bytes. Default 2 MiB */
    max_body_bytes?: number
    /** Slugs that may not be used by posts or categories (route segments). Default: the routing segments + "feed", "page", "preview", "category", "tag" */
    reserved_slugs?: string[]
  }
  publish?: {
    /** A post needs an excerpt in its default locale before it can be published. Default true */
    require_excerpt?: boolean
    /** A post needs a cover before it can be published. Default false */
    require_cover?: boolean
  }
  uploads?: {
    /** Process images with sharp (upright, resized, EXIF removed, JPEG) when sharp is installed. Default true */
    process_images?: boolean
    max_bytes?: number // default 25 MiB
    max_side?: number // default 2400
    jpeg_quality?: number // default 88
  }
  /** Tell the storefront about public changes (batched), e.g. to revalidate pages */
  revalidate?: {
    url: string
    /** Sent in the `x-revalidate-secret` header (or `header`) */
    secret?: string
    header?: string
    /** Changes within this window become one call. Default 2000 */
    delay_ms?: number
  }
  /** Show the small "by Haus Kayu" credit under the plugin's Admin pages. Default false */
  showCredit?: boolean
}

export type ResolvedRouting = Required<Omit<RoutingOptions, "x_default">> & { x_default: string | null }

export type ResolvedOptions = {
  locked: { locales: { code: string; name?: string; dir?: Dir }[]; default_locale: string | null; fallback: FallbackMode | null } | null
  routing: ResolvedRouting
  /** The routing options as given (the Admin settings row may fill in what is missing) */
  routing_raw: RoutingOptions
  storefront_url: string | null
  content: {
    image_origins: string[]
    site_hosts: string[]
    faq_from_headings: boolean
    words_per_minute: number
    max_body_bytes: number
    reserved_slugs: string[]
  }
  publish: { require_excerpt: boolean; require_cover: boolean }
  uploads: { process_images: boolean; max_bytes: number; max_side: number; jpeg_quality: number }
  revalidate: { url: string; secret: string | null; header: string; delay_ms: number } | null
  showCredit: boolean
}

function num(value: unknown, fallback: number, min = 0): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) && n >= min ? n : fallback
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const segment = (v: unknown, fallback: string) => {
  const s = str(v)
  return s && /^[a-z0-9][a-z0-9._-]*$/i.test(s) ? s : fallback
}
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : [])

export function resolveRouting(r: RoutingOptions | null | undefined): ResolvedRouting {
  const o = r ?? {}
  return {
    locales: o.locales && typeof o.locales === "object" ? o.locales : {},
    base: "/" + (str(o.base) ?? "/blog").replace(/^\/+|\/+$/g, ""),
    category: segment(o.category, "category"),
    page: segment(o.page, "page"),
    feed: segment(o.feed, "feed.xml"),
    preview: segment(o.preview, "preview"),
    x_default: str(o.x_default),
  }
}

export function resolveOptions(raw: PluginOptions | undefined): ResolvedOptions {
  const o = raw ?? {}
  const r = o.routing ?? {}
  const c = o.content ?? {}
  const p = o.publish ?? {}
  const u = o.uploads ?? {}
  const storefront = str(o.storefront_url)?.replace(/\/+$/, "") ?? null
  let host: string | null = null
  try {
    host = storefront ? new URL(storefront).hostname.replace(/^www\./, "") : null
  } catch {}
  const lockedLocales = Array.isArray(o.locales) ? o.locales.filter((l) => l && typeof l.code === "string" && l.code.trim()) : []
  const routing = resolveRouting(r)
  const reserved = new Set([routing.category, routing.page, routing.feed.replace(/\..*$/, ""), routing.preview, "feed", "page", "preview", "category", "tag", ...list(c.reserved_slugs)])
  return {
    locked: lockedLocales.length || str(o.default_locale) || o.fallback
      ? {
          locales: lockedLocales.map((l) => ({ code: l.code.trim(), ...(l.name ? { name: l.name } : {}), ...(l.dir === "rtl" || l.dir === "ltr" ? { dir: l.dir } : {}) })),
          default_locale: str(o.default_locale),
          fallback: o.fallback === "hide" || o.fallback === "label" || o.fallback === "default" ? o.fallback : null,
        }
      : null,
    routing,
    routing_raw: r,
    storefront_url: storefront,
    content: {
      image_origins: list(c.image_origins).map((x) => x.replace(/\/+$/, "")),
      site_hosts: list(c.site_hosts).length ? list(c.site_hosts) : host ? [host] : [],
      faq_from_headings: c.faq_from_headings !== false,
      words_per_minute: num(c.words_per_minute, 200, 1),
      max_body_bytes: num(c.max_body_bytes, 2 * 1024 * 1024, 1),
      reserved_slugs: Array.from(reserved),
    },
    publish: { require_excerpt: p.require_excerpt !== false, require_cover: p.require_cover === true },
    uploads: {
      process_images: u.process_images !== false,
      max_bytes: num(u.max_bytes, 25 * 1024 * 1024, 1),
      max_side: num(u.max_side, 2400, 100),
      jpeg_quality: num(u.jpeg_quality, 88, 1),
    },
    revalidate: o.revalidate && str(o.revalidate.url) ? { url: str(o.revalidate.url)!, secret: str(o.revalidate.secret), header: str(o.revalidate.header) ?? "x-revalidate-secret", delay_ms: num(o.revalidate.delay_ms, 2000) } : null,
    showCredit: o.showCredit === true,
  }
}

type Entry = string | { resolve?: unknown; options?: unknown }

function packageNameAt(dir: string): string | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name ?? null
  } catch {
    return null
  }
}

/** A resolve string that points at this package: its name, a sub-path of it, or a local path to it */
export function isThisPackage(resolve: string): boolean {
  const r = resolve.replace(/\/+$/, "")
  if (r === PACKAGE_NAME || r.startsWith(`${PACKAGE_NAME}/`) || r.includes(`/${PACKAGE_NAME}`)) return true
  if (r.startsWith(".") || path.isAbsolute(r)) {
    for (let dir = path.resolve(r), i = 0; i < 6; i++, dir = path.dirname(dir)) {
      if (packageNameAt(dir) === PACKAGE_NAME) return true
    }
  }
  return false
}

const cache = new WeakMap<object, ResolvedOptions>()

/** The plugin's options (`plugins: [{ resolve, options }]`) with defaults applied; cached per container. */
export function getOptions(container: MedusaContainer): ResolvedOptions {
  const config: ConfigModule = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const hit = cache.get(config)
  if (hit) return hit
  let raw: PluginOptions | undefined
  for (const p of (config.plugins ?? []) as Entry[]) {
    const resolve = typeof p === "string" ? p : p.resolve
    if (typeof resolve === "string" && isThisPackage(resolve)) {
      raw = typeof p === "string" ? {} : ((p.options as PluginOptions) ?? {})
      break
    }
  }
  const resolved = resolveOptions(raw)
  cache.set(config, resolved)
  return resolved
}
