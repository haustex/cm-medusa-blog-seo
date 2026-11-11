/** Slugs are lower-case ASCII words joined by "-", at most 80 characters. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MAX = 80

/** "Cara merawat talenan jati!" → "cara-merawat-talenan-jati" */
export function slugify(input: string): string {
  const s = String(input ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (s.length <= SLUG_MAX) return s
  // cut at a word boundary
  const cut = s.slice(0, SLUG_MAX)
  const at = cut.lastIndexOf("-")
  return (at > 20 ? cut.slice(0, at) : cut).replace(/-+$/g, "")
}

export const isValidSlug = (slug: string, reserved: readonly string[] = []) =>
  SLUG_RE.test(slug) && slug.length <= SLUG_MAX && !reserved.includes(slug)

/**
 * A free slug starting from `base`: base, base-2, base-3, … `taken` answers for one candidate (a database lookup).
 * Reserved words and an empty base start from the fallback.
 */
export async function uniqueSlug(
  base: string,
  taken: (slug: string) => Promise<boolean> | boolean,
  opts: { fallback?: string; reserved?: readonly string[] } = {}
): Promise<string> {
  const fallback = opts.fallback || "post"
  const reserved = opts.reserved ?? []
  let root = slugify(base)
  if (!root || reserved.includes(root)) root = root ? `${root}-${fallback}` : fallback
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? "" : `-${n}`
    const candidate = `${root.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`
    if (!(await taken(candidate))) return candidate
  }
  throw new Error(`no free slug for "${root}"`)
}
