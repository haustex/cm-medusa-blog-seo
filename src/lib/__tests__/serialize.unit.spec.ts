import { alternatesOf, pickTranslation, toStoreCard, type PostRow } from "../serialize"
import { resolveOptions } from "../options"
import type { BlogSettings } from "../settings"

const settings = (fallback: BlogSettings["fallback"]): BlogSettings => ({
  locales: [
    { code: "id", name: "Indonesia", dir: "ltr", enabled: true, rank: 0 },
    { code: "en", name: "English", dir: "ltr", enabled: true, rank: 1 },
    { code: "ar", name: "Arabic", dir: "rtl", enabled: true, rank: 2 },
    { code: "de", name: "Deutsch", dir: "ltr", enabled: false, rank: 3 },
  ],
  default_locale: "id",
  fallback,
  routing: resolveOptions({}).routing,
  image_origins: [],
  locked: { locales: false, default_locale: false, fallback: false },
})
const options = resolveOptions({})
const rules = { require_excerpt: true, require_cover: false, reserved_slugs: [] }
const t = (locale: string, over: Record<string, unknown> = {}) => ({ id: locale, locale, title: `T ${locale}`, slug: `slug-${locale}`, excerpt: "x", body: "<p>b</p>", seo_title: null, seo_description: null, og_image: null, cover_alt: null, tags: null, ...over })
const post: PostRow = { id: "p", status: "published", published_at: "2026-11-01T00:00:00.000Z", content_updated_at: null, featured: false, cover: null, cover_wide: null, preview_token: "t", product_ids: null, metadata: null, translations: [t("id"), t("en"), t("ar", { body: "" })] }

describe("pickTranslation / alternatesOf", () => {
  it("own complete translation wins", () => {
    expect(pickTranslation(post, "en", settings("hide"), rules)).toMatchObject({ translated: true, translation: { locale: "en" } })
  })
  it("fallback default/label: the default locale's text, translated=false", () => {
    expect(pickTranslation(post, "ar", settings("default"), rules)).toMatchObject({ translated: false, translation: { locale: "id" } })
    expect(pickTranslation(post, "ar", settings("label"), rules)).toMatchObject({ translated: false, translation: { locale: "id" } })
  })
  it("fallback hide: nothing", () => {
    expect(pickTranslation(post, "ar", settings("hide"), rules)).toBeNull()
  })
  it("nothing when the default locale is incomplete too", () => {
    const p = { ...post, translations: [t("id", { body: "" })] }
    expect(pickTranslation(p, "en", settings("default"), rules)).toBeNull()
  })
  it("alternates: slug per readable enabled locale (disabled locales left out)", () => {
    expect(alternatesOf(post, settings("default"), rules)).toEqual({ id: "slug-id", en: "slug-en", ar: "slug-id" })
    expect(alternatesOf(post, settings("hide"), rules)).toEqual({ id: "slug-id", en: "slug-en" })
  })
  it("toStoreCard: dir follows the locale of the text shown", () => {
    expect(toStoreCard(post, "ar", settings("default"), options)).toMatchObject({ locale: "id", dir: "ltr", translated: false })
    expect(toStoreCard({ ...post, translations: [t("id"), t("ar")] }, "ar", settings("default"), options)).toMatchObject({ locale: "ar", dir: "rtl", translated: true })
  })
})
