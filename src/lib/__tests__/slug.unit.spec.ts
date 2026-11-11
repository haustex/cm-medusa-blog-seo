import { isValidSlug, slugify, uniqueSlug } from "../slug"

const reserved = ["category", "feed", "page", "preview"]

describe("slugs", () => {
  it("slugify: lower-case words joined by dashes", () => {
    expect(slugify("Caring for a teak board!")).toBe("caring-for-a-teak-board")
    expect(slugify("Café Jepara — édition")).toBe("cafe-jepara-edition")
    expect(slugify("???")).toBe("")
  })
  it("slugify: at most 80 characters, cut at a word", () => {
    const s = slugify("a complete guide to choosing caring for and repairing teak cutting boards for home kitchens and restaurants")
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith("-")).toBe(false)
  })
  it("isValidSlug: format, length and reserved words", () => {
    expect(isValidSlug("caring-for-teak")).toBe(true)
    expect(isValidSlug("Caring")).toBe(false)
    expect(isValidSlug("a--b")).toBe(false)
    expect(isValidSlug("-a")).toBe(false)
    expect(isValidSlug("a/b")).toBe(false)
    expect(isValidSlug("category", reserved)).toBe(false)
    expect(isValidSlug("category")).toBe(true)
    expect(isValidSlug("a".repeat(81))).toBe(false)
  })
  it("uniqueSlug: the base when free, then -2, -3, …", async () => {
    const taken = new Set(["caring-for-teak", "caring-for-teak-2"])
    expect(await uniqueSlug("Caring for teak", (s) => taken.has(s))).toBe("caring-for-teak-3")
    expect(await uniqueSlug("New post", (s) => taken.has(s))).toBe("new-post")
  })
  it("uniqueSlug: never a reserved word or an empty slug", async () => {
    expect(await uniqueSlug("Category", () => false, { reserved })).toBe("category-post")
    expect(await uniqueSlug("???", () => false)).toBe("post")
    expect(await uniqueSlug("", (s) => s === "post")).toBe("post-2")
  })
  it("uniqueSlug: the numbered slug still fits in 80 characters", async () => {
    const base = "a".repeat(80)
    const out = await uniqueSlug(base, (s) => s === base)
    expect(out).toBe(`${"a".repeat(78)}-2`)
    expect(isValidSlug(out)).toBe(true)
  })
})
