import { blogUrls, hreflang, rssFeed, sitemapEntries } from "../../seo"
import { blogPosting, faqPage, postJsonLd } from "../../jsonld"
import type { IndexRow, StoreArticle } from "../../sdk"

const settings = {
  locales: [
    { code: "id", name: "Indonesia", dir: "ltr" as const },
    { code: "en", name: "English", dir: "ltr" as const },
  ],
  default_locale: "id",
  fallback: "default" as const,
  routing: { locales: { en: { prefix: "/us" } }, base: "/blog", category: "category", page: "page", feed: "feed.xml", preview: "preview", x_default: null },
  x_default: "id",
  storefront_url: "https://example.com",
}

describe("blogUrls / hreflang", () => {
  const urls = blogUrls(settings)
  it("builds locale-aware URLs", () => {
    expect(urls.blog("id")).toBe("https://example.com/blog")
    expect(urls.blog("en")).toBe("https://example.com/us/blog")
    expect(urls.post("en", "teak")).toBe("https://example.com/us/blog/teak")
    expect(urls.category("id", "care")).toBe("https://example.com/blog/category/care")
    expect(urls.page("id", 1)).toBe("https://example.com/blog")
    expect(urls.page("id", 3)).toBe("https://example.com/blog/page/3")
    expect(urls.feed("en")).toBe("https://example.com/us/blog/feed.xml")
    expect(urls.preview("en", "tok")).toBe("https://example.com/us/blog/preview/tok")
  })
  it("a locale without routing gets /{code}; a different origin wins", () => {
    const u = blogUrls({ ...settings, routing: { ...settings.routing, locales: { de: { origin: "https://example.de", prefix: "" } } } })
    expect(u.post("en", "x")).toBe("https://example.com/en/blog/x")
    expect(u.post("de", "x")).toBe("https://example.de/blog/x")
  })
  it("storefront override and relative URLs without any origin", () => {
    expect(blogUrls(settings, "https://preview.example").blog("id")).toBe("https://preview.example/blog")
    expect(blogUrls({ ...settings, storefront_url: null }).post("en", "x")).toBe("/us/blog/x")
  })
  it("hreflang: per readable locale + x-default", () => {
    expect(hreflang(urls, { id: "merawat", en: "caring" })).toEqual({ id: "https://example.com/blog/merawat", en: "https://example.com/us/blog/caring", "x-default": "https://example.com/blog/merawat" })
    expect(hreflang(urls, { en: "caring" })).toEqual({ en: "https://example.com/us/blog/caring", "x-default": "https://example.com/us/blog/caring" })
    expect(hreflang(urls, null, "blog")["x-default"]).toBe("https://example.com/blog")
    expect(hreflang(urls, { id: "care", en: "care-en" }, "category").en).toBe("https://example.com/us/blog/category/care-en")
  })
})

const rows: IndexRow[] = [
  {
    id: "p1",
    published_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-02T00:00:00.000Z",
    cover: "https://cdn.example/c1.jpg",
    cover_wide: null,
    author: { id: "a", slug: "anto", name: "Anto", type: "person" },
    images: [{ src: "https://cdn.example/i1.jpg", alt: "" }],
    locales: {
      id: { slug: "merawat", title: "Merawat", excerpt: "R", translated: true, category_slug: "perawatan", category_name: "Perawatan" },
      en: { slug: "caring", title: "Caring", excerpt: "E", translated: true, category_slug: "care", category_name: "Care" },
    },
  },
  {
    id: "p2",
    published_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    cover: null,
    cover_wide: null,
    author: null,
    images: [],
    locales: { id: { slug: "tray", title: "Tray", excerpt: "T", translated: true, category_slug: null, category_name: null } },
  },
]

