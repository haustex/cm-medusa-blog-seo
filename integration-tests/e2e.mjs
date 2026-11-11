// End-to-end check of the plugin inside a real Medusa app (integration-tests/app): fresh database, migrations,
// server on port 9700, then the Admin + Store APIs: settings (locales id/en/de, fallback default/hide/label),
// authors, categories, posts with per-locale translations, slugs, sanitizing, product links, publish/schedule/
// unpublish/delete, the publish job, preview tokens, uploads (with and without sharp), events → revalidate webhook.
//
// Usage (plugin built first with `npm run build`):
//   docker run -d --name rw-spike-pg -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=rw_spike -p 127.0.0.1:55436:5432 postgres:17-alpine
//   node integration-tests/e2e.mjs
//
// BSEO_PG_CONTAINER: name of the Postgres container (default rw-spike-pg). BSEO_KEEP=1 keeps the server running
// after the checks; BSEO_SERVE=1 skips the checks and only starts the (empty) app, e.g. with BSEO_ADMIN=1 to click
// through the Admin (then integration-tests/seed-demo.mjs fills in sample content). BSEO_CREDIT=1 turns the
// plugin's showCredit option on (the checks do; the default is off, as in the plugin).
// BSEO_NO_SHARP=1 runs the upload checks without image processing. Every medusa command goes through
// scripts/guard.mjs (rw-spike-* containers and ports 9700+ only).
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import zlib from "node:zlib"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_DIR = path.resolve(HERE, "..")
const APP_DIR = path.join(HERE, "app")
const STATE_DIR = path.join(HERE, ".state")
const GUARD = path.join(PLUGIN_DIR, "scripts/guard.mjs")
const MEDUSA = path.join(PLUGIN_DIR, "node_modules/.bin/medusa")
const PACKAGE = "medusa-blog-seo"

const DB_NAME = "bseo_e2e"
const PG_CONTAINER = process.env.BSEO_PG_CONTAINER || "rw-spike-pg"
const PORT = 9700
const HOOK_PORT = 9701
const BASE = `http://127.0.0.1:${PORT}`
const ADMIN = { email: "admin@e2e.test", password: "e2e-password-123" }
const NO_SHARP = process.env.BSEO_NO_SHARP === "1"
const SERVE = process.env.BSEO_SERVE === "1"
const KEEP = SERVE || process.env.BSEO_KEEP === "1"

const env = {
  ...process.env,
  DATABASE_URL: `postgres://postgres:spike@127.0.0.1:55436/${DB_NAME}`,
  REDIS_URL: "redis://127.0.0.1:56383",
  PORT: String(PORT),
  BSEO_PLUGIN_DIR: PLUGIN_DIR,
  BSEO_ADMIN: process.env.BSEO_ADMIN ?? "",
  BSEO_CREDIT: process.env.BSEO_CREDIT ?? (SERVE ? "" : "1"),
  BSEO_UPLOAD_DIR: path.join(APP_DIR, "static"), // Medusa serves <app>/static at /static
  BSEO_REVALIDATE_URL: `http://127.0.0.1:${HOOK_PORT}/revalidate`,
  NODE_ENV: "development",
}
// REDIS_URL only satisfies the guard; the test app uses the in-memory event bus and workflow engine

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: APP_DIR, env, stdio: "inherit", ...opts })
  if (r.status !== 0) throw new Error(`failed: ${cmd} ${args.join(" ")}`)
}
const guarded = (...args) => run("node", [GUARD, MEDUSA, ...args])

/** The only paths this script ever removes: non-empty, absolute, inside integration-tests/ (never the plugin, never /) */
function inside(p) {
  if (!p || !path.isAbsolute(p) || !p.startsWith(HERE + path.sep) || p === HERE) throw new Error(`refusing to remove ${JSON.stringify(p)}: not inside ${HERE}`)
  return p
}
const rmGuarded = (p) => fs.rmSync(inside(p), { recursive: true, force: true })

function linkNodeModules() {
  const target = path.join(APP_DIR, "node_modules")
  rmGuarded(target)
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(path.join(PLUGIN_DIR, "node_modules"))) {
    if ([".package-lock.json", ".cache", ".vite", ".bin"].includes(entry)) continue
    fs.symlinkSync(path.join(PLUGIN_DIR, "node_modules", entry), path.join(target, entry))
  }
  fs.symlinkSync(PLUGIN_DIR, path.join(target, PACKAGE))
}

