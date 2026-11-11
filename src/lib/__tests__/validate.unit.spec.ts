import { completeness, isComplete } from "../validate"

const rules = { require_excerpt: true, require_cover: false, reserved_slugs: ["feed"] }
const id = { locale: "id", title: "Merawat talenan", slug: "merawat-talenan", excerpt: "Ringkas.", body: "<p>Isi.</p>" }
const en = { locale: "en", title: "Caring for a board", slug: "caring-for-a-board", excerpt: "Short.", body: "<p>Body.</p>" }

describe("completeness", () => {
  it("publishable when the default locale is complete; other locales reported, not required", () => {
    const c = completeness({ cover: null, translations: [id] }, ["id", "en"], "id", rules)
    expect(c.publishable).toBe(true)
    expect(c.locales).toEqual([
      { locale: "id", present: true, missing: [] },
      { locale: "en", present: false, missing: ["title", "excerpt", "body", "slug"] },
    ])
  })
  it("not publishable when the default locale lacks something", () => {
    const c = completeness({ translations: [{ ...id, excerpt: " " }, en] }, ["id", "en"], "id", rules)
    expect(c.publishable).toBe(false)
    expect(c.locales[0].missing).toEqual(["excerpt"])
    expect(completeness({ translations: [{ ...id, excerpt: "" }] }, ["id"], "id", { ...rules, require_excerpt: false }).publishable).toBe(true)
  })
  it("cover when required; reserved or invalid slug", () => {
    expect(completeness({ cover: null, translations: [id] }, ["id"], "id", { ...rules, require_cover: true })).toMatchObject({ publishable: false, cover_missing: true })
    expect(completeness({ translations: [{ ...id, slug: "feed" }] }, ["id"], "id", rules).locales[0].missing).toEqual(["slug"])
    expect(completeness({ translations: [{ ...id, slug: "Bad Slug" }] }, ["id"], "id", rules).locales[0].missing).toEqual(["slug"])
  })
  it("a body of empty tags is not content; an embed is", () => {
    expect(isComplete({ ...en, body: "<p> </p><h2></h2>" }, rules)).toBe(false)
    expect(isComplete({ ...en, body: '<div data-youtube-id="dQw4w9WgXcQ"></div>' }, rules)).toBe(true)
  })
  it("present: something was written even when incomplete", () => {
    const c = completeness({ translations: [id, { locale: "en", title: "Draft", slug: "", excerpt: "", body: "" }] }, ["id", "en"], "id", rules)
    expect(c.locales[1]).toEqual({ locale: "en", present: true, missing: ["excerpt", "body", "slug"] })
  })
})
