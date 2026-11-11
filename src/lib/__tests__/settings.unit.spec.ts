import { mergeSettings } from "../settings"
import { resolveOptions } from "../options"

jest.mock("../options", () => {
  const actual = jest.requireActual("../options")
  return { ...actual, getOptions: (container: { options: unknown }) => actual.resolveOptions(container.options) }
})

const container = (options: Record<string, unknown> = {}) => ({ options }) as any
const row = (over: Record<string, unknown> = {}) => ({ id: "s", locales: [{ code: "id" }, { code: "en" }], default_locale: "en", fallback: "hide", routing: { base: "/journal" }, metadata: { image_origins: ["https://cdn.example/m"] }, ...over })

describe("mergeSettings", () => {
  it("no row, no options: en, fallback default, nothing locked", () => {
    const s = mergeSettings(null, container())
    expect(s.locales.map((l) => l.code)).toEqual(["en"])
    expect(s.default_locale).toBe("en")
    expect(s.fallback).toBe("default")
    expect(s.locked).toEqual({ locales: false, default_locale: false, fallback: false })
    expect(s.routing.base).toBe("/blog")
  })
  it("the Admin row applies when the options say nothing", () => {
    const s = mergeSettings(row(), container({ content: { image_origins: ["https://api.example/static"] } }))
    expect(s.locales.map((l) => l.code)).toEqual(["id", "en"])
    expect(s.default_locale).toBe("en")
    expect(s.fallback).toBe("hide")
    expect(s.routing.base).toBe("/journal")
    expect(s.image_origins).toEqual(["https://api.example/static", "https://cdn.example/m"])
  })
  it("plugin options lock locales, default and fallback; routing merges field by field", () => {
    const s = mergeSettings(row(), container({ locales: [{ code: "de", name: "Deutsch" }, { code: "id" }], fallback: "label", routing: { category: "topic" } }))
    expect(s.locales.map((l) => l.code)).toEqual(["de", "id"])
    expect(s.default_locale).toBe("de")
    expect(s.fallback).toBe("label")
    expect(s.locked).toEqual({ locales: true, default_locale: true, fallback: true })
    expect(s.routing.base).toBe("/journal")
    expect(s.routing.category).toBe("topic")
  })
  it("a default locale that is not enabled falls back to the first enabled one", () => {
    const s = mergeSettings(row({ locales: [{ code: "id" }, { code: "en", enabled: false }] }), container())
    expect(s.default_locale).toBe("id")
  })
  it("resolveOptions: defaults and reserved slugs from the routing segments", () => {
    const o = resolveOptions({ routing: { category: "topic" }, uploads: { max_side: 1200 } })
    expect(o.content.reserved_slugs).toEqual(expect.arrayContaining(["topic", "page", "feed", "preview", "category", "tag"]))
    expect(o.uploads).toEqual({ process_images: true, max_bytes: 25 * 1024 * 1024, max_side: 1200, jpeg_quality: 88 })
    expect(o.publish).toEqual({ require_excerpt: true, require_cover: false })
    expect(o.revalidate).toBeNull()
    expect(o.showCredit).toBe(false)
  })
})
