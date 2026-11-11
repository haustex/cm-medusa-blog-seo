import sanitizeHtml from "sanitize-html"

/**
 * Article bodies come from the Admin editor but are never trusted: every save goes through sanitizeBody().
 * What stays is exactly what the editor can produce:
 *   p, h2, h3, ul/ol/li, blockquote, a, strong, em, u, s, code, br, hr, tables (merged cells only),
 *   figure > img + figcaption (uploaded images only), and two empty embed boxes:
 *   <div data-product-id="prod_…"> (product card) and <div data-youtube-id="…"> (video).
 * No script, style, iframe, event handlers, inline styles, classes or ids; links only http(s), mailto, tel.
 */
export type SanitizeOptions = {
  /** Where uploaded images are served from, e.g. ["https://api.example.com/static", "https://media.example.com"] */
  imageOrigins: string[]
  /** Hosts whose links are internal (no target/rel), e.g. ["example.com"] */
  siteHosts?: string[]
}

type Tag = { tagName: string; attribs: Record<string, string> }

export const PRODUCT_ID_RE = /^prod_[A-Za-z0-9]{10,40}$/
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
const MAX_DIM = 20000

const dim = (v: unknown) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 && n <= MAX_DIM ? String(n) : undefined
}

/**
 * `src` of an uploaded image when it sits directly under one of the allowed origins (a flat file name, no "..",
 * no query), else null. Origins are compared without a trailing slash.
 */
export function ownImage(src: unknown, origins: string[]): string | null {
  if (typeof src !== "string") return null
  for (const origin of origins) {
    const prefix = `${origin.replace(/\/+$/, "")}/`
    if (!src.startsWith(prefix)) continue
    const rest = src.slice(prefix.length)
    if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rest) && !rest.includes("..")) return src
  }
  return null
}

const internal = (href: string, hosts: string[]) => {
  if (href.startsWith("/") && !href.startsWith("//")) return true
  if (href.startsWith("#")) return true
  try {
    const h = new URL(href).hostname.toLowerCase()
    return hosts.some((x) => h === x || h === `www.${x}`)
  } catch {
    return false
  }
}

export function sanitizeBody(html: unknown, opts: SanitizeOptions): string {
  if (typeof html !== "string" || !html.trim()) return ""
  const hosts = (opts.siteHosts ?? []).map((h) => h.toLowerCase())
  const out = sanitizeHtml(html, {
    allowedTags: ["p", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "strong", "em", "u", "s", "code", "br", "hr", "figure", "figcaption", "img", "div", "table", "thead", "tbody", "tr", "th", "td"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      div: ["data-product-id", "data-youtube-id", "data-title"],
      ol: ["start"],
      // tables from the editor: merged cells only; column widths (colgroup/col, colwidth) and styles are dropped
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    // content of these is dropped with the tag (sanitize-html's default list + a few more)
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "svg", "math", "template", "title", "head"],
    transformTags: {
      h1: "h2",
      h4: "h3",
      h5: "h3",
      h6: "h3",
      b: "strong",
      i: "em",
      a: (tagName, attribs): Tag => {
        // The scheme is checked here too: this runs before sanitize-html's own check, which would only drop the href
        const href = (attribs.href ?? "").trim()
        if (internal(href, hosts) || /^(mailto|tel):/i.test(href)) return { tagName: "a", attribs: { href } }
        if (/^https?:\/\/[^\s/]/i.test(href)) return { tagName: "a", attribs: { href, target: "_blank", rel: "noopener noreferrer" } }
        return { tagName: "a", attribs: {} }
      },
      img: (tagName, attribs): Tag => {
        const src = ownImage(attribs.src, opts.imageOrigins)
        if (!src) return { tagName: "img", attribs: {} }
        const width = dim(attribs.width)
        const height = dim(attribs.height)
        return {
          tagName: "img",
          attribs: { src, alt: (attribs.alt ?? "").slice(0, 300), ...(width && height ? { width, height } : {}) },
        }
      },
      div: (tagName, attribs): Tag => {
        const product = attribs["data-product-id"]
        const youtube = attribs["data-youtube-id"]
        if (product && PRODUCT_ID_RE.test(product)) {
          const title = (attribs["data-title"] ?? "").slice(0, 200)
          return { tagName: "div", attribs: { "data-product-id": product, ...(title ? { "data-title": title } : {}) } }
        }
        if (youtube && YOUTUBE_ID_RE.test(youtube)) return { tagName: "div", attribs: { "data-youtube-id": youtube } }
        // any other div (pasted markup): the tag goes, its text stays ("span" is not an allowed tag)
        return { tagName: "span", attribs: {} }
      },
    },
    exclusiveFilter: (frame) => {
      // images that are not ours, embed boxes without a valid id
      if (frame.tag === "img") return !frame.attribs.src
      if (frame.tag === "div") return !frame.attribs["data-product-id"] && !frame.attribs["data-youtube-id"]
      return false
    },
  })
  return (
    out
      // An <a> that lost its href keeps its text only
      .replace(/<a>([\s\S]*?)<\/a>/g, "$1")
      // embed boxes are empty by definition
      .replace(/(<div data-(?:product|youtube)-id="[^"]*"(?: data-title="[^"]*")?>)[\s\S]*?(<\/div>)/g, "$1$2")
      // a figure whose image was dropped (not one of our uploads) goes with it
      .replace(/<figure>(?:(?!<img\b|<\/figure>)[\s\S])*<\/figure>/g, "")
      .replace(/<p>\s*<\/p>/g, "")
      .trim()
  )
}
