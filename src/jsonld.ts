/**
 * JSON-LD builders for blog pages. Import from "medusa-blog-seo/jsonld". Pure functions over the Store API's shapes.
 *
 *   const urls = blogUrls(settings, origin)
 *   blogPosting(urls, "en", post, { organization: { name: "Haus Kayu", url: origin, logo: `${origin}/logo.png` } })
 *   breadcrumbList([{ name: "Blog", url: urls.blog("en") }, { name: post.title, url: urls.post("en", post.slug) }])
 *   faqPage(post.faq)
 *   blogItemList(urls, "en", posts)
 */
import type { StoreArticle, StoreCard } from "./sdk"
import type { BlogUrls } from "./seo"

export type Organization = { name: string; url: string; logo?: string; legalName?: string; sameAs?: string[] }
export type JsonLd = Record<string, unknown>

const orgRef = (o: Organization) => ({ "@type": "Organization", "@id": `${o.url.replace(/\/$/, "")}/#organization`, name: o.name, url: o.url, ...(o.sameAs?.length ? { sameAs: o.sameAs } : {}) })

/** BlogPosting; the author is the post's author (Person/Organization) or the publisher when the post names none */
export function blogPosting(urls: BlogUrls, locale: string, post: StoreArticle, opts: { organization: Organization; images?: string[]; blog_name?: string }): JsonLd {
  const url = urls.post(locale, post.slug)
  const o = opts.organization
  const images = opts.images ?? [post.og_image, post.cover_wide, post.cover].filter((x): x is string => !!x)
  const author = post.author
    ? post.author.type === "organization"
      ? { "@type": "Organization", name: post.author.name, ...(post.author.url ? { url: post.author.url } : {}), ...(post.author.same_as.length ? { sameAs: post.author.same_as } : {}) }
      : { "@type": "Person", name: post.author.name, ...(post.author.url ? { url: post.author.url } : {}), ...(post.author.job_title ? { jobTitle: post.author.job_title } : {}), ...(post.author.same_as.length ? { sameAs: post.author.same_as } : {}) }
    : orgRef(o)
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: post.title.slice(0, 110),
    description: post.seo_description || post.excerpt,
    ...(images.length ? { image: images } : {}),
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author,
    publisher: { ...orgRef(o), ...(o.legalName ? { legalName: o.legalName } : {}), ...(o.logo ? { logo: { "@type": "ImageObject", url: o.logo } } : {}) },
    inLanguage: post.locale,
    ...(post.category ? { articleSection: post.category.name } : {}),
    ...(post.tags.length ? { keywords: post.tags.join(", ") } : {}),
    wordCount: post.words,
    isPartOf: { "@type": "Blog", "@id": `${urls.blog(locale)}#blog`, name: opts.blog_name ?? `${o.name} Blog`, publisher: orgRef(o) },
  }
}

export function breadcrumbList(items: { name: string; url: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  }
}

/** FAQPage from the article's Q&A blocks (h3 ending in "?" + its paragraphs); null when there are none */
export function faqPage(faq: { q: string; a: string }[]): JsonLd | null {
  if (!faq.length) return null
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  }
}

/** The listing pages: the posts on the page, in order; null when empty */
export function blogItemList(urls: BlogUrls, locale: string, posts: Pick<StoreCard, "slug" | "title">[]): JsonLd | null {
  if (!posts.length) return null
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: posts.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.title, url: urls.post(locale, p.slug) })),
  }
}

/** Everything a post page needs, as one array for `<script type="application/ld+json">` */
export function postJsonLd(urls: BlogUrls, locale: string, post: StoreArticle, opts: { organization: Organization; blog_label?: string; home_label?: string; images?: string[]; blog_name?: string }): JsonLd[] {
  const crumbs = [
    ...(opts.home_label ? [{ name: opts.home_label, url: urls.base(locale) || urls.ctx.storefront_url || "/" }] : []),
    { name: opts.blog_label ?? "Blog", url: urls.blog(locale) },
    ...(post.category ? [{ name: post.category.name, url: urls.category(locale, post.category.slug) }] : []),
    { name: post.title, url: urls.post(locale, post.slug) },
  ]
  return [blogPosting(urls, locale, post, opts), breadcrumbList(crumbs), ...(faqPage(post.faq) ? [faqPage(post.faq)!] : [])]
}
