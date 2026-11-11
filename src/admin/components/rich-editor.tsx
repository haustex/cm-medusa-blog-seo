import { Button, Input, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import Placeholder from "@tiptap/extension-placeholder"
import { EditorContent, mergeAttributes, Node, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type ReactNodeViewProps } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { TableKit } from "@tiptap/extension-table"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { KEY, productsById, uploadImage, youtubeId, type ProductLite } from "../lib/api"
import { ProductPicker, ProductThumb } from "./product-picker"

/**
 * Article text editor (Tiptap). What it can write is exactly what the server's sanitizer keeps:
 *   h2, h3, p, lists, blockquote, links, bold/italic/underline/strike, hr, tables
 *   <figure><img src width height alt><figcaption>…</figcaption></figure>   photo uploaded through /admin/blog-seo/uploads
 *   <div data-product-id="prod_…" data-title="…"></div>                      product card, picked from the catalogue
 *   <div data-youtube-id="…"></div>                                          YouTube video
 * A small heading (H3) that ends with "?" plus the text under it becomes a Q&A block (FAQPage) on the storefront.
 */
const attr = (parse: (el: HTMLElement) => unknown, fallback: unknown = null) => ({ default: fallback, rendered: false, parseHTML: parse })

const FigureView = ({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) => {
  const { t } = useTranslation()
  const { src, width, height, alt, caption } = node.attrs as { src: string; width: number | null; height: number | null; alt: string; caption: string }
  return (
    <NodeViewWrapper className={`bseo-embed ${selected ? "bseo-embed-selected" : ""}`} data-drag-handle>
      <img src={src} alt="" width={width ?? undefined} height={height ?? undefined} draggable={false} />
      <div className="bseo-embed-fields">
        <label>
          <span>{t("blogSeo.editor.alt")}</span>
          <input value={alt ?? ""} maxLength={300} onChange={(e) => updateAttributes({ alt: e.target.value })} />
        </label>
        <label>
          <span>{t("blogSeo.editor.caption")}</span>
          <input value={caption ?? ""} maxLength={300} onChange={(e) => updateAttributes({ caption: e.target.value })} />
        </label>
        <button type="button" className="bseo-embed-remove" onClick={deleteNode}>{t("blogSeo.editor.removePhoto")}</button>
      </div>
    </NodeViewWrapper>
  )
}

const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    const img = (el: HTMLElement) => el.querySelector("img")
    return {
      src: attr((el) => img(el)?.getAttribute("src")),
      width: attr((el) => Number(img(el)?.getAttribute("width")) || null),
      height: attr((el) => Number(img(el)?.getAttribute("height")) || null),
      alt: attr((el) => img(el)?.getAttribute("alt") ?? "", ""),
      caption: attr((el) => el.querySelector("figcaption")?.textContent ?? "", ""),
    }
  },
  parseHTML() {
    return [{ tag: "figure", getAttrs: (el) => ((el as HTMLElement).querySelector("img[src]") ? null : false) }]
  },
  renderHTML({ node }) {
    const { src, width, height, alt, caption } = node.attrs
    const img = ["img", mergeAttributes({ src, alt: alt || "" }, width && height ? { width, height } : {})]
    return caption ? ["figure", img, ["figcaption", caption]] : ["figure", img]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FigureView)
  },
})

const ProductView = ({ node, deleteNode, selected }: ReactNodeViewProps) => {
  const { t } = useTranslation()
  const { productId, title } = node.attrs as { productId: string; title: string }
  const { data } = useQuery({ queryKey: [...KEY, "product", productId], queryFn: () => productsById([productId]), staleTime: 300_000 })
  const product = data?.[0]
  return (
    <NodeViewWrapper className={`bseo-embed bseo-embed-row ${selected ? "bseo-embed-selected" : ""}`} data-drag-handle>
      <ProductThumb src={product?.thumbnail} size={56} />
      <div className="bseo-embed-text">
        <span className="bseo-embed-kind">{t("blogSeo.editor.productCard")}</span>
        <strong>{product?.title ?? title ?? productId}</strong>
        {data && !product ? <span className="bseo-embed-warn">{t("blogSeo.editor.productGone")}</span> : null}
      </div>
      <button type="button" className="bseo-embed-remove" onClick={deleteNode}>{t("blogSeo.editor.remove")}</button>
    </NodeViewWrapper>
  )
}

