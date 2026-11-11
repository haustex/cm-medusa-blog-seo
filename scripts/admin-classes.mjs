// Tailwind classes of the plugin's built Admin bundle (.medusa/server/src/admin/index.js) that are missing from a
// built Admin CSS. Medusa's admin bundler adds every plugin's admin bundle to Tailwind's `content`, so each class the
// bundle uses must come out in the CSS; one that does not is either a typo / not a Medusa UI token, or the bundler
// could not resolve the package (see README, "pnpm without hoisting"). Usage:
//   node scripts/admin-classes.mjs <bundle.js> <admin.css> [more.css]
import fs from "node:fs"

const UTILITY =
  /^!?-?(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|w|h|min-w|max-w|min-h|max-h|size|gap|gap-x|gap-y|grid-cols|grid-rows|grid-flow|col-span|col-start|col-end|row-span|flex|basis|items|justify|justify-items|justify-self|self|content|place-items|place-content|text|font|leading|tracking|bg|border|border-[trblxyse]|rounded|rounded-[trblse]+|shadow|ring|ring-offset|outline|opacity|overflow|overflow-[xy]|whitespace|break|inset|inset-[xy]|top|bottom|left|right|start|end|z|space-x|space-y|divide|divide-[xy]|order|cursor|pointer-events|select|transition|duration|delay|ease|animate|translate|translate-[xy]|rotate|scale|origin|line-clamp|list|object|aspect|align|fill|stroke|placeholder|accent|caret|decoration|backdrop|blur|grayscale|columns|touch|scroll|snap|will-change|hyphens|indent|mix-blend|float|clear|from|via|to|txt|group|peer)-[a-z0-9.\[\]/_%#(),!'-]+$|^!?(flex|grid|hidden|block|inline|inline-flex|inline-block|inline-grid|relative|absolute|fixed|sticky|static|truncate|italic|not-italic|underline|no-underline|line-through|uppercase|lowercase|capitalize|normal-case|shrink|grow|border|rounded|shadow|ring|invisible|visible|collapse|contents|flow-root|isolate|sr-only|not-sr-only|antialiased|subpixel-antialiased|container|transition|resize|tabular-nums|ordinal|slashed-zero|appearance-none|outline-none|cursor-pointer|select-none)$/
const VARIANT = /^(?:(?:sm|md|lg|xl|2xl|hover|focus|focus-visible|focus-within|active|visited|disabled|enabled|checked|first|last|odd|even|only|empty|before|after|placeholder|dark|rtl|ltr|print|motion-safe|motion-reduce|group-hover|group-focus|peer-hover|peer-focus|peer-checked|data-\[[^\]]+\]|aria-\[[^\]]+\]|group-data-\[[^\]]+\]|has-\[[^\]]+\]|supports-\[[^\]]+\]|\[[^\]]+\]):)*/

/** Tailwind-looking class tokens in a JS bundle (string literals and template literals; data-* test ids skipped) */
export function classesOf(source) {
  const text = source.replace(/"data-[\w-]+"\s*:\s*(?:"[^"]*"|`[^`]*`)/g, " ")
  const out = new Set()
  const re = /"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`]*)`/g
  let m
  while ((m = re.exec(text))) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ")
    for (const t of raw.split(/\s+/)) {
      if (!t || !/^[a-z0-9!\-\[\]:./_%#(),='"]+$/i.test(t) || /[A-Z]/.test(t)) continue
      const variants = t.match(VARIANT)[0]
      const base = t.slice(variants.length)
      if (UTILITY.test(base)) out.add(t)
    }
  }
  return out
}

const inCss = (css, cls) => {
  const esc = cls.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c).replace(/[.*+?^${}()|[\]\\/]/g, (c) => "\\" + c)
  return new RegExp(`\\.${esc}(?![a-zA-Z0-9_-])`).test(css)
}

/** classes of the bundle that no CSS file contains */
export function missingClasses(bundleSource, cssSources) {
  const all = classesOf(bundleSource)
  return { total: all.size, missing: [...all].filter((c) => !cssSources.some((css) => inCss(css, c))).sort() }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [bundle, ...css] = process.argv.slice(2)
  if (!bundle || !css.length) {
    console.error("usage: node scripts/admin-classes.mjs <bundle.js> <admin.css>...")
    process.exit(2)
  }
  const { total, missing } = missingClasses(fs.readFileSync(bundle, "utf8"), css.map((f) => fs.readFileSync(f, "utf8")))
  console.log(`${total} classes in the bundle, ${missing.length} missing from the CSS${missing.length ? ":\n  " + missing.join("\n  ") : ""}`)
  process.exit(missing.length ? 1 : 0)
}