describe("sitemapEntries / rssFeed", () => {
  const urls = blogUrls(settings)
  it("root + categories + posts per readable locale, with alternates and images", () => {
    const e = sitemapEntries(urls, rows)
    expect(e.map((x) => x.url)).toEqual([
      "https://example.com/blog",
      "https://example.com/us/blog",
      "https://example.com/blog/category/perawatan",
      "https://example.com/us/blog/category/care",
      "https://example.com/blog/merawat",
      "https://example.com/us/blog/caring",
      "https://example.com/blog/tray",
    ])
    expect(e[0].lastModified).toEqual(new Date("2026-11-02T00:00:00.000Z"))
    expect(e[4].alternates?.languages).toEqual({ id: "https://example.com/blog/merawat", en: "https://example.com/us/blog/caring", "x-default": "https://example.com/blog/merawat" })
    expect(e[4].images).toEqual(["https://cdn.example/c1.jpg", "https://cdn.example/i1.jpg"])
    expect(e[6].alternates?.languages).toEqual({ id: "https://example.com/blog/tray", "x-default": "https://example.com/blog/tray" })
    expect(sitemapEntries(urls, [])).toEqual([])
  })
  it("rss: one locale, newest first, escaped, with creator/category/cover", () => {
    const xml = rssFeed(urls, "id", rows, { title: "Blog & more", description: "D", author: "Shop" })
    expect(xml).toContain("<title>Blog &amp; more</title>")
    expect(xml).toContain('<atom:link href="https://example.com/blog/feed.xml" rel="self"')
    expect(xml.indexOf("<link>https://example.com/blog/merawat</link>")).toBeLessThan(xml.indexOf("<link>https://example.com/blog/tray</link>"))
    expect(xml).toContain("<dc:creator>Anto</dc:creator>")
    expect(xml).toContain("<dc:creator>Shop</dc:creator>")
    expect(xml).toContain("<category>Perawatan</category>")
    expect(xml).toContain('<media:content url="https://cdn.example/c1.jpg"')
    expect(xml).toContain("<language>id</language>")
    const en = rssFeed(urls, "en", rows, { title: "t", description: "d" })
    expect(en).toContain("<link>https://example.com/us/blog/caring</link>")
    expect(en).not.toContain("tray")
  })
})

describe("jsonld", () => {
  const urls = blogUrls(settings)
  const post = {
    id: "p1", locale: "en", translated: true, dir: "ltr", slug: "caring", title: "Caring for teak", excerpt: "E", cover: "https://cdn.example/c.jpg", cover_wide: null, cover_alt: "c", featured: false,
    published_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-02T00:00:00.000Z", reading_minutes: 2,
    category: { id: "c", slug: "care", name: "Care", description: null, locale: "en", rank: 0, alternates: {} },
    author: { id: "a", slug: "anto", name: "Anto", type: "person", avatar: null, url: null, same_as: ["https://x.example/anto"], job_title: "Founder", bio: null },
    alternates: { en: "caring" }, seo_title: "Caring", seo_description: "SD", og_image: null, tags: ["teak", "care"], product_ids: [], body_html: "", blocks: [], toc: [],
    faq: [{ q: "Safe?", a: "Yes." }], words: 300, text: "", metadata: null,
  } as StoreArticle
  const organization = { name: "Haus Kayu", url: "https://example.com", logo: "https://example.com/logo.png" }
  it("BlogPosting with a Person author, publisher, section, keywords", () => {
    const j = blogPosting(urls, "en", post, { organization })
    expect(j).toMatchObject({ "@type": "BlogPosting", url: "https://example.com/us/blog/caring", headline: "Caring for teak", description: "SD", image: ["https://cdn.example/c.jpg"], author: { "@type": "Person", name: "Anto", jobTitle: "Founder", sameAs: ["https://x.example/anto"] }, articleSection: "Care", keywords: "teak, care", wordCount: 300, inLanguage: "en" })
    expect(j.publisher).toMatchObject({ "@type": "Organization", name: "Haus Kayu", logo: { url: "https://example.com/logo.png" } })
    expect(blogPosting(urls, "en", { ...post, author: null }, { organization }).author).toMatchObject({ "@type": "Organization", name: "Haus Kayu" })
  })
  it("faqPage and the combined post graph", () => {
    expect(faqPage([])).toBeNull()
    const all = postJsonLd(urls, "en", post, { organization, home_label: "Home" })
    expect(all.map((x) => x["@type"])).toEqual(["BlogPosting", "BreadcrumbList", "FAQPage"])
    expect((all[1] as any).itemListElement.map((i: any) => i.name)).toEqual(["Home", "Blog", "Care", "Caring for teak"])
    expect((all[1] as any).itemListElement[0].item).toBe("https://example.com/us")
  })
})