const ProductEmbed = Node.create({
  name: "productEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { productId: attr((el) => el.getAttribute("data-product-id")), title: attr((el) => el.getAttribute("data-title") ?? "", "") }
  },
  parseHTML() {
    return [{ tag: "div[data-product-id]" }]
  },
  renderHTML({ node }) {
    return ["div", { "data-product-id": node.attrs.productId, "data-title": node.attrs.title || "" }]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ProductView)
  },
})

const YoutubeView = ({ node, deleteNode, selected }: ReactNodeViewProps) => {
  const { t } = useTranslation()
  const id = node.attrs.videoId as string
  return (
    <NodeViewWrapper className={`bseo-embed bseo-embed-row ${selected ? "bseo-embed-selected" : ""}`} data-drag-handle>
      <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" width={128} height={72} draggable={false} className="bseo-embed-video" />
      <div className="bseo-embed-text">
        <span className="bseo-embed-kind">{t("blogSeo.editor.youtube")}</span>
        <strong>youtu.be/{id}</strong>
      </div>
      <button type="button" className="bseo-embed-remove" onClick={deleteNode}>{t("blogSeo.editor.remove")}</button>
    </NodeViewWrapper>
  )
}

const YoutubeEmbed = Node.create({
  name: "youtubeEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { videoId: attr((el) => el.getAttribute("data-youtube-id")) }
  },
  parseHTML() {
    return [{ tag: "div[data-youtube-id]" }]
  },
  renderHTML({ node }) {
    return ["div", { "data-youtube-id": node.attrs.videoId }]
  },
  addNodeView() {
    return ReactNodeViewRenderer(YoutubeView)
  },
})

/** Inserts a block followed by an empty paragraph; after a selected embed rather than replacing it */
function insertBlock(editor: Editor, node: { type: string; attrs: Record<string, unknown> }) {
  const { selection } = editor.state
  const content = [node, { type: "paragraph" }]
  const chain = editor.chain().focus()
  if ("node" in selection && selection.node) chain.insertContentAt(selection.to, content).run()
  else chain.insertContent(content).run()
}

const Tool = ({ label, title, active, disabled, onClick, wide }: { label: React.ReactNode; title: string; active?: boolean; disabled?: boolean; onClick: () => void; wide?: boolean }) => (
  <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className={`bseo-tool ${active ? "bseo-tool-active" : ""} ${wide ? "bseo-tool-wide" : ""}`}>
    {label}
  </button>
)

const normalizeLink = (raw: string) => {
  const s = raw.trim()
  if (!s) return ""
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(s)) return s
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`
  return `https://${s}`
}