function psql(sql, db) {
  if (!db) {
    run("docker", ["exec", PG_CONTAINER, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql])
    return ""
  }
  const out = spawnSync("docker", ["exec", PG_CONTAINER, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" })
  if (out.status !== 0) throw new Error(`psql failed: ${out.stderr}`)
  return out.stdout.trim()
}

async function waitForPostgres() {
  const started = Date.now()
  let last = ""
  while (Date.now() - started < 60_000) {
    const q = spawnSync("docker", ["exec", PG_CONTAINER, "psql", "-h", "127.0.0.1", "-U", "postgres", "-tAc", "select 1"], { encoding: "utf8" })
    if (q.status === 0 && q.stdout.trim() === "1") return
    last = (q.stderr || q.stdout).trim()
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Postgres container "${PG_CONTAINER}" not ready after 60 s (last: ${last || "no answer"}).`)
}

let failures = 0
let passes = 0
function check(name, ok, detail) {
  if (ok) passes++
  else failures++
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t) => console.log(`\n${t}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ctx = { admin: {}, pk: null }

/** store: publishable key; raw: FormData */
async function api(method, url, { body, headers = {}, raw, store = false, admin = true } = {}) {
  const h = { ...headers }
  if (!raw) h["content-type"] = "application/json"
  if (store && ctx.pk) h["x-publishable-api-key"] = ctx.pk
  else if (!store && admin && ctx.admin.authorization) h.authorization = ctx.admin.authorization
  const res = await fetch(BASE + url, { method, headers: h, body: raw ?? (body ? JSON.stringify(body) : undefined) })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json, text, headers: res.headers }
}

async function login() {
  const auth = await api("POST", "/auth/user/emailpass", { body: ADMIN, admin: false })
  if (!auth.json?.token) throw new Error(`login failed: ${JSON.stringify(auth.json)}`)
  ctx.admin = { authorization: `Bearer ${auth.json.token}` }
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
/** A valid RGB PNG of the given size (so width/height are told apart) */
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  const raw = Buffer.alloc((1 + width * 3) * height, 0x80)
  for (let y = 0; y < height; y++) raw[y * (1 + width * 3)] = 0 // filter none
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}
const PNG_2x3 = makePng(2, 3)

function multipart(files) {
  const form = new FormData()
  for (const f of files) form.append("files", new Blob([f.content], { type: f.type }), f.name)
  return form
}

async function fail(name, r) {
  check(name, false, r.json ?? r)
  throw new Error(`setup failed at: ${name}`)
}

/** Publishable key and two products (for shoppable links) */
async function setupStore() {
  const sc = (await api("GET", "/admin/sales-channels")).json.sales_channels[0]
  const key = (await api("POST", "/admin/api-keys", { body: { title: "e2e", type: "publishable" } })).json.api_key
  await api("POST", `/admin/api-keys/${key.id}/sales-channels`, { body: { add: [sc.id] } })
  ctx.pk = key.token
  const mk = async (title) => {
    const r = await api("POST", "/admin/products", { body: { title, status: "published", sales_channels: [{ id: sc.id }], options: [{ title: "Size", values: ["One"] }], variants: [{ title: "One", options: { Size: "One" }, manage_inventory: false, prices: [{ currency_code: "usd", amount: 20 }] }] } })
    if (!r.json.product) await fail(`product ${title}`, r)
    return r.json.product
  }
  return { sc, product: await mk("Teak chopping board"), product2: await mk("Teak tray") }
}

const runJob = (job, extra = {}) => api("POST", "/admin/e2e/jobs", { body: { job, ...extra } })

/** Stand-in for the storefront's revalidate endpoint */
const hooks = []
function startHookServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let data = ""
      req.on("data", (c) => (data += c))
      req.on("end", () => {
        let body
        try {
          body = JSON.parse(data)
        } catch {
          body = data
        }
        hooks.push({ url: req.url, secret: req.headers["x-revalidate-secret"], body })
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ ok: true }))
      })
    })
    server.listen(HOOK_PORT, "127.0.0.1", () => resolve(server))
  })
}
async function waitHook(pred, ms = 4000) {
  const started = Date.now()
  while (Date.now() - started < ms) {
    const hit = hooks.find(pred)
    if (hit) return hit
    await sleep(100)
  }
  return null
}
const postsIn = (hook) => hook?.body?.blog_seo?.posts ?? []

const BODY_ID = `
<h2>Kenapa talenan jati</h2>
<p>Talenan <strong>kayu jati</strong> tahan lama. <a href="https://storefront.e2e.test/products/talenan">Lihat produk</a> dan <a href="https://example.org/x">tautan luar</a>.</p>
<img src="https://cdn.e2e.test/media/talenan.jpg" alt="Talenan jati" width="1200" height="800">
<img src="https://evil.example/pic.jpg" alt="asing">
<h3>Bagaimana cara merawatnya?</h3>
<p>Cuci dengan tangan, keringkan tegak, olesi minyak mineral sebulan sekali.</p>
<h3>Apakah aman untuk makanan?</h3>
<p>Ya, minyak mineral food-grade aman.</p>
<script>alert(1)</script>
<p onclick="x()">Paragraf penutup dengan ${"kata ".repeat(300)}</p>
`

