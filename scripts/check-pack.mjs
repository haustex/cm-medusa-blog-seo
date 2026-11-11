// `npm pack --dry-run` must be clean: what the package needs is in it, nothing
// else is (tests, test app, CI, secrets, notes). Run after `npm run build`.
//
//   node scripts/check-pack.mjs
import { execFileSync } from "node:child_process"

const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" }))
const paths = pack.files.map((file) => file.path)
const problems = []

const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "SECURITY.md",
  ".medusa/server/src/modules/blog-seo/index.js",
  ".medusa/server/src/links/post-product.js",
  ".medusa/server/src/admin/index.js",
  ".medusa/server/src/admin/index.mjs",
  ".medusa/server/src/api/middlewares.js",
  ".medusa/server/src/api/admin/blog-seo/posts/route.js",
  ".medusa/server/src/api/store/blog-seo/posts/route.js",
  ".medusa/server/src/subscribers/blog-seo-revalidate.js",
  ".medusa/server/src/jobs/blog-seo-publish-scheduled.js",
  ".medusa/server/src/jsonld.js",
  ".medusa/server/src/seo.js",
  ".medusa/server/src/sdk.js",
]
const migrations = paths.filter((p) => /\.medusa\/server\/src\/modules\/blog-seo\/migrations\/Migration\d+\.js$/.test(p))
if (migrations.length < 1) problems.push("missing module migrations")
for (const required of REQUIRED) {
  if (!paths.includes(required)) problems.push(`missing ${required}`)
}

const FORBIDDEN = [
  [/(^|\/)__tests__\//, "tests"],
  [/\.spec\.[jt]sx?$/, "tests"],
  [/^integration-tests\//, "the test app"],
  [/^\.github\//, "CI"],
  [/^scripts\//, "repo scripts"],
  [/^docs\//, "docs/screenshots"],
  [/(^|\/)\.env(\.|$)/, "an env file"],
  [/(^|\/)CLAUDE\.md$/, "working notes"],
  [/(^|\/)\.state\//, "test state"],
  [/(^|\/)node_modules\//, "node_modules"],
  [/^src\//, "plugin sources (the build is shipped)"],
  [/tsconfig\.json$/, "a tsconfig"],
]
for (const path of paths) {
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(path)) problems.push(`${path}: ${what}`)
  }
}

console.log(`${pack.name}@${pack.version}: ${pack.files.length} files, ${(pack.size / 1024).toFixed(0)} kB packed, ${(pack.unpackedSize / 1024).toFixed(0)} kB unpacked`)
if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join("\n"))
  console.error(`npm pack: ${problems.length} problem(s)`)
  process.exit(1)
}
console.log("npm pack: clean")