function Toolbar({ editor, onImage, uploading }: { editor: Editor; onImage: () => void; uploading: boolean }) {
  const { t } = useTranslation()
  const [panel, setPanel] = useState<null | "link" | "youtube">(null)
  const [value, setValue] = useState("")
  const [picker, setPicker] = useState(false)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      headerRow: e.isActive("tableHeader"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()
  const openLink = () => {
    setValue((editor.getAttributes("link").href as string) ?? "")
    setPanel(panel === "link" ? null : "link")
  }
  const applyLink = () => {
    const href = normalizeLink(value)
    if (!href) chain().extendMarkRange("link").unsetLink().run()
    else if (editor.state.selection.empty && !editor.isActive("link")) chain().insertContent({ type: "text", text: href.replace(/^mailto:|^tel:/, ""), marks: [{ type: "link", attrs: { href } }] }).run()
    else chain().extendMarkRange("link").setLink({ href }).run()
    setPanel(null)
  }
  const applyYoutube = () => {
    const id = youtubeId(value)
    if (!id) return toast.error(t("blogSeo.editor.youtubeBad"))
    insertBlock(editor, { type: "youtubeEmbed", attrs: { videoId: id } })
    setPanel(null)
  }
  const pickProduct = (p: ProductLite) => {
    insertBlock(editor, { type: "productEmbed", attrs: { productId: p.id, title: p.title } })
    setPicker(false)
  }
  const insertQa = () =>
    chain()
      .insertContent([
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: t("blogSeo.editor.qaQuestion") }] },
        { type: "paragraph", content: [{ type: "text", text: t("blogSeo.editor.qaAnswer") }] },
      ])
      .run()
  const tt = (k: string) => t(`blogSeo.editor.tools.${k}`)
  return (
    <div className="bseo-toolbar">
      <div className="bseo-tools">
        <Tool label="H2" title={tt("h2")} active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
        <Tool label="H3" title={tt("h3")} active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
        <Tool label={<b>B</b>} title={tt("bold")} active={s.bold} onClick={() => chain().toggleBold().run()} />
        <Tool label={<i>I</i>} title={tt("italic")} active={s.italic} onClick={() => chain().toggleItalic().run()} />
        <Tool label={`• ${tt("list")}`} wide title={tt("bullet")} active={s.bullet} onClick={() => chain().toggleBulletList().run()} />
        <Tool label={`1. ${tt("list")}`} wide title={tt("ordered")} active={s.ordered} onClick={() => chain().toggleOrderedList().run()} />
        <Tool label={`“ ${tt("quote")}`} wide title={tt("quote")} active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
        <Tool label={tt("link")} wide title={tt("link")} active={s.link || panel === "link"} onClick={openLink} />
        <span className="bseo-tool-sep" />
        <Tool label={uploading ? tt("uploading") : tt("photo")} wide title={tt("photoTitle")} disabled={uploading} onClick={onImage} />
        <Tool label={tt("product")} wide title={tt("productTitle")} onClick={() => setPicker(true)} />
        <Tool label="YouTube" wide title={tt("youtubeTitle")} active={panel === "youtube"} onClick={() => (setValue(""), setPanel(panel === "youtube" ? null : "youtube"))} />
        <Tool label={tt("qa")} wide title={tt("qaTitle")} onClick={insertQa} />
        <Tool label={tt("table")} wide title={tt("tableTitle")} active={s.table} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        <span className="bseo-tool-sep" />
        <Tool label="↶" title={tt("undo")} disabled={!s.canUndo} onClick={() => chain().undo().run()} />
        <Tool label="↷" title={tt("redo")} disabled={!s.canRedo} onClick={() => chain().redo().run()} />
      </div>
      {s.table && (
        <div className="bseo-tools bseo-tools-table" aria-label={tt("tableTools")}>
          <Tool label={`+ ${tt("row")}`} wide title={tt("addRow")} onClick={() => chain().addRowAfter().run()} />
          <Tool label={`− ${tt("row")}`} wide title={tt("deleteRow")} onClick={() => chain().deleteRow().run()} />
          <Tool label={`+ ${tt("column")}`} wide title={tt("addColumn")} onClick={() => chain().addColumnAfter().run()} />
          <Tool label={`− ${tt("column")}`} wide title={tt("deleteColumn")} onClick={() => chain().deleteColumn().run()} />
          <Tool label={tt("headerRow")} wide title={tt("headerRowTitle")} active={s.headerRow} onClick={() => chain().toggleHeaderRow().run()} />
          <Tool label={tt("merge")} wide title={tt("mergeTitle")} onClick={() => chain().mergeOrSplit().run()} />
          <Tool label={tt("deleteTable")} wide title={tt("deleteTable")} onClick={() => chain().deleteTable().run()} />
        </div>
      )}
      {panel && (
        <form
          className="bseo-tool-panel"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            panel === "link" ? applyLink() : applyYoutube()
          }}
        >
          <Input autoFocus inputMode="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder={panel === "link" ? t("blogSeo.editor.linkPlaceholder") : t("blogSeo.editor.youtubePlaceholder")} style={{ height: 40 }} />
          <Button type="submit" size="small">{panel === "link" ? t("blogSeo.editor.apply") : t("blogSeo.editor.insert")}</Button>
          {panel === "link" && s.link && (
            <Button type="button" size="small" variant="secondary" onClick={() => (chain().extendMarkRange("link").unsetLink().run(), setPanel(null))}>{t("blogSeo.editor.unlink")}</Button>
          )}
          <Button type="button" size="small" variant="transparent" onClick={() => setPanel(null)}>{t("blogSeo.cancel")}</Button>
        </form>
      )}
      <ProductPicker open={picker} onClose={() => setPicker(false)} onPick={pickProduct} title={t("blogSeo.editor.tools.productTitle")} />
    </div>
  )
}