async function checks() {
  await login()
  const store = await setupStore()

  section("Settings")
  let r = await api("GET", "/admin/blog-seo/settings")
  check("default settings: one locale en, fallback default, nothing locked", r.status === 200 && r.json.settings.locales.length === 1 && r.json.settings.locales[0].code === "en" && r.json.settings.default_locale === "en" && r.json.settings.fallback === "default" && r.json.settings.locked.locales === false, r.json)
  check("routing from plugin options: en prefix /us, base /blog", r.json.settings.routing?.locales?.en?.prefix === "/us" && r.json.settings.routing.base === "/blog", r.json.settings.routing)
  r = await api("POST", "/admin/blog-seo/settings", { body: { locales: [{ code: "id", name: "Bahasa Indonesia" }, "en", { code: "ar", dir: "rtl" }, "de", "id"], default_locale: "id", fallback: "default" } })
  check("locales saved: id/en/ar/de (duplicate dropped), names and dirs filled in, default id", r.status === 200 && r.json.settings.locales.map((l) => l.code).join() === "id,en,ar,de" && r.json.settings.locales[2].dir === "rtl" && r.json.settings.locales[3].name === "Deutsch" && r.json.settings.default_locale === "id", r.json)
  r = await api("POST", "/admin/blog-seo/settings", { body: { default_locale: "fr" } })
  check("unknown default locale refused", r.status === 400 && r.json.code === "locale_unknown", r.json)
  r = await api("POST", "/admin/blog-seo/settings", { body: { locales: [{ code: "id", enabled: false }] } })
  check("no enabled locale refused", r.status === 400, r.json)
  r = await api("POST", "/admin/blog-seo/settings", { body: { locales: [{ code: "id", name: "Bahasa Indonesia" }, "en", "de"] } })
  check("ar removed", r.json.settings.locales.map((l) => l.code).join() === "id,en,de", r.json)
  r = await api("GET", "/store/blog-seo/settings", { store: true })
  check("store settings: locales, default, fallback, x_default = id", r.status === 200 && r.json.settings.locales.length === 3 && r.json.settings.default_locale === "id" && r.json.settings.x_default === "id" && r.json.settings.storefront_url === "https://storefront.e2e.test", r.json)
  r = await api("GET", "/admin/blog-seo/config")
  check(`config: credit on, image processing ${NO_SHARP ? "off" : "on"}, revalidate configured`, r.json.show_credit === true && r.json.uploads.process_images === !NO_SHARP && r.json.revalidate === true, r.json)
  const settingsHook = await waitHook((h) => h.body?.blog_seo?.all === true)
  check("settings change → revalidate webhook (all)", !!settingsHook && settingsHook.secret === "e2e-revalidate", hooks)

  section("Authors and categories")
  r = await api("POST", "/admin/blog-seo/authors", { body: { name: "Anto Rahman", url: "https://hauskayu.com", same_as: ["https://instagram.com/hauskayu", "not a url"], translations: { id: { job_title: "Pendiri", bio: "Tukang kayu dari Jepara." }, en: { job_title: "Founder" } } } })
  check("author created, slug from name, bad same_as dropped", r.status === 201 && r.json.author.slug === "anto-rahman" && r.json.author.same_as.length === 1 && r.json.author.translations.id.job_title === "Pendiri", r.json)
  const author = r.json.author
  r = await api("POST", "/admin/blog-seo/authors", { body: { name: "Anto Rahman", type: "organization" } })
  check("second author with the same name gets a different slug", r.status === 201 && r.json.author.slug === "anto-rahman-2" && r.json.author.type === "organization", r.json)
  const author2 = r.json.author
  r = await api("POST", "/admin/blog-seo/authors", { body: { name: "" } })
  check("author without name refused", r.status === 400, r.json)
  r = await api("POST", "/admin/blog-seo/categories", { body: { translations: { id: { name: "Perawatan" }, en: { name: "Care", slug: "care" } }, rank: 2 } })
  check("category created with slugs per locale", r.status === 201 && r.json.category.translations.id.slug === "perawatan" && r.json.category.translations.en.slug === "care", r.json)
  const category = r.json.category
  r = await api("POST", "/admin/blog-seo/categories", { body: { translations: { en: { name: "Only English" } } } })
  check("category without the default locale's name refused", r.status === 400, r.json)
  r = await api("POST", "/admin/blog-seo/categories", { body: { translations: { id: { name: "Lain", slug: "perawatan" } } } })
  check("category slug taken in the same locale → 409", r.status === 409 && r.json.code === "slug_taken", r.json)
  r = await api("POST", "/admin/blog-seo/categories", { body: { translations: { id: { name: "Cerita" }, en: { name: "Stories", slug: "perawatan" } }, rank: 1 } })
  check("same slug in another locale is fine", r.status === 201 && r.json.category.translations.en.slug === "perawatan", r.json)
  const category2 = r.json.category
  r = await api("POST", "/admin/blog-seo/categories", { body: { translations: { id: { name: "Nama", slug: "feed" } } } })
  check("reserved slug refused", r.status === 400 && r.json.code === "invalid_slug", r.json)
  r = await api("GET", "/admin/blog-seo/categories")
  check("admin categories by rank", r.json.categories.map((c) => c.translations.id.name).join() === "Cerita,Perawatan", r.json)

  section("Post: create (draft), slugs, sanitizing, product links")
  r = await api("POST", "/admin/blog-seo/posts", {
    body: {
      translations: { id: { title: "Merawat Talenan Jati", excerpt: "Cara merawat talenan jati supaya awet.", body: BODY_ID, tags: ["talenan", "Perawatan", "talenan"] } },
      category_id: category.id,
      author_id: author.id,
      product_ids: [store.product.id, "prod_does_not_exist", store.product2.id],
      cover: "https://cdn.e2e.test/media/cover.jpg",
      cover_wide: "https://elsewhere.example/cover.jpg",
    },
  })
  check("draft created; slug from the title; unknown product dropped; cover from a foreign origin dropped", r.status === 201 && r.json.post.status === "draft" && r.json.post.translations.id.slug === "merawat-talenan-jati" && r.json.post.product_ids.length === 2 && r.json.post.cover === "https://cdn.e2e.test/media/cover.jpg" && r.json.post.cover_wide === null, r.json)
  const post = r.json.post
  const bodyId = post.translations.id.body
  check("body sanitized: script and onclick gone, foreign image gone, own image kept with size, external link target=_blank", !/script|onclick|evil\.example/.test(bodyId) && /cdn\.e2e\.test\/media\/talenan\.jpg/.test(bodyId) && /width="1200"/.test(bodyId) && /example\.org\/x"[^>]*target="_blank"/.test(bodyId) && !/storefront\.e2e\.test\/products\/talenan"[^>]*target/.test(bodyId), bodyId)
  check("tags deduplicated, lower-cased", post.translations.id.tags.join() === "talenan,perawatan", post.translations.id.tags)
  check("completeness: id complete, en and de missing", post.completeness.publishable === true && post.completeness.locales.find((l) => l.locale === "en").missing.includes("title") && post.completeness.locales.find((l) => l.locale === "id").missing.length === 0, post.completeness)
  check("preview + public urls per locale from routing (en under /us)", post.preview_urls.en?.startsWith("https://storefront.e2e.test/us/blog/preview/") && post.public_urls.id === "https://storefront.e2e.test/blog/merawat-talenan-jati" && !post.public_urls.en, post)
  r = await api("GET", `/admin/products/${store.product.id}?fields=id,*bseo_posts`)
  check("product → post link readable through the product (bseo_posts)", r.status === 200 && Array.isArray(r.json.product?.bseo_posts) && r.json.product.bseo_posts.some((p) => p.id === post.id), r.json.product)
  r = await api("POST", "/admin/blog-seo/posts", { body: { translations: { id: { title: "Merawat Talenan Jati" } } } })
  check("second post with the same title gets slug -2", r.json.post.translations.id.slug === "merawat-talenan-jati-2", r.json)
  const post2 = r.json.post
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}`, { body: { translations: { id: { slug: "merawat-talenan-jati" } } } })
  check("slug taken in the locale → 409", r.status === 409 && r.json.code === "slug_taken", r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}`, { body: { translations: { id: { slug: "Bad Slug!" } } } })
  check("invalid slug → 400", r.status === 400 && r.json.code === "invalid_slug", r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}`, { body: { translations: { fr: { title: "Bonjour" } } } })
  check("unknown locale → 400", r.status === 400 && r.json.code === "locale_unknown", r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}`, { body: { category_id: "bseocat_nope" } })
  check("unknown category → 400", r.status === 400 && r.json.code === "category_not_found", r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}`, { body: { translations: { id: { title: "Tray Jati untuk Meja Makan", auto_slug: true } } } })
  check("draft with auto_slug follows the new title", r.json.post.translations.id.slug === "tray-jati-untuk-meja-makan", r.json)

  section("Store before publishing")
  r = await api("GET", "/store/blog-seo/posts", { store: true })
  check("nothing public yet", r.status === 200 && r.json.count === 0 && r.json.featured === null, r.json)
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati", { store: true })
  check("draft is not readable by slug", r.status === 404, r.json)

  section("Publish rules")
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}/publish`, { body: {} })
  check("incomplete post refused with what is missing", r.status === 400 && r.json.code === "incomplete" && /id: excerpt, body/.test(r.json.detail), r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post.id}/publish`, { body: { at: "not a date" } })
  check("invalid date refused", r.status === 400 && r.json.code === "invalid_date", r.json)
  hooks.length = 0
  r = await api("POST", `/admin/blog-seo/posts/${post.id}/publish`, { body: {} })
  check("publish now", r.status === 200 && r.json.post.status === "published" && typeof r.json.post.published_at === "string" && r.json.post.content_updated_at === r.json.post.published_at, r.json)
  const publishedAt = r.json.post.published_at
  let hook = await waitHook((h) => postsIn(h).some((p) => p.id === post.id))
  check("published → webhook with slugs per readable locale (id, and en/de by fallback) + category slugs", !!hook && postsIn(hook)[0].slugs.id === "merawat-talenan-jati" && postsIn(hook)[0].slugs.en === "merawat-talenan-jati" && postsIn(hook)[0].category_slugs.en === "care", hook)

  section("Store: fallback default")
  r = await api("GET", "/store/blog-seo/posts", { store: true })
  check("default locale list: featured separated, posts empty", r.json.locale === "id" && r.json.featured?.id === post.id && r.json.count === 0, r.json)
  r = await api("GET", "/store/blog-seo/posts?featured=none&locale=id", { store: true })
  check("featured=none: the post is in the list, card shape", r.json.count === 1 && r.json.posts[0].slug === "merawat-talenan-jati" && r.json.posts[0].category?.slug === "perawatan" && r.json.posts[0].author?.name === "Anto Rahman" && r.json.posts[0].author.job_title === "Pendiri" && r.json.posts[0].reading_minutes >= 2 && r.json.posts[0].translated === true, r.json)
  r = await api("GET", "/store/blog-seo/posts?featured=none&locale=en", { store: true })
  check("en (no translation, fallback default): the id text, translated=false, category/author in en", r.json.locale === "en" && r.json.posts[0]?.locale === "id" && r.json.posts[0].translated === false && r.json.posts[0].category.slug === "care" && r.json.posts[0].author.job_title === "Founder", r.json)
  r = await api("GET", "/store/blog-seo/posts?featured=none", { store: true, headers: { "x-medusa-locale": "de" } })
  check("x-medusa-locale header honoured (de → fallback)", r.json.locale === "de" && r.json.posts[0]?.translated === false, r.json)
  r = await api("GET", "/store/blog-seo/posts?featured=none&locale=pt-BR", { store: true })
  check("unknown locale → default", r.json.locale === "id", r.json)
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=id", { store: true })
  check("article: seo fields, body_html, blocks, toc, faq from h3, words, product_ids, alternates", r.status === 200 && r.json.post.seo_title === "Merawat Talenan Jati" && r.json.post.faq.length === 2 && /merawatnya/.test(r.json.post.faq[0].q) && r.json.post.toc.length >= 1 && r.json.post.blocks.some((b) => b.type === "image") && r.json.post.words > 300 && r.json.post.product_ids.length === 2 && r.json.post.alternates.id === "merawat-talenan-jati" && r.json.post.dir === "ltr", r.json.post && { ...r.json.post, body_html: "…", blocks: "…", text: "…" })
  check("more: other readable posts (none yet)", Array.isArray(r.json.more) && r.json.more.length === 0, r.json.more)
  r = await api("GET", "/store/blog-seo/posts?category=care&locale=en&featured=none", { store: true })
  check("category filter by the en slug", r.json.count === 1 && r.json.category?.slug === "care", r.json)
  r = await api("GET", "/store/blog-seo/posts?category=perawatan&locale=en&featured=none", { store: true })
  check("category filter by another locale's slug still resolves (en slug 'perawatan' = Stories, 0 posts)", r.json.count === 0 && r.json.category?.id === category2.id, r.json)
  r = await api("GET", "/store/blog-seo/posts?author=anto-rahman&tag=talenan&featured=none", { store: true })
  check("author + tag filter", r.json.count === 1, r.json)
  r = await api("GET", "/store/blog-seo/posts?author=nobody", { store: true })
  check("unknown author → 404", r.status === 404, r.json)
  r = await api("GET", "/store/blog-seo/categories?locale=en", { store: true })
  check("store categories in en with counts, by rank", r.json.categories.map((c) => `${c.slug}:${c.post_count}`).join() === "perawatan:0,care:1", r.json)
  r = await api("GET", "/store/blog-seo/authors?locale=en", { store: true })
  check("store authors: only with readable posts", r.json.authors.length === 1 && r.json.authors[0].slug === "anto-rahman" && r.json.authors[0].post_count === 1, r.json)
  r = await api("GET", "/store/blog-seo/authors/anto-rahman-2", { store: true })
  check("author page by slug", r.status === 200 && r.json.author.type === "organization" && r.json.author.post_count === 0, r.json)
  r = await api("GET", "/store/blog-seo/posts?view=index", { store: true })
  check("index view: one row, locales id/en/de (fallback), images from the body", r.json.posts.length === 1 && Object.keys(r.json.posts[0].locales).join() === "id,en,de" && r.json.posts[0].locales.en.translated === false && r.json.posts[0].images.length === 1, r.json)

  section("Store: fallback hide / label")
  await api("POST", "/admin/blog-seo/settings", { body: { fallback: "hide" } })
  r = await api("GET", "/store/blog-seo/posts?featured=none&locale=en", { store: true })
  check("hide: untranslated post is not listed in en", r.json.count === 0, r.json)
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=en", { store: true })
  check("hide: not readable by slug in en", r.status === 404, r.json)
  r = await api("GET", "/store/blog-seo/posts?view=index", { store: true })
  check("hide: index row only has id", Object.keys(r.json.posts[0].locales).join() === "id", r.json)
  r = await api("GET", "/store/blog-seo/categories?locale=en", { store: true })
  check("hide: category counts follow the locale", r.json.categories.find((c) => c.slug === "care").post_count === 0, r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { translations: { en: { title: "Caring for a Teak Cutting Board", excerpt: "How to keep a teak board for decades.", body: "<h2>Why teak</h2><p>Teak is dense and oily.</p><h3>How do I clean it?</h3><p>Hand wash, dry upright.</p>", seo_title: "Teak Board Care Guide" } } } })
  check("en translation added to a published post (own slug)", r.status === 200 && r.json.post.translations.en.slug === "caring-for-a-teak-cutting-board" && r.json.post.completeness.locales.find((l) => l.locale === "en").missing.length === 0, r.json)
  hook = await waitHook((h) => postsIn(h).some((p) => p.id === post.id && p.slugs.en === "caring-for-a-teak-cutting-board"))
  check("public change → webhook (updated) with the new en slug", !!hook, hooks.slice(-2))
  r = await api("GET", "/store/blog-seo/posts/caring-for-a-teak-cutting-board?locale=en", { store: true })
  check("en article by its own slug: translated, seo_title, alternates id+en", r.status === 200 && r.json.post.translated === true && r.json.post.seo_title === "Teak Board Care Guide" && r.json.post.alternates.id === "merawat-talenan-jati" && r.json.post.alternates.en === "caring-for-a-teak-cutting-board" && !("de" in r.json.post.alternates), r.json.post?.alternates)
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=en", { store: true })
  check("fallback → own translation: the old (default) slug in en answers a 301 to the en slug", r.status === 200 && r.json.post === null && r.json.redirect === "caring-for-a-teak-cutting-board" && r.json.status === 301 && r.json.locale === "en", r.json)
  r = await api("GET", "/store/blog-seo/posts/caring-for-a-teak-cutting-board?locale=id", { store: true })
  check("the en slug in id → 301 to the id slug", r.json.redirect === "merawat-talenan-jati", r.json)
  r = await api("GET", "/store/blog-seo/posts/caring-for-a-teak-cutting-board?locale=de", { store: true })
  check("hide: de still hidden", r.status === 404, r.json)
  await api("POST", "/admin/blog-seo/settings", { body: { fallback: "label" } })
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=de", { store: true })
  check("label: de gets the default text, translated=false, locale id", r.status === 200 && r.json.post.translated === false && r.json.post.locale === "id", r.json.post && { translated: r.json.post.translated, locale: r.json.post.locale })
  r = await api("GET", "/store/blog-seo/posts/caring-for-a-teak-cutting-board?locale=de", { store: true })
  check("label: the en slug in de → 301 to the slug de shows (id's)", r.json.redirect === "merawat-talenan-jati", r.json)
  await api("POST", "/admin/blog-seo/settings", { body: { fallback: "hide" } })
  r = await api("GET", "/store/blog-seo/posts/caring-for-a-teak-cutting-board?locale=de", { store: true })
  check("hide: nothing to redirect to in de → 404", r.status === 404, r.json)
  await api("POST", "/admin/blog-seo/settings", { body: { fallback: "default" } })

  section("Editing a public post: content_updated_at, slug change, featured, incompleteness guard")
  await sleep(1100)
  r = await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { metadata: { note: "x" } } })
  check("public field change moves content_updated_at, not published_at", r.json.post.published_at === publishedAt && r.json.post.content_updated_at > publishedAt, r.json.post)
  const updatedAt = r.json.post.content_updated_at
  r = await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { metadata: { note: "x" } } })
  check("no change → content_updated_at unchanged", r.json.post.content_updated_at === updatedAt, r.json.post)
  hooks.length = 0
  r = await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { translations: { id: { slug: "talenan-jati-perawatan" } } } })
  check("slug of a public post changed", r.json.post.translations.id.slug === "talenan-jati-perawatan", r.json)
  hook = await waitHook((h) => postsIn(h).some((p) => p.id === post.id))
  check("webhook carries previous_slugs for redirects", postsIn(hook)[0]?.previous_slugs?.id === "merawat-talenan-jati" && postsIn(hook)[0].slugs.id === "talenan-jati-perawatan", hook)
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=id", { store: true })
  check("edited slug: the old slug → 301 to the new one", r.json.redirect === "talenan-jati-perawatan" && r.json.status === 301, r.json)
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=en", { store: true })
  check("the old id slug asked in en → 301 to the en slug (no chain)", r.json.redirect === "caring-for-a-teak-cutting-board", r.json)
  await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { translations: { id: { slug: "talenan-jati-cara-merawat" } } } })
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=id", { store: true })
  check("two edits: the first slug → 301 straight to the newest (no chain)", r.json.redirect === "talenan-jati-cara-merawat", r.json)
  r = await api("GET", "/store/blog-seo/posts/talenan-jati-perawatan?locale=id", { store: true })
  check("…and the middle slug too", r.json.redirect === "talenan-jati-cara-merawat", r.json)
  await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { translations: { id: { slug: "talenan-jati-perawatan" } } } })
  r = await api("GET", "/store/blog-seo/posts/talenan-jati-perawatan?locale=id", { store: true })
  check("slug changed back: it is live again (200, no loop)", r.status === 200 && r.json.post?.slug === "talenan-jati-perawatan", r.json.redirect ?? r.status)
  r = await api("GET", "/store/blog-seo/posts/talenan-jati-cara-merawat?locale=id", { store: true })
  check("the slug it just left → 301 to the live one", r.json.redirect === "talenan-jati-perawatan", r.json)
  r = await api("POST", "/admin/blog-seo/posts", { body: { translations: { id: { title: "Reuse", slug: "merawat-talenan-jati", excerpt: "x", body: "<p>Slug lama dipakai post lain.</p>" } } } })
  const reuser = r.json.post
  await api("POST", `/admin/blog-seo/posts/${reuser.id}/publish`, { body: {} })
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=id", { store: true })
  check("a former slug taken by another post: the live post wins", r.status === 200 && r.json.post?.id === reuser.id, r.json)
  await api("DELETE", `/admin/blog-seo/posts/${reuser.id}`)
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati?locale=id", { store: true })
  check("…and after its deletion the history redirect is back", r.json.redirect === "talenan-jati-perawatan", r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { translations: { id: { body: "" } } } })
  check("emptying the default body of a public post is refused (incomplete)", r.status === 400 && r.json.code === "incomplete", r.json)
  r = await api("GET", `/admin/blog-seo/posts/${post.id}`)
  check("…and nothing was written", r.json.post.translations.id.body.length > 100 && r.json.post.status === "published", r.json.post.translations.id.body.length)
  r = await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { product_ids: [store.product2.id] } })
  check("product links re-synced", r.json.post.product_ids.join() === store.product2.id, r.json.post.product_ids)
  r = await api("GET", `/admin/products/${store.product.id}?fields=id,*bseo_posts`)
  check("removed product no longer linked", (r.json.product?.bseo_posts ?? []).length === 0, r.json.product)

  section("Schedule + job")
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}`, { body: { translations: { id: { excerpt: "Tray jati untuk meja makan.", body: "<p>Tray jati buatan tangan dari Jepara, finishing minyak.</p>" } }, featured: true } })
  check("post2 completed in id, featured", r.json.post.completeness.publishable === true && r.json.post.featured === true, r.json.post.completeness)
  const inOneHour = new Date(Date.now() + 3600_000).toISOString()
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}/publish`, { body: { at: inOneHour } })
  check("scheduled for later", r.json.post.status === "scheduled" && r.json.post.published_at === inOneHour, r.json.post)
  r = await api("GET", "/store/blog-seo/posts?featured=none", { store: true })
  check("scheduled post not public", r.json.count === 1, r.json)
  r = await runJob("publish")
  check("job: nothing due", r.json.summary.published.length === 0, r.json)
  r = await runJob("publish", { now: new Date(Date.now() + 7200_000).toISOString() })
  check("job with a later clock publishes it", r.json.summary.published.join() === post2.id, r.json)
  hook = await waitHook((h) => postsIn(h).some((p) => p.id === post2.id))
  check("job publish → webhook", !!hook, hooks.slice(-2))
  r = await api("GET", "/store/blog-seo/posts", { store: true })
  check("still not public: its date is in the future (featured = the other post)", r.json.featured?.id === post.id && r.json.count === 0, r.json)
  psql(`UPDATE bseo_post SET published_at = now() - interval '1 minute' WHERE id = '${post2.id}'`, DB_NAME)
  r = await api("GET", "/store/blog-seo/posts", { store: true })
  check("date passed: featured flag wins, the other post listed", r.json.featured?.id === post2.id && r.json.count === 1, r.json)
  r = await api("GET", "/store/blog-seo/posts/talenan-jati-perawatan", { store: true })
  check("more: the other post", r.json.more?.length === 1 && r.json.more[0].id === post2.id, r.json.more)
  r = await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { featured: true } })
  r = await api("GET", `/admin/blog-seo/posts/${post2.id}`)
  check("one featured post at a time", r.json.post.featured === false, r.json.post)

  section("Scheduling an incomplete post, job skips it")
  r = await api("POST", "/admin/blog-seo/posts", { body: { translations: { id: { title: "Mangkuk", excerpt: "x", body: "<p>Mangkuk jati.</p>" } } } })
  const post3 = r.json.post
  r = await api("POST", `/admin/blog-seo/posts/${post3.id}/publish`, { body: { at: inOneHour } })
  check("post3 scheduled", r.json.post.status === "scheduled", r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post3.id}`, { body: { translations: { id: { body: "" } } } })
  check("a scheduled post cannot be made incomplete", r.status === 400 && r.json.code === "incomplete", r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post3.id}/unpublish`)
  check("back to draft", r.json.post.status === "draft", r.json)
  await api("POST", `/admin/blog-seo/posts/${post3.id}`, { body: { translations: { id: { body: "" } } } })
  psql(`UPDATE bseo_post SET status = 'scheduled', published_at = now() - interval '1 minute' WHERE id = '${post3.id}'`, DB_NAME)
  r = await runJob("publish")
  check("job reports the incomplete scheduled post and leaves it", r.json.summary.incomplete.join() === post3.id && r.json.summary.published.length === 0, r.json)

  section("Preview")
  r = await api("GET", `/admin/blog-seo/posts/${post3.id}`)
  const token = r.json.post.preview_token
  await api("POST", `/admin/blog-seo/posts/${post3.id}`, { body: { translations: { id: { body: "<p>Draft mangkuk.</p>" }, de: { title: "Schüssel (Entwurf)" } } } })
  r = await api("GET", `/store/blog-seo/preview/${token}?locale=id`, { store: true })
  check("preview by token shows a non-public post, no-store", r.status === 200 && r.json.post.id === post3.id && r.json.post.preview === true && r.headers.get("cache-control") === "no-store", r.json)
  r = await api("GET", `/store/blog-seo/preview/${token}?locale=de`, { store: true })
  check("preview in de shows the incomplete de draft (complete=false)", r.status === 200 && r.json.post.title === "Schüssel (Entwurf)" && r.json.post.complete === false && r.json.post.locale === "de", r.json.post && { title: r.json.post.title, complete: r.json.post.complete, locale: r.json.post.locale })
  r = await api("GET", `/store/blog-seo/preview/${token}?locale=en`, { store: true })
  check("preview in en (nothing written) shows the default text", r.status === 200 && r.json.post.locale === "id" && r.json.post.translated === false, r.json.post && { locale: r.json.post.locale })
  r = await api("GET", `/store/blog-seo/preview/${token.slice(0, -1)}${token.endsWith("x") ? "y" : "x"}`, { store: true })
  check("wrong token → 404", r.status === 404, r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post3.id}/preview-token`)
  check("token rotated", r.json.post.preview_token && r.json.post.preview_token !== token, r.json)
  r = await api("GET", `/store/blog-seo/preview/${token}`, { store: true })
  check("old token → 404", r.status === 404, r.json)

  section("Admin list + filters")
  r = await api("GET", "/admin/blog-seo/posts")
  check("list: 3 posts, counts by status, no bodies", r.json.count === 3 && r.json.counts.published === 2 && r.json.counts.scheduled === 1 && r.json.posts.every((p) => !("body" in p.translations.id || p.translations.id.body)), { count: r.json.count, counts: r.json.counts })
  r = await api("GET", "/admin/blog-seo/posts?missing_locale=en")
  check("missing_locale=en: the two without an en translation", r.json.count === 2 && r.json.posts.every((p) => p.id !== post.id), r.json.posts?.map((p) => p.id))
  r = await api("GET", "/admin/blog-seo/posts?q=teak")
  check("q matches any locale's title", r.json.count === 1 && r.json.posts[0].id === post.id, r.json)
  r = await api("GET", `/admin/blog-seo/posts?category_id=${category.id}`)
  check("category filter", r.json.count === 1, r.json)
  r = await api("GET", "/admin/blog-seo/posts?status=scheduled&limit=1")
  check("status filter + limit", r.json.count === 1 && r.json.posts.length === 1 && r.json.posts[0].id === post3.id, r.json)

  section("Uploads")
  r = await api("POST", "/admin/blog-seo/uploads", { body: { filename: "Foto Talenan.PNG", data: `data:image/png;base64,${PNG_2x3.toString("base64")}`, kind: "cover" } })
  check(`data-URL upload stored via the File Module (${NO_SHARP ? "as is, size from the header" : "processed to JPEG"})`, r.status === 201 && new RegExp(`^${BASE}/static/(\\d+-)?blog-cover-foto-talenan\\.(jpg|png)$`).test(r.json.file.url) && r.json.file.width === 2 && r.json.file.height === 3 && r.json.file.processed === !NO_SHARP && (NO_SHARP ? r.json.file.mime_type === "image/png" : r.json.file.url.endsWith(".jpg")), r.json)
  const uploaded = r.json.file.url
  r = await fetch(uploaded)
  check("uploaded file is served", r.status === 200, r.status)
  r = await api("POST", "/admin/blog-seo/uploads", { raw: multipart([{ name: "a.png", type: "image/png", content: PNG }, { name: "b.png", type: "image/png", content: PNG }]) })
  check("multipart upload of two files", r.status === 201 && r.json.files.length === 2 && r.json.files[1].width === 1, r.json)
  r = await api("POST", "/admin/blog-seo/uploads", { body: { filename: "x.png", data: "data:image/png;base64,bm90IGFuIGltYWdl" } })
  check(NO_SHARP ? "garbage bytes accepted without sharp (size unknown)" : "garbage bytes refused by sharp", NO_SHARP ? r.status === 201 && r.json.file.width === null : r.status === 400, r.json)
  r = await api("POST", "/admin/blog-seo/uploads", { body: { filename: "x.txt", data: "hello" } })
  check("not an image → 400", r.status === 400, r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post.id}`, { body: { cover: uploaded, translations: { id: { body: `<p>Dengan foto</p><img src="${uploaded}" alt="foto"><img src="https://evil.example/x.jpg">` } } } })
  check("the upload origin is learned: uploaded image allowed as cover and in the body, foreign one still dropped", r.json.post.cover === uploaded && r.json.post.translations.id.body.includes(uploaded) && !r.json.post.translations.id.body.includes("evil"), r.json.post && { cover: r.json.post.cover, body: r.json.post.translations.id.body })
  r = await api("GET", "/admin/blog-seo/settings")
  check("learned origin listed in settings.image_origins", r.json.settings.image_origins.includes(`${BASE}/static`) && r.json.settings.image_origins.includes("https://cdn.e2e.test/media"), r.json.settings.image_origins)

  section("Unpublish, delete, categories/authors removal")
  hooks.length = 0
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}/unpublish`)
  check("unpublished → draft, published_at kept", r.json.post.status === "draft" && r.json.post.published_at, r.json.post)
  hook = await waitHook((h) => postsIn(h).some((p) => p.id === post2.id))
  check("unpublish → webhook", !!hook, hooks)
  r = await api("GET", "/store/blog-seo/posts/tray-jati-untuk-meja-makan", { store: true })
  check("unpublished post not readable", r.status === 404, r.json)
  r = await api("POST", `/admin/blog-seo/posts/${post2.id}/publish`, { body: {} })
  check("republish keeps the earlier date (no jump to the top)", r.json.post.status === "published" && new Date(r.json.post.published_at) < new Date(Date.now() - 30_000), r.json.post)
  hooks.length = 0
  r = await api("DELETE", `/admin/blog-seo/categories/${category.id}`)
  check("category deleted", r.json.deleted === true, r.json)
  r = await api("GET", `/admin/blog-seo/posts/${post.id}`)
  check("post kept without category", r.json.post.category_id === null, r.json.post)
  hook = await waitHook((h) => h.body?.blog_seo?.categories?.includes(category.id))
  check("category change → webhook (categories + all)", !!hook && hook.body.blog_seo.all === true, hooks)
  r = await api("DELETE", `/admin/blog-seo/authors/${author.id}`)
  r = await api("GET", "/store/blog-seo/posts/talenan-jati-perawatan", { store: true })
  check("author deleted: article without author", r.status === 200 && r.json.post.author === null, r.json.post?.author)
  r = await api("DELETE", `/admin/blog-seo/posts/${post.id}`)
  check("post deleted", r.json.deleted === true, r.json)
  hook = await waitHook((h) => postsIn(h).some((p) => p.id === post.id))
  check("delete → webhook", !!hook, hooks)
  r = await api("GET", "/store/blog-seo/posts/talenan-jati-perawatan", { store: true })
  check("deleted post gone", r.status === 404, r.json)
  r = await api("GET", "/store/blog-seo/posts/merawat-talenan-jati", { store: true })
  check("its slug history is gone with it (404, no redirect)", r.status === 404, r.json)
  r = await api("GET", `/admin/products/${store.product2.id}?fields=id,*bseo_posts`)
  check("product links removed with the post", (r.json.product?.bseo_posts ?? []).length === 0, r.json.product)
  r = await api("DELETE", `/admin/blog-seo/authors/${author2.id}`)
  r = await api("GET", "/admin/blog-seo/authors")
  check("authors empty", r.json.authors.length === 0, r.json)
}

