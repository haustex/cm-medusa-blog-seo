import sanitizeHtml from "sanitize-html"

/** Titles, excerpts, alt texts, SEO fields: one line of plain text, at most `max` characters */
export function plainLine(input: unknown, max: number): string {
  if (typeof input !== "string") return ""
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

/** Plain text that may span lines (bios, descriptions) */
export function plainText(input: unknown, max: number): string {
  if (typeof input !== "string") return ""
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, max)
}

/** A list of short lower-case tags, unique, at most `max` of them */
export function tagList(input: unknown, max = 20, maxLength = 40): string[] {
  if (!Array.isArray(input)) return []
  const tags = input.map((t) => plainLine(t, maxLength).toLowerCase()).filter(Boolean)
  return Array.from(new Set(tags)).slice(0, max)
}

/** An absolute http(s) URL or null */
export function httpUrl(input: unknown, max = 500): string | null {
  if (typeof input !== "string") return null
  const s = input.trim()
  if (!/^https?:\/\/[^\s/]/i.test(s) || s.length > max) return null
  try {
    return new URL(s).toString()
  } catch {
    return null
  }
}