export function RichEditor({ value, onChange, placeholder, label, dir }: { value: string; onChange: (html: string) => void; placeholder?: string; label: string; dir?: "ltr" | "rtl" }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const editorRef = useRef<Editor | null>(null)

  const insertImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"))
    if (!images.length) return
    setUploading(true)
    try {
      for (const file of images) {
        const up = await uploadImage(file, "body")
        if (editorRef.current) insertBlock(editorRef.current, { type: "figure", attrs: { src: up.url, width: up.width, height: up.height, alt: "", caption: "" } })
      }
    } catch (e) {
      const m = (e as Error).message
      toast.error(m === "not_image" ? t("blogSeo.upload.notImage") : m === "too_large" ? t("blogSeo.upload.tooLarge") : m)
    } finally {
      setUploading(false)
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
      Placeholder.configure({ placeholder: placeholder ?? t("blogSeo.editor.placeholder") }),
      TableKit.configure({ table: { resizable: false } }),
      Figure,
      ProductEmbed,
      YoutubeEmbed,
    ],
    content: value,
    editorProps: {
      attributes: { class: "bseo-prose", "aria-label": label, role: "textbox", "aria-multiline": "true", dir: dir ?? "ltr" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"))
        if (!files.length) return false
        void insertImages(files)
        return true
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"))
        if (!files.length) return false
        event.preventDefault()
        void insertImages(files)
        return true
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  })
  editorRef.current = editor

  return (
    <div className="bseo-editor">
      <EditorStyles />
      {editor && <Toolbar editor={editor} uploading={uploading} onImage={() => fileRef.current?.click()} />}
      <EditorContent editor={editor} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void insertImages(files) }} />
      <Text size="xsmall" className="text-ui-fg-muted px-3 pb-2">{t("blogSeo.editor.help")}</Text>
    </div>
  )
}

