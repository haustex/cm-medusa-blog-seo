import type * as HtmlParser2 from "htmlparser2" with { "resolution-mode": "import" }
import { slugify } from "./slug"

// htmlparser2 12 is ESM-only. Node 20/22 load it with require(); TypeScript only allows that spelled as require.
const { DomUtils, parseDocument } = require("htmlparser2") as typeof HtmlParser2

/**
 * Turns a sanitized article body into what a storefront renders, so it needs no HTML parser of its own:
 *   blocks: runs of plain HTML (tables wrapped for horizontal scrolling), and the parts that become components
 *           (image, product card, video, Q&A)
 *   toc:    the h2 headings (each gets an id inside its html block)
 *   faq:    question/answer pairs, also used for FAQPage structured data
 *
 * Q&A rule (option faq_from_headings): an h3 that ends with "?" followed by text (until the next heading or
 * component) is a question with its answer; neighbouring pairs form one block.
 */
export type Block =
  | { type: "html"; html: string }
  | { type: "image"; src: string; alt: string; width: number | null; height: number | null; caption: string | null; position: number }
  | { type: "product"; id: string }
  | { type: "youtube"; id: string }
  | { type: "faq"; items: FaqItem[] }
export type FaqItem = { q: string; a_html: string; a: string }
export type TocItem = { id: string; label: string }
export type Rendered = { blocks: Block[]; toc: TocItem[]; faq: FaqItem[]; text: string; words: number; reading_minutes: number }
export type RenderOptions = { faq_from_headings?: boolean; words_per_minute?: number; table_class?: string }

type Node = ReturnType<typeof HtmlParser2.parseDocument>["children"][number]
type El = Extract<Node, { attribs: Record<string, string> }>

const isEl = (n: Node | undefined | null): n is El => !!n && (n as El).attribs !== undefined && typeof (n as El).name === "string"
const BLOCK = new Set(["p", "h2", "h3", "ul", "ol", "li", "blockquote", "figure", "figcaption", "div", "br", "hr", "table", "thead", "tbody", "tr", "th", "td"])
/** Readable text: entities decoded, a space between blocks ("…end. Next…", not "…end.Next…") */
function raw(n: Node | Node[]): string {
  if (Array.isArray(n)) return n.map(raw).join("")
  if (isEl(n)) return BLOCK.has(n.name) ? ` ${raw(n.children as Node[])} ` : raw(n.children as Node[])
  return (n as { data?: string }).data ?? ""
}
const text = (n: Node | Node[]) => raw(n).replace(/\s+/g, " ").replace(/ ([.,;:!?])/g, "$1").trim()
// Parsed with entities decoded (so text is text); written back with the HTML-significant ones encoded again
const outer = (n: Node | Node[]) => DomUtils.getOuterHTML(n as any, { encodeEntities: "utf8" })

export function renderBody(html: string | null | undefined, opts: RenderOptions = {}): Rendered {
  const faqFromHeadings = opts.faq_from_headings !== false
  const wpm = opts.words_per_minute && opts.words_per_minute > 0 ? opts.words_per_minute : 200
  const tableClass = opts.table_class ?? "blog-table"
  /** A top-level table gets a scrolling wrapper, so a wide table never widens the page on a phone */
  const block = (n: Node) => (isEl(n) ? (n.name === "table" ? `<div class="${tableClass}">${outer(n)}</div>` : outer(n)) : `<p>${outer(n)}</p>`)

  const doc = parseDocument(html ?? "", { decodeEntities: true })
  const nodes = doc.children.filter((n) => isEl(n) || text(n))
  const blocks: Block[] = []
  const toc: TocItem[] = []
  const faq: FaqItem[] = []
  const ids = new Set<string>()
  let run: string[] = []
  let images = 0
  const flush = () => {
    if (run.length) blocks.push({ type: "html", html: run.join("") })
    run = []
  }
  const headingId = (label: string) => {
    const base = slugify(label).slice(0, 60) || "section"
    let id = base
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
    ids.add(id)
    return id
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (!isEl(n)) {
      run.push(block(n))
      continue
    }
    if (n.name === "div" && n.attribs["data-product-id"]) {
      flush()
      blocks.push({ type: "product", id: n.attribs["data-product-id"] })
      continue
    }
    if (n.name === "div" && n.attribs["data-youtube-id"]) {
      flush()
      blocks.push({ type: "youtube", id: n.attribs["data-youtube-id"] })
      continue
    }
    const img = n.name === "img" ? n : n.name === "figure" ? (DomUtils.findOne((e) => e.name === "img", n.children as any) as El | null) : null
    if (img?.attribs.src) {
      flush()
      const cap = n.name === "figure" ? DomUtils.findOne((e) => e.name === "figcaption", n.children as any) : null
      const w = Number(img.attribs.width)
      const h = Number(img.attribs.height)
      blocks.push({
        type: "image",
        src: img.attribs.src,
        alt: img.attribs.alt ?? "",
        width: w > 0 && h > 0 ? w : null,
        height: w > 0 && h > 0 ? h : null,
        caption: cap ? text(cap as any) || null : null,
        position: ++images,
      })
      continue
    }
    if (faqFromHeadings && n.name === "h3" && text(n).endsWith("?")) {
      // the answer: everything up to the next heading or component
      const answer: Node[] = []
      let j = i + 1
      for (; j < nodes.length; j++) {
        const m = nodes[j]
        if (isEl(m) && (["h2", "h3", "figure", "img"].includes(m.name) || (m.name === "div" && (m.attribs["data-product-id"] || m.attribs["data-youtube-id"])))) break
        answer.push(m)
      }
      if (answer.length && text(answer)) {
        const item: FaqItem = { q: text(n), a_html: answer.map(block).join(""), a: text(answer) }
        faq.push(item)
        const last = blocks[blocks.length - 1]
        if (!run.length && last?.type === "faq") last.items.push(item)
        else {
          flush()
          blocks.push({ type: "faq", items: [item] })
        }
        i = j - 1
        continue
      }
    }
    if (n.name === "h2") {
      const label = text(n)
      if (label) {
        const id = headingId(label)
        toc.push({ id, label })
        n.attribs.id = id
      }
    }
    run.push(block(n))
  }
  flush()

  const plain = text(doc.children as Node[])
  const words = plain ? plain.split(/\s+/).length : 0
  return { blocks, toc, faq, text: plain, words, reading_minutes: Math.max(1, Math.round(words / wpm)) }
}

/** True when the body has something to read or look at (text, an image or an embed) */
export function hasContent(html: string | null | undefined): boolean {
  const r = renderBody(html)
  return r.words > 0 || r.blocks.some((b) => b.type !== "html")
}

/** Every image of a body in order of appearance: for sitemaps and migrations */
export function bodyImages(html: string | null | undefined): { src: string; alt: string; position: number }[] {
  return renderBody(html).blocks.flatMap((b) => (b.type === "image" ? [{ src: b.src, alt: b.alt, position: b.position }] : []))
}
