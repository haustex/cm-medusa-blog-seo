import { ownImage, sanitizeBody } from "../sanitize"
import { plainLine } from "../text"

const opts = { imageOrigins: ["https://api.example.com/static", "https://media.example.com"], siteHosts: ["example.com"] }
const clean = (html: string) => sanitizeBody(html, opts)

describe("sanitizeBody", () => {
  it("removes scripts with their content, in every spelling", () => {
    for (const bad of [
      "<p>a</p><script>alert(1)</script>",
      '<p>a</p><SCRIPT SRC="https://evil.example/x.js"></SCRIPT>',
      "<p>a</p><scr<script>ipt>alert(1)</scr</script>ipt>",
      '<p>a</p><svg onload="alert(1)"><script>alert(1)</script></svg>',
      '<p>a</p><iframe src="javascript:alert(1)"></iframe>',
      "<p>a</p><style>p{background:url(javascript:alert(1))}</style>",
      '<p>a</p><object data="x"></object><embed src="x">',
      "<math><mtext><script>alert(1)</script></mtext></math><p>a</p>",
    ]) {
      const out = clean(bad)
      expect(out).not.toMatch(/<\s*script|<\s*iframe|<\s*style|<\s*svg|<\s*object|<\s*embed|<\s*math/i)
      expect(out).not.toMatch(/alert\(1\)<\/script>/i)
      expect(out).toContain("<p>a</p>")
    }
  })
  it("removes event handlers, inline styles, classes and ids", () => {
    expect(clean('<p onclick="alert(1)" style="color:red" class="x" id="y">text <strong onmouseover="x()">bold</strong></p>')).toBe("<p>text <strong>bold</strong></p>")
  })
  it("drops javascript:, data: and vbscript: links but keeps the text", () => {
    expect(clean('<p><a href="javascript:alert(1)">x</a></p>')).toBe("<p>x</p>")
    expect(clean('<p><a href="JaVaScRiPt:alert(1)">x</a></p>')).toBe("<p>x</p>")
    expect(clean('<p><a href="data:text/html,<script>alert(1)</script>">x</a></p>')).toBe("<p>x</p>")
    expect(clean('<p><a href="//evil.example">x</a></p>')).toBe("<p>x</p>")
  })
  it("external links open in a new tab with noopener; internal links stay plain", () => {
    expect(clean('<p><a href="https://other.example/a" target="_self" rel="opener">x</a></p>')).toBe('<p><a href="https://other.example/a" target="_blank" rel="noopener noreferrer">x</a></p>')
    expect(clean('<p><a href="https://www.example.com/products/board" target="_blank">x</a></p>')).toBe('<p><a href="https://www.example.com/products/board">x</a></p>')
    expect(clean('<p><a href="/blog">x</a></p>')).toBe('<p><a href="/blog">x</a></p>')
    expect(clean('<p><a href="mailto:hi@example.com">x</a></p>')).toBe('<p><a href="mailto:hi@example.com">x</a></p>')
  })
  it("keeps what the editor produces", () => {
    const html = "<h2>Title</h2><p>Text <em>em</em> <u>u</u> <s>s</s> <code>code</code><br>line</p><ul><li>one</li></ul><ol><li>two</li></ol><blockquote><p>Quote</p></blockquote><hr><h3>Sub</h3>"
    expect(clean(html)).toBe(html.replace("<hr>", "<hr />").replace("<br>", "<br />"))
  })
  it("tables: rows, header cells, merged cells; widths, styles and colgroup dropped", () => {
    const html = '<table style="width:100%"><colgroup><col style="width:120px"></colgroup><tbody><tr><th colspan="2" colwidth="120">Size</th><th>Price</th></tr><tr><td><p>30 cm</p></td><td rowspan="2">x</td><td style="color:red" class="a">$20</td></tr></tbody></table>'
    expect(clean(html)).toBe('<table><tbody><tr><th colspan="2">Size</th><th>Price</th></tr><tr><td><p>30 cm</p></td><td rowspan="2">x</td><td>$20</td></tr></tbody></table>')
  })
  it("turns h1 into h2 and deeper headings into h3", () => {
    expect(clean("<h1>A</h1><h4>B</h4><h6>C</h6>")).toBe("<h2>A</h2><h3>B</h3><h3>C</h3>")
  })
  it("keeps only images under an allowed origin, with whole-number sizes", () => {
    const ok = '<figure><img src="https://api.example.com/static/foto-1.jpg" alt="Board" width="1600" height="1067"><figcaption>Cap</figcaption></figure>'
    expect(clean(ok)).toBe('<figure><img src="https://api.example.com/static/foto-1.jpg" alt="Board" width="1600" height="1067" /><figcaption>Cap</figcaption></figure>')
    expect(clean('<p>a</p><img src="https://media.example.com/x.webp" alt="m">')).toBe('<p>a</p><img src="https://media.example.com/x.webp" alt="m" />')
    expect(clean('<p>a</p><img src="https://evil.example/pixel.gif">')).toBe("<p>a</p>")
    expect(clean('<p>a</p><figure><img src="https://evil.example/x.jpg"><figcaption>Cap</figcaption></figure>')).toBe("<p>a</p>")
    expect(clean('<p>a</p><img src="https://api.example.com/static/../../etc/passwd">')).toBe("<p>a</p>")
    expect(clean('<p>a</p><img src="https://api.example.com/admin/uploads/x.jpg">')).toBe("<p>a</p>")
    expect(clean('<p>a</p><img src="x" onerror="alert(1)">')).toBe("<p>a</p>")
    expect(clean('<img src="https://api.example.com/static/a.jpg" width="100%" height="auto">')).toBe('<img src="https://api.example.com/static/a.jpg" alt="" />')
  })
  it("keeps product and YouTube boxes only with valid ids, and empties them", () => {
    expect(clean('<div data-product-id="prod_01JABCDEFGHJKMNPQRSTVWXYZ0" data-title="Board">x <script>x</script></div>')).toBe('<div data-product-id="prod_01JABCDEFGHJKMNPQRSTVWXYZ0" data-title="Board"></div>')
    expect(clean('<div data-youtube-id="dQw4w9WgXcQ"></div>')).toBe('<div data-youtube-id="dQw4w9WgXcQ"></div>')
    expect(clean('<p>a</p><div data-youtube-id="x\\" onload=\\"alert(1)"></div>')).toBe("<p>a</p>")
    expect(clean('<p>a</p><div data-product-id="1; DROP TABLE"></div>')).toBe("<p>a</p>")
  })
  it("answers an empty string for nothing and is stable", () => {
    expect(clean("")).toBe("")
    expect(sanitizeBody(null, opts)).toBe("")
    expect(clean("<p></p><p> </p>")).toBe("")
    const once = clean('<h1>A</h1><p><a href="https://other.example">x</a> &amp; <b>y</b></p><div data-youtube-id="dQw4w9WgXcQ">z</div>')
    expect(clean(once)).toBe(once)
  })
})

describe("plainLine / ownImage", () => {
  it("strips tags and collapses whitespace", () => {
    expect(plainLine("  <b>How</b>\n to <script>alert(1)</script> care & keep ", 100)).toBe("How to care & keep")
    expect(plainLine("a".repeat(50), 10)).toBe("a".repeat(10))
    expect(plainLine(undefined, 10)).toBe("")
  })
  it("accepts only plain file names directly under a known origin", () => {
    expect(ownImage("https://api.example.com/static/a-1.jpg", ["https://api.example.com/static/"])).toBe("https://api.example.com/static/a-1.jpg")
    expect(ownImage("https://api.example.com.evil.example/static/a.jpg", ["https://api.example.com/static"])).toBeNull()
    expect(ownImage("https://api.example.com/static/a/b.jpg", ["https://api.example.com/static"])).toBeNull()
    expect(ownImage("https://api.example.com/static/.env", ["https://api.example.com/static"])).toBeNull()
    expect(ownImage(null, ["https://api.example.com/static"])).toBeNull()
  })
})