/** Editor look. Plain CSS on Medusa UI's colour variables. */
const EditorStyles = () => (
  <style>{`
.bseo-editor { border: 1px solid var(--border-base); border-radius: 8px; background: var(--bg-field); }
.bseo-editor:focus-within { border-color: var(--border-interactive); box-shadow: 0 0 0 3px var(--bg-interactive-alpha, rgba(59,130,246,.2)); }
.bseo-toolbar { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--border-base); background: var(--bg-base); border-radius: 8px 8px 0 0; }
.bseo-tools { display: flex; gap: 2px; padding: 4px; overflow-x: auto; scrollbar-width: none; }
.bseo-tools::-webkit-scrollbar { display: none; }
@media (min-width: 640px) { .bseo-tools { flex-wrap: wrap; overflow: visible; } }
.bseo-tool { flex: none; min-width: 40px; height: 40px; padding: 0 8px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--fg-base); white-space: nowrap; }
.bseo-tool:hover:not(:disabled) { background: var(--bg-base-hover); }
.bseo-tool:disabled { color: var(--fg-disabled); }
.bseo-tool-active { background: var(--bg-base-pressed); box-shadow: inset 0 0 0 1px var(--border-strong); }
.bseo-tool-sep { flex: none; width: 1px; margin: 8px 4px; background: var(--border-base); }
.bseo-tool-panel { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px; border-top: 1px solid var(--border-base); }
.bseo-tool-panel > :first-child { flex: 1 1 220px; }
.bseo-prose { min-height: 320px; padding: 16px; outline: none; font-size: 16px; line-height: 1.65; color: var(--fg-base); overflow-wrap: anywhere; }
.bseo-prose > * + * { margin-top: 0.9em; }
.bseo-prose h2 { margin-top: 1.6em; font-size: 1.45em; line-height: 1.25; font-weight: 600; }
.bseo-prose h3 { margin-top: 1.4em; font-size: 1.15em; line-height: 1.3; font-weight: 600; }
.bseo-prose > :first-child { margin-top: 0; }
.bseo-prose ul { list-style: disc; padding-inline-start: 1.4em; }
.bseo-prose ol { list-style: decimal; padding-inline-start: 1.4em; }
.bseo-prose li + li { margin-top: 0.3em; }
.bseo-prose blockquote { padding-inline-start: 1em; border-inline-start: 2px solid var(--fg-base); font-size: 1.1em; font-weight: 500; }
.bseo-prose a { color: var(--fg-interactive); text-decoration: underline; text-underline-offset: 3px; }
.bseo-prose hr { border: 0; border-top: 1px solid var(--border-strong); margin: 1.6em 0; }
.bseo-prose code { padding: 0 4px; border-radius: 4px; background: var(--bg-subtle); font-size: 0.9em; }
.bseo-tools-table { border-top: 1px solid var(--border-base); background: var(--bg-subtle); }
.bseo-prose .tableWrapper { overflow-x: auto; }
.bseo-prose table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 15px; }
.bseo-prose th, .bseo-prose td { min-width: 6em; padding: 6px 10px; border: 1px solid var(--border-base); text-align: start; vertical-align: top; position: relative; }
.bseo-prose th { font-weight: 600; background: var(--bg-subtle); }
.bseo-prose th > p, .bseo-prose td > p { margin: 0; }
.bseo-prose .selectedCell::after { content: ""; position: absolute; inset: 0; background: var(--bg-interactive-alpha, rgba(59,130,246,.15)); pointer-events: none; }
.bseo-prose p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: inline-start; height: 0; color: var(--fg-muted); pointer-events: none; }
.bseo-embed { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--border-base); border-radius: 8px; background: var(--bg-subtle); }
.bseo-embed-selected { border-color: var(--border-interactive); }
.bseo-embed > img { display: block; width: 100%; max-height: 420px; height: auto; object-fit: contain; border-radius: 6px; background: var(--bg-base); }
.bseo-embed-row { flex-direction: row; align-items: center; }
.bseo-embed-row > img.bseo-embed-video { width: 128px; height: 72px; flex: none; object-fit: cover; }
.bseo-embed-text { display: flex; min-width: 0; flex: 1; flex-direction: column; font-size: 14px; line-height: 1.35; }
.bseo-embed-text strong { font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.bseo-embed-kind { font-size: 12px; color: var(--fg-subtle); }
.bseo-embed-warn { font-size: 12px; color: var(--fg-error); }
.bseo-embed-fields { display: grid; gap: 8px; }
.bseo-embed-fields label { display: grid; gap: 4px; font-size: 12px; color: var(--fg-subtle); }
.bseo-embed-fields input { height: 40px; padding: 0 10px; border: 1px solid var(--border-base); border-radius: 6px; background: var(--bg-field); font-size: 14px; color: var(--fg-base); }
.bseo-embed-remove { flex: none; align-self: flex-start; justify-self: start; min-height: 36px; padding: 0 10px; border-radius: 6px; font-size: 13px; color: var(--fg-error); }
.bseo-embed-row .bseo-embed-remove { align-self: center; }
.bseo-embed-remove:hover { background: var(--bg-base-hover); }
`}</style>
)
