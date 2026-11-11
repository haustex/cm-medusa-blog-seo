// Browser check of the Admin UI against a kept test app (BSEO_ADMIN=1 BSEO_SERVE=1 node integration-tests/e2e.mjs
// + node integration-tests/seed-demo.mjs). Needs puppeteer with a working Chrome: PUPPETEER_DIR points at a folder
// whose node_modules has it (not a dependency of the plugin; not run in CI). Talks only to 127.0.0.1:9700.
//
//   PUPPETEER_DIR=/path/with/puppeteer node integration-tests/admin-browser.mjs
//
// Checks: missing-translation badges and filter, side-by-side view, draft autosave, unsaved indicator and
// leave confirmation on a published post, slug change confirmation → 301 through the Store API. Seed data is
// restored afterwards (titles and slugs put back).
import { createRequire } from "node:module"
import path from "node:path"

const DIR = process.env.PUPPETEER_DIR
if (!DIR) {
  console.error("PUPPETEER_DIR is required")
  process.exit(1)
}
const puppeteer = createRequire(path.join(DIR, "package.json"))("puppeteer")
const BASE = process.env.BSEO_BASE || "http://127.0.0.1:9700"
const ADMIN = { email: "admin@e2e.test", password: "e2e-password-123" }
let passes = 0
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : `\n     ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  ok ? passes++ : failures++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let token = ""
async function api(method, url, body, headers = {}) {
  const res = await fetch(BASE + url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, json: await res.json().catch(() => null) }
}

async function main() {
  token = (await api("POST", "/auth/user/emailpass", ADMIN)).json.token
  const { posts } = (await api("GET", "/admin/blog-seo/posts")).json
  const draft = posts.find((p) => p.status === "draft" && !p.translations.en)
  const published = posts.find((p) => p.status === "published")
  if (!draft || !published) throw new Error("seed the app first (seed-demo.mjs): needs an id-only draft and a published post")
  const pk = (await api("POST", "/admin/api-keys", { title: "browser-check", type: "publishable" })).json.api_key.token
  const store = (url) => api("GET", url, undefined, { "x-publishable-api-key": pk })

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 900 })
  page.setDefaultTimeout(20_000)
  page.on("dialog", (d) => d.accept()) // beforeunload prompts while reloading with unsaved changes
  const savedState = () => page.waitForFunction(() => /·\s*(saved|tersimpan)\s*$/i.test(document.querySelector('[data-bseo="save-state"]')?.textContent ?? ""), { timeout: 10_000 }).then(() => true, () => false)
  const text = async (sel) => page.$eval(sel, (el) => el.textContent ?? "").catch(() => null)
  /** Replace an input's text (select all with the keyboard: a triple click does not select in headless Chrome) */
  const retype = async (sel, value) => {
    await page.focus(sel)
    await page.keyboard.down("Control")
    await page.keyboard.press("a")
    await page.keyboard.up("Control")
    await page.keyboard.press("Backspace")
    await page.type(sel, value)
  }
  const dialog = async () => {
    await page.waitForSelector('[role="alertdialog"], [role="dialog"]', { visible: true })
    return page.$eval('[role="alertdialog"], [role="dialog"]', (el) => el.textContent ?? "")
  }
  const clickDialogButton = async (re) => {
    const handles = await page.$$('[role="alertdialog"] button, [role="dialog"] button')
    for (const h of handles) if (re.test(await h.evaluate((b) => b.textContent ?? ""))) return h.click()
    throw new Error(`no dialog button matching ${re}`)
  }
  try {
    // login
    await page.goto(`${BASE}/app/login`, { waitUntil: "networkidle0" })
    await page.type('input[name="email"]', ADMIN.email)
    await page.type('input[name="password"]', ADMIN.password)
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')])
    check("login", !page.url().includes("/login"), page.url())

    // list: badges + filter
    await page.goto(`${BASE}/app/blog-seo`, { waitUntil: "networkidle0" })
    await page.waitForSelector('[data-bseo="post-row"]')
    const draftRow = `[data-bseo="post-row"][data-post-id="${draft.id}"]`
    check("list: id-only draft shows EN as missing", !!(await page.$(`${draftRow} [data-bseo="locale-en-missing"]`)), await text(draftRow))
    check("list: published post shows ID and EN complete", !!(await page.$(`[data-post-id="${published.id}"] [data-bseo="locale-en-complete"]`)) && !!(await page.$(`[data-post-id="${published.id}"] [data-bseo="locale-id-complete"]`)))
    await page.goto(`${BASE}/app/blog-seo?missing=en`, { waitUntil: "networkidle0" })
    await page.waitForSelector('[data-bseo="post-row"]')
    const ids = await page.$$eval('[data-bseo="post-row"]', (els) => els.map((e) => e.getAttribute("data-post-id")))
    check("list: filter 'missing in English' lists only the id-only draft", ids.length === 1 && ids[0] === draft.id, ids)

    // editor: tabs + side by side
    await page.goto(`${BASE}/app/blog-seo/${draft.id}`, { waitUntil: "networkidle0" })
    await page.waitForSelector('[data-bseo="tab-en"]')
    check("editor: EN tab says missing", /missing|belum ada/i.test((await text('[data-bseo="tab-en"]')) ?? ""), await text('[data-bseo="tab-en"]'))
    check("editor: ID tab says complete", /complete|lengkap/i.test((await text('[data-bseo="tab-id"]')) ?? ""), await text('[data-bseo="tab-id"]'))
    await page.click('[data-bseo="split"]')
    await page.waitForSelector('[data-bseo="split-on"]')
    const ro = await page.$('[data-bseo="readonly-id"]')
    const ed = await page.$('[data-bseo="editor-en"]')
    const rb = ro && (await ro.boundingBox())
    const eb = ed && (await ed.boundingBox())
    check("editor: side by side = default (ID, read-only) left + EN editor right, two columns", !!rb && !!eb && rb.x + rb.width <= eb.x + 1 && Math.abs(rb.y - eb.y) < 40, { rb, eb })
    check("editor: read-only panel shows the ID title", ((await text('[data-bseo="readonly-id"]')) ?? "").includes(draft.translations.id.title))
    await page.click('[data-bseo="split"]')
    await page.waitForSelector('[data-bseo="split-off"]')

    // autosave on the draft
    await page.click('[data-bseo="tab-id"]')
    await page.waitForSelector('[data-bseo="title-id"]')
    const newTitle = `${draft.translations.id.title} (autosave)`
    await retype('[data-bseo="title-id"]', newTitle)
    const autosaved = await savedState()
    const saved = (await api("GET", `/admin/blog-seo/posts/${draft.id}`)).json.post
    check("draft: autosave wrote the new title within a few seconds", autosaved && saved.translations.id.title === newTitle, { state: await text('[data-bseo="save-state"]'), title: saved.translations.id.title })
    await page.reload({ waitUntil: "networkidle0" })
    await page.waitForSelector('[data-bseo="title-id"]')
    check("draft: title persists after reload", (await page.$eval('[data-bseo="title-id"]', (el) => el.value)) === newTitle)

    // published post: unsaved indicator, leave confirmation, slug change confirmation
    await page.goto(`${BASE}/app/blog-seo/${published.id}`, { waitUntil: "networkidle0" })
    await page.waitForSelector('[data-bseo="title-id"]')
    check("published: no unsaved badge before editing", !(await page.$('[data-bseo="unsaved"]')))
    await page.type('[data-bseo="title-id"]', " x")
    await page.waitForSelector('[data-bseo="unsaved"]', { visible: true })
    check("published: unsaved badge appears after a change", true)
    await page.click('a[href$="/blog-seo"]')
    const leave = await dialog()
    check("published: leaving with unsaved changes asks first", /unsaved|belum tersimpan/i.test(leave), leave)
    await clickDialogButton(/cancel|batal/i)
    await sleep(300)
    check("published: cancel keeps the editor open", page.url().includes(`/blog-seo/${published.id}`), page.url())
    await page.reload({ waitUntil: "networkidle0" }) // discard the title change
    await page.waitForSelector('[data-bseo="slug-id"]')
    const oldSlug = published.translations.id.slug
    const newSlug = `${oldSlug}-baru`
    await retype('[data-bseo="slug-id"]', newSlug)
    const slugBox = await (await page.$('[data-bseo="slug-id"]')).boundingBox()
    check("slug input is wide (≥ 400 px)", slugBox.width >= 400, slugBox)
    await page.click('[data-bseo="save"]')
    const ask = await dialog()
    check("published: saving a slug change asks, naming old → new address", ask.includes(`/blog/${oldSlug}`) && ask.includes(`/blog/${newSlug}`) && /301/.test(ask), ask)
    await clickDialogButton(/^\s*(save|simpan)\s*$/i)
    await savedState()
    const after = (await api("GET", `/admin/blog-seo/posts/${published.id}`)).json.post
    check("published: slug saved", after.translations.id.slug === newSlug, after.translations.id.slug)
    const r = await store(`/store/blog-seo/posts/${oldSlug}?locale=id`)
    check("store: old slug answers redirect 301 to the new slug", r.status === 200 && r.json?.redirect === newSlug && r.json?.status === 301, r.json)
  } finally {
    await browser.close()
    // put the seed back
    await api("POST", `/admin/blog-seo/posts/${draft.id}`, { translations: { id: { title: draft.translations.id.title } } })
    await api("POST", `/admin/blog-seo/posts/${published.id}`, { translations: { id: { slug: published.translations.id.slug } } })
    const keys = (await api("GET", "/admin/api-keys?title=browser-check")).json?.api_keys ?? []
    for (const k of keys) await api("DELETE", `/admin/api-keys/${k.id}`)
  }
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