async function main() {
  if (!fs.existsSync(path.join(PLUGIN_DIR, ".medusa/server/src/modules/blog-seo/index.js"))) {
    throw new Error("Build the plugin first: npm run build")
  }
  rmGuarded(STATE_DIR)
  fs.mkdirSync(STATE_DIR, { recursive: true })
  for (const d of ["private", "static"]) rmGuarded(path.join(APP_DIR, d))
  linkNodeModules()
  await waitForPostgres()
  psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`)
  psql(`CREATE DATABASE ${DB_NAME}`)
  guarded("db:migrate")
  guarded("user", "-e", ADMIN.email, "-p", ADMIN.password)

  let serverDir = APP_DIR
  if (process.env.BSEO_ADMIN === "1") {
    guarded("build")
    serverDir = path.join(APP_DIR, ".medusa/server")
    rmGuarded(path.join(serverDir, "node_modules"))
    fs.symlinkSync(path.join(APP_DIR, "node_modules"), path.join(serverDir, "node_modules"))
    fs.mkdirSync(path.join(APP_DIR, "static"), { recursive: true })
    if (!fs.existsSync(path.join(serverDir, "static"))) fs.symlinkSync(path.join(APP_DIR, "static"), path.join(serverDir, "static"))
  }
  const hookServer = await startHookServer()
  const log = fs.openSync(path.join(STATE_DIR, "server.log"), "w")
  const server = spawn("node", [GUARD, MEDUSA, "start"], { cwd: serverDir, env, stdio: ["ignore", log, log], detached: true })
  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`${BASE}/health`)).ok) break
      } catch {}
      if (i > 120) throw new Error("server did not start, see integration-tests/.state/server.log")
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (!SERVE) await checks()
    if (KEEP) {
      fs.writeFileSync(path.join(STATE_DIR, "server.pid"), String(server.pid))
      console.log(`\nserver kept running on ${BASE} (pid ${server.pid}); stop with: kill -- -${server.pid}`)
      if (!SERVE) console.log(`\n${passes} passed, ${failures} failed`)
      process.exit(failures ? 1 : 0)
    }
  } finally {
    try {
      process.kill(-server.pid, "SIGTERM")
    } catch {}
    hookServer.close()
  }
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
