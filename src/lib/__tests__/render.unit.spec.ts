import { bodyImages, hasContent, renderBody } from "../render"

describe("renderBody", () => {
  const html =
    "<p>Intro.</p><h2>Daily wash</h2><p>Wash by hand.</p>" +
    '<figure><img src="https://api.example.com/static/a.jpg" alt="Oil" width="1360" height="907" /><figcaption>Along the grain.</figcaption></figure>' +
    '<p>Next.</p><div data-product-id="prod_01JABCDEFGHJKMNPQRSTVWXYZ0" data-title="Board"></div>' +
    '<h2>Daily wash</h2><div data-youtube-id="dQw4w9WgXcQ"></div>' +
    "<h2>Questions</h2><h3>Dishwasher safe?</h3><p>No. <strong>Hand</strong> wash.</p>" +
    "<h3>How often to oil?</h3><p>Monthly.</p><ul><li>or when dry</li></ul><h3>Notes</h3><p>Done.</p>"
  const r = renderBody(html)

  it("splits the body into html runs and component blocks, in order", () => {
    expect(r.blocks.map((b) => b.type)).toEqual(["html", "image", "html", "product", "html", "youtube", "html", "faq", "html"])
    expect(r.blocks[1]).toEqual({ type: "image", src: "https://api.example.com/static/a.jpg", alt: "Oil", width: 1360, height: 907, caption: "Along the grain.", position: 1 })
    expect(r.blocks[3]).toEqual({ type: "product", id: "prod_01JABCDEFGHJKMNPQRSTVWXYZ0" })
    expect(r.blocks[5]).toEqual({ type: "youtube", id: "dQw4w9WgXcQ" })
  })
  it("gives every h2 a unique id and lists them as the table of contents", () => {
    expect(r.toc).toEqual([
      { id: "daily-wash", label: "Daily wash" },
      { id: "daily-wash-2", label: "Daily wash" },
      { id: "questions", label: "Questions" },
    ])
  })
  it("h3 ending with ? + the text below it = one Q&A item", () => {
    expect(r.faq).toEqual([
      { q: "Dishwasher safe?", a_html: "<p>No. <strong>Hand</strong> wash.</p>", a: "No. Hand wash." },
      { q: "How often to oil?", a_html: "<p>Monthly.</p><ul><li>or when dry</li></ul>", a: "Monthly. or when dry" },
    ])
    expect((r.blocks[8] as { html: string }).html).toBe("<h3>Notes</h3><p>Done.</p>")
  })
  it("faq_from_headings: false keeps questions as headings", () => {
    const x = renderBody(html, { faq_from_headings: false })
    expect(x.faq).toEqual([])
    expect(x.blocks.map((b) => b.type)).not.toContain("faq")
  })
  it("counts words and reading time (configurable speed, at least 1 minute)", () => {
    expect(r.reading_minutes).toBe(1)
    const long = renderBody(`<p>${"word ".repeat(900)}</p>`)
    expect(long.words).toBe(900)
    expect(long.reading_minutes).toBe(5)
    expect(renderBody(`<p>${"word ".repeat(900)}</p>`, { words_per_minute: 100 }).reading_minutes).toBe(9)
    expect(renderBody("").reading_minutes).toBe(1)
  })
  it("text: entities decoded; html: entities encoded again", () => {
    const x = renderBody("<h2>Smell &amp; stains</h2><p>a &lt; b</p><h3>Safe &amp; sound?</h3><p>Yes &amp; no.</p>")
    expect(x.text).toBe("Smell & stains a < b Safe & sound? Yes & no.")
    expect((x.blocks[0] as { html: string }).html).toBe('<h2 id="smell-stains">Smell &amp; stains</h2><p>a &lt; b</p>')
  })
  it("tables are wrapped with the configurable class", () => {
    const t = "<table><tbody><tr><td>1</td></tr></tbody></table>"
    expect((renderBody(`<p>x</p>${t}`, { table_class: "scroll" }).blocks[0] as { html: string }).html).toBe(`<p>x</p><div class="scroll">${t}</div>`)
  })
  it("hasContent / bodyImages", () => {
    expect(hasContent("<p>a</p>")).toBe(true)
    expect(hasContent("<p> </p>")).toBe(false)
    expect(hasContent(null)).toBe(false)
    expect(hasContent('<div data-product-id="prod_01JABCDEFGHJKMNPQRSTVWXYZ0"></div>')).toBe(true)
    expect(bodyImages(html)).toEqual([{ src: "https://api.example.com/static/a.jpg", alt: "Oil", position: 1 }])
  })
})
