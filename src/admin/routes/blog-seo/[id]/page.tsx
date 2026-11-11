import { Badge, Button, Container, Heading, Input, Select, Switch, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom"
import { CoverField } from "../../../components/cover-field"
import { CreditFooter } from "../../../components/credit-footer"
import { ProductPicker, ProductThumb } from "../../../components/product-picker"
import { RichEditor } from "../../../components/rich-editor"
import { Field } from "../../../components/states"
import { LocaleReadOnly } from "../../../components/locale-readonly"
import { api, AUTHORS_KEY, CATEGORIES_KEY, changedFields, CONFIG_KEY, formatDateTime, fromLocalInput, isEmptyPatch, lang, postKey, POSTS_KEY, productsById, slugPreview, STATUS_COLOR, toFields, toLocalInput, type AdminPost, type PostFields, type TranslationFields } from "../../../lib/api"
import { useBlogSettings, useRuleMessage } from "../../../lib/use-settings"

const AUTOSAVE_MS = 1500

/** Translation editor for one locale */
function LocaleEditor({ code, name, dir, isDefault, t: tr, missing, status, routing, onChange, autoSlug, setAutoSlug }: { code: string; name: string; dir: "ltr" | "rtl"; isDefault: boolean; t: TranslationFields; missing: string[]; status: AdminPost["status"]; routing: { base: string; prefix: string }; onChange: (patch: Partial<TranslationFields>) => void; autoSlug: boolean; setAutoSlug: (v: boolean) => void }) {
  const { t } = useTranslation()
  const [tagInput, setTagInput] = useState(tr.tags.join(", "))
  useEffect(() => setTagInput(tr.tags.join(", ")), [tr.tags.join("\u0000")])
  const slugShown = tr.slug || (autoSlug ? slugPreview(tr.title) : "")
  const miss = (k: string) => (missing.includes(k) ? <Badge size="2xsmall" color="orange" className="ml-2">{t("blogSeo.required")}</Badge> : null)
  return (
    <div className="flex min-w-0 flex-col gap-4" dir={dir} data-bseo={`editor-${code}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="plus">{name}</Text>
        <Badge size="2xsmall" color="grey">{code}</Badge>
        {isDefault && <Badge size="2xsmall" color="blue">{t("blogSeo.defaultLocale")}</Badge>}
        {!missing.length ? <Badge size="2xsmall" color="green">{t("blogSeo.complete")}</Badge> : <Badge size="2xsmall" color="orange">{t("blogSeo.missingFields", { fields: missing.map((m) => t(`blogSeo.fields.${m}`)).join(", ") })}</Badge>}
      </div>
      <Field label={t("blogSeo.fields.title")} count={`${tr.title.length}/160`}>
        <Input maxLength={160} value={tr.title} onChange={(e) => onChange({ title: e.target.value })} style={{ height: 44 }} data-bseo={`title-${code}`} />
        {miss("title")}
      </Field>
      <Field label={t("blogSeo.fields.slug")} hint={status === "draft" ? (autoSlug ? t("blogSeo.fields.slugFollowsTitle") : t("blogSeo.fields.slugManual")) : t("blogSeo.fields.slugRedirect")}>
        <div className="flex w-full items-center gap-2" dir="ltr">
          <Text size="xsmall" className="text-ui-fg-muted shrink-0 font-mono whitespace-nowrap">{routing.prefix}{routing.base}/</Text>
          <div className="min-w-0 flex-1">{/* Medusa's Input sits in a plain div: the wrapper takes the room */}
            <Input className="w-full" maxLength={80} value={slugShown} autoCapitalize="none" spellCheck={false} placeholder={t("blogSeo.fields.slugAuto")} data-bseo={`slug-${code}`}
              onChange={(e) => { setAutoSlug(false); onChange({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") }) }} style={{ height: 44 }} />
          </div>
          {status === "draft" && !autoSlug && <Button type="button" variant="secondary" className="shrink-0" style={{ minHeight: 40 }} onClick={() => { setAutoSlug(true); onChange({ slug: "" }) }}>{t("blogSeo.fields.slugReset")}</Button>}
        </div>
      </Field>
      <Field label={t("blogSeo.fields.excerpt")} count={`${tr.excerpt.length}/300`} hint={t("blogSeo.fields.excerptHint")}>
        <Textarea rows={3} maxLength={300} value={tr.excerpt} onChange={(e) => onChange({ excerpt: e.target.value })} />
        {miss("excerpt")}
      </Field>
      <div>
        <RichEditor label={t("blogSeo.fields.body")} value={tr.body} dir={dir} placeholder={t("blogSeo.fields.bodyPlaceholder")} onChange={(html) => onChange({ body: html })} />
        {miss("body")}
      </div>
      <Field label={t("blogSeo.fields.coverAlt")} hint={t("blogSeo.fields.coverAltHint")}>
        <Input maxLength={200} value={tr.cover_alt} onChange={(e) => onChange({ cover_alt: e.target.value })} style={{ height: 44 }} />
      </Field>
      <Field label={t("blogSeo.fields.tags")} hint={t("blogSeo.fields.tagsHint")}>
        <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onBlur={() => onChange({ tags: Array.from(new Set(tagInput.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))).slice(0, 20) })} style={{ height: 44 }} />
      </Field>
      <Container className="flex flex-col gap-3 px-4 py-3">
        <Text size="small" weight="plus">{t("blogSeo.seo.title")}</Text>
        <Field label={t("blogSeo.seo.metaTitle")} count={`${tr.seo_title.length}/70`} hint={t("blogSeo.seo.metaTitleHint")}>
          <Input maxLength={70} value={tr.seo_title} placeholder={tr.title} onChange={(e) => onChange({ seo_title: e.target.value })} style={{ height: 44 }} />
        </Field>
        <Field label={t("blogSeo.seo.metaDescription")} count={`${tr.seo_description.length}/160`} hint={t("blogSeo.seo.metaDescriptionHint")}>
          <Textarea rows={2} maxLength={160} value={tr.seo_description} placeholder={tr.excerpt} onChange={(e) => onChange({ seo_description: e.target.value })} />
        </Field>
        <CoverField label={t("blogSeo.seo.ogImage")} hint={t("blogSeo.seo.ogImageHint")} value={tr.og_image} ratio="1200 / 630" kind="og" onChange={(url) => onChange({ og_image: url })} />
      </Container>
    </div>
  )
}

const PostEditor = () => {
  const { id = "" } = useParams()
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const prompt = usePrompt()
  const { settings, locales, codes, defaultLocale } = useBlogSettings()
  const { data, isLoading, isError } = useQuery({ queryKey: postKey(id), queryFn: () => api.getPost(id), enabled: !!id })
  const { data: cats } = useQuery({ queryKey: CATEGORIES_KEY, queryFn: api.listCategories })
  const { data: authors } = useQuery({ queryKey: AUTHORS_KEY, queryFn: api.listAuthors })
  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: api.config, staleTime: 300_000 })
  const post = data?.post

  const routingFor = (code: string) => ({ base: settings?.routing.base ?? "/blog", prefix: settings?.routing.locales[code]?.prefix ?? (code === defaultLocale ? "" : `/${code}`) })
  const [fields, setFields] = useState<PostFields | null>(null)
  const saved = useRef<PostFields | null>(null)
  const [autoSlug, setAutoSlugState] = useState<Record<string, boolean>>({})
  const [active, setActive] = useState("")
  const [split, setSplit] = useState(false)
  const [saving, setSaving] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle")
  const [scheduleAt, setScheduleAt] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<unknown> | null>(null)

  // load → editor state (once per post id / locale list)
  useEffect(() => {
    if (!post || !codes.length || fields) return
    const f = toFields(post, codes)
    setFields(f)
    saved.current = f
    setAutoSlugState(Object.fromEntries(codes.map((c) => [c, !post.translations[c]?.slug])))
    setActive(codes.includes(defaultLocale) ? defaultLocale : codes[0])
  }, [post, codes.join(","), defaultLocale])

  const applyServer = useCallback((p: AdminPost) => {
    qc.setQueryData(postKey(id), { post: p })
    const f = toFields(p, codes)
    saved.current = f
    // keep what the user typed meanwhile; refresh slugs the server chose
    setFields((cur) => {
      if (!cur) return f
      const translations = { ...cur.translations }
      for (const c of codes) if (translations[c] && f.translations[c]) translations[c] = { ...translations[c], slug: autoSlug[c] || !translations[c].slug ? f.translations[c].slug : translations[c].slug }
      return { ...cur, translations }
    })
    qc.invalidateQueries({ queryKey: POSTS_KEY })
  }, [codes.join(","), id, autoSlug])

  const message = useRuleMessage()

  /** Write the difference to the server (serialised: one request at a time) */
  const flush = useCallback(async (now: PostFields | null = fields): Promise<boolean> => {
    if (!now || !saved.current || !post) return true
    if (inflight.current) await inflight.current
    const patch = changedFields(now, saved.current)
    if (isEmptyPatch(patch)) { setSaving((s) => (s === "pending" ? "saved" : s)); return true }
    if (patch.translations) for (const [c, tr] of Object.entries(patch.translations)) if (autoSlug[c] && tr.title !== undefined) tr.auto_slug = true
    setSaving("saving")
    const run = api.updatePost(id, patch).then((res) => { applyServer(res.post); setSaving("saved"); return true }).catch((e) => { setSaving("error"); toast.error(message(e)); return false })
    inflight.current = run
    const ok = await run
    inflight.current = null
    return ok
  }, [fields, post, id, autoSlug, applyServer])

  const update = (patch: Partial<PostFields>) => {
    setFields((cur) => (cur ? { ...cur, ...patch } : cur))
    setSaving("pending")
  }
  const updateT = (code: string, patch: Partial<TranslationFields>) => {
    setFields((cur) => (cur ? { ...cur, translations: { ...cur.translations, [code]: { ...cur.translations[code], ...patch } } } : cur))
    setSaving("pending")
  }
  const setAutoSlug = (code: string, v: boolean) => setAutoSlugState((s) => ({ ...s, [code]: v }))

  // drafts autosave; published/scheduled posts save on demand (their change goes live)
  const autosave = post?.status === "draft"
  useEffect(() => {
    if (!autosave || saving !== "pending") return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => flush(), AUTOSAVE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [fields, autosave, saving])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saving === "pending" || saving === "saving") { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [saving])

  const dirty = !!fields && !!saved.current && !isEmptyPatch(changedFields(fields, saved.current))
  const unsaved = dirty || saving === "pending" || saving === "saving"
  // leaving the page with changes: drafts are flushed first, other posts ask
  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (autosave) { void flush().then((ok) => (ok ? blocker.proceed() : blocker.reset())); return }
    void prompt({ title: t("blogSeo.autosave.leaveTitle"), description: t("blogSeo.autosave.leave"), confirmText: t("blogSeo.autosave.leaveConfirm"), cancelText: t("blogSeo.cancel") }).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker.state])
  /** Slugs of a published post that are about to change: ask first (the old address becomes a permanent redirect) */
  const confirmSlugChanges = async () => {
    if (!fields || !saved.current || post?.status !== "published") return true
    const changes = codes.filter((c) => fields.translations[c]?.slug && saved.current!.translations[c]?.slug && fields.translations[c].slug !== saved.current!.translations[c].slug)
    if (!changes.length) return true
    const lines = changes.map((c) => { const r = routingFor(c); return t("blogSeo.slugChange.line", { from: `${r.prefix}${r.base}/${saved.current!.translations[c].slug}`, to: `${r.prefix}${r.base}/${fields.translations[c].slug}` }) })
    return prompt({ title: t("blogSeo.slugChange.title"), description: `${t("blogSeo.slugChange.text")}\n\n${lines.join("\n")}`, confirmText: t("blogSeo.save"), cancelText: t("blogSeo.cancel") })
  }
  const act = useMutation({
    mutationFn: async ({ kind, at }: { kind: "publish" | "unpublish" | "rotate" | "save"; at?: string | null }) => {
      if (!(await confirmSlugChanges())) throw new Error("save_failed")
      if (!(await flush())) throw new Error("save_failed")
      if (kind === "publish") return api.publishPost(id, at)
      if (kind === "unpublish") return api.unpublishPost(id)
      if (kind === "rotate") return api.rotatePreviewToken(id)
      return { post: (qc.getQueryData(postKey(id)) as { post: AdminPost }).post }
    },
    onSuccess: (res, v) => {
      applyServer(res.post)
      if (v.kind === "publish") toast.success(res.post.status === "scheduled" ? t("blogSeo.toast.scheduled", { date: formatDateTime(res.post.published_at, l) }) : t("blogSeo.toast.published"))
      else if (v.kind === "unpublish") toast.success(t("blogSeo.toast.unpublished"))
      else if (v.kind === "rotate") toast.success(t("blogSeo.toast.rotated"))
      else toast.success(t("blogSeo.toast.saved"))
    },
    onError: (e) => { if ((e as Error).message !== "save_failed") toast.error(message(e)) },
  })
  const del = useMutation({
    mutationFn: () => api.deletePost(id),
    onSuccess: () => { toast.success(t("blogSeo.toast.deleted")); qc.invalidateQueries({ queryKey: POSTS_KEY }); navigate("/blog-seo") },
    onError: (e) => toast.error(message(e)),
  })
  const askDelete = async () => {
    const ok = await prompt({ title: t("blogSeo.confirmDelete"), description: t("blogSeo.confirmDeleteText"), confirmText: t("blogSeo.delete"), cancelText: t("blogSeo.cancel") })
    if (ok) del.mutate()
  }
  const schedule = () => {
    const iso = fromLocalInput(scheduleAt)
    if (!iso) return toast.error(t("blogSeo.errors.invalid_date"))
    if (new Date(iso).getTime() <= Date.now()) return toast.error(t("blogSeo.schedule.past"))
    act.mutate({ kind: "publish", at: iso })
  }

  const productIds = fields?.product_ids ?? []
  const { data: products } = useQuery({ queryKey: [...POSTS_KEY, "products", productIds.join(",")], queryFn: () => productsById(productIds), enabled: productIds.length > 0 })
  const catName = (c: { translations: Record<string, { name: string }> }) => c.translations[defaultLocale]?.name ?? Object.values(c.translations)[0]?.name ?? ""
  const completeness = useMemo(() => Object.fromEntries((post?.completeness.locales ?? []).map((x) => [x.locale, x.missing as string[]])), [post])

  if (isError) return <Container className="px-6 py-6"><Text size="small" className="text-ui-fg-error">{t("blogSeo.loadError")}</Text></Container>
  if (isLoading || !post || !fields || !settings) return <Container className="px-6 py-6"><Text size="small" className="text-ui-fg-subtle">{t("blogSeo.loading")}</Text></Container>

  const others = codes.filter((c) => c !== defaultLocale)
  const splitOn = split && others.length > 0
  const editing = splitOn && active === defaultLocale ? others[0] : active
  const statusLine = post.status === "published" ? t("blogSeo.publishedAt", { date: formatDateTime(post.published_at, l) }) : post.status === "scheduled" ? t("blogSeo.scheduledFor", { date: formatDateTime(post.published_at, l) }) : t("blogSeo.changedAt", { date: formatDateTime(post.updated_at, l) })
  const saveLabel = saving === "saving" ? t("blogSeo.autosave.saving") : saving === "pending" ? (autosave ? t("blogSeo.autosave.pending") : t("blogSeo.autosave.unsaved")) : saving === "error" ? t("blogSeo.autosave.error") : saving === "saved" ? t("blogSeo.autosave.saved") : ""

  return (
    <div className="flex flex-col gap-y-3">
      <Link to="/blog-seo" className="txt-compact-small text-ui-fg-subtle flex items-center gap-1" style={{ minHeight: 32 }}>← Blog</Link>

      <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Heading className="truncate">{fields.translations[defaultLocale]?.title || Object.values(fields.translations).find((x) => x.title)?.title || t("blogSeo.untitled")}</Heading>
            <Badge size="2xsmall" color={STATUS_COLOR[post.status]}>{t(`blogSeo.status.${post.status}`)}</Badge>
            {!post.completeness.publishable && <Badge size="2xsmall" color="orange">{t("blogSeo.incomplete")}</Badge>}
            {unsaved && !autosave && <Badge size="2xsmall" color="orange" data-bseo="unsaved">{t("blogSeo.autosave.unsaved")}</Badge>}
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1" data-bseo="save-state">{statusLine}{saveLabel ? ` · ${saveLabel}` : ""}</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {!autosave && <Button variant={dirty ? "primary" : "secondary"} style={{ minHeight: 40 }} disabled={!dirty} isLoading={act.isPending && act.variables?.kind === "save"} onClick={() => act.mutate({ kind: "save" })} data-bseo="save">{t("blogSeo.save")}</Button>}
          {post.status !== "published" && <Button style={{ minHeight: 40 }} isLoading={act.isPending && act.variables?.kind === "publish" && !act.variables.at} disabled={!post.completeness.publishable && !dirty} onClick={() => act.mutate({ kind: "publish", at: null })}>{t("blogSeo.publishNow")}</Button>}
          {post.status !== "draft" && <Button variant="secondary" style={{ minHeight: 40 }} isLoading={act.isPending && act.variables?.kind === "unpublish"} onClick={() => act.mutate({ kind: "unpublish" })}>{post.status === "scheduled" ? t("blogSeo.cancelSchedule") : t("blogSeo.unpublish")}</Button>}
          <Button variant="danger" style={{ minHeight: 40 }} isLoading={del.isPending} onClick={askDelete}>{t("blogSeo.delete")}</Button>
        </div>
      </Container>

      {!post.completeness.publishable && (
        <Container className="px-6 py-3">
          <Text size="small">
            {t("blogSeo.publishBlocked")}{" "}
            {post.completeness.cover_missing ? t("blogSeo.coverMissing") + " " : ""}
            {post.completeness.locales.filter((x) => x.missing.length).map((x) => `${locales.find((y) => y.code === x.locale)?.name ?? x.locale}: ${x.missing.map((m) => t(`blogSeo.fields.${m}`)).join(", ")}`).join(" · ")}
          </Text>
          {settings.fallback !== "hide" && <Text size="xsmall" className="text-ui-fg-muted mt-1">{t("blogSeo.fallbackNote", { locale: locales.find((y) => y.code === defaultLocale)?.name ?? defaultLocale })}</Text>}
        </Container>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <Container className="flex flex-col gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {locales.map((x) => {
              const missing = completeness[x.code] ?? ["title", "excerpt", "body"]
              return (
                <button key={x.code} type="button" style={{ minHeight: 40 }} className={`flex items-center gap-2 rounded-md border px-3 ${editing === x.code ? "border-ui-fg-base bg-ui-bg-base-pressed" : "bg-ui-bg-base"}`} onClick={() => setActive(x.code)} data-bseo={`tab-${x.code}`}>
                  <Text size="small" weight="plus">{x.name}</Text>
                  <Badge size="2xsmall" color={missing.length ? "orange" : "green"}>{!missing.length ? t("blogSeo.complete") : completeness[x.code]?.length === 4 || !completeness[x.code] ? t("blogSeo.localeMissing") : t("blogSeo.incomplete")}</Badge>
                </button>
              )
            })}
            {locales.length > 1 && (
              <label className="ml-auto flex items-center gap-2" style={{ minHeight: 40 }}>
                <Switch checked={split} onCheckedChange={setSplit} data-bseo="split" />
                <Text size="xsmall">{t("blogSeo.sideBySide")}</Text>
              </label>
            )}
          </div>
          <div className={`grid gap-6 ${splitOn ? "lg:grid-cols-2" : ""}`} data-bseo={splitOn ? "split-on" : "split-off"}>
            {splitOn && (() => { const d = locales.find((y) => y.code === defaultLocale)!; return <LocaleReadOnly key={`ro-${defaultLocale}`} code={defaultLocale} name={d.name} dir={d.dir} t={fields.translations[defaultLocale]} /> })()}
            {(() => {
              const x = locales.find((y) => y.code === editing)!
              return <LocaleEditor key={editing} code={editing} name={x.name} dir={x.dir} isDefault={editing === defaultLocale} t={fields.translations[editing]} missing={completeness[editing] ?? []} status={post.status} routing={routingFor(editing)} onChange={(p) => updateT(editing, p)} autoSlug={!!autoSlug[editing]} setAutoSlug={(v) => setAutoSlug(editing, v)} />
            })()}
          </div>
        </Container>

        <div className="flex flex-col gap-3">
          <Container className="flex flex-col gap-4 px-4 py-4">
            <CoverField label={t("blogSeo.fields.cover")} hint={config?.publish.require_cover ? t("blogSeo.fields.coverRequired") : t("blogSeo.fields.coverHint")} value={fields.cover} ratio="4 / 3" kind="cover" onChange={(url) => update({ cover: url })} />
            <CoverField label={t("blogSeo.fields.coverWide")} hint={t("blogSeo.fields.coverWideHint")} value={fields.cover_wide} ratio="16 / 9" kind="cover" onChange={(url) => update({ cover_wide: url })} />
            <Field label={t("blogSeo.fields.category")}>
              <Select value={fields.category_id ?? "none"} onValueChange={(v) => update({ category_id: v === "none" ? null : v })}>
                <Select.Trigger style={{ height: 44 }}><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="none">{t("blogSeo.filters.noCategory")}</Select.Item>
                  {(cats?.categories ?? []).map((c) => <Select.Item key={c.id} value={c.id}>{catName(c)}</Select.Item>)}
                </Select.Content>
              </Select>
            </Field>
            <Field label={t("blogSeo.fields.author")}>
              <Select value={fields.author_id ?? "none"} onValueChange={(v) => update({ author_id: v === "none" ? null : v })}>
                <Select.Trigger style={{ height: 44 }}><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="none">{t("blogSeo.fields.noAuthor")}</Select.Item>
                  {(authors?.authors ?? []).map((a) => <Select.Item key={a.id} value={a.id}>{a.name}</Select.Item>)}
                </Select.Content>
              </Select>
            </Field>
            <label className="flex items-center justify-between gap-2" style={{ minHeight: 40 }}>
              <Text size="small">{t("blogSeo.fields.featured")}</Text>
              <Switch checked={fields.featured} onCheckedChange={(v) => update({ featured: v })} />
            </label>
          </Container>

          <Container className="flex flex-col gap-3 px-4 py-4">
            <Text size="small" weight="plus">{t("blogSeo.products.related")}</Text>
            <Text size="xsmall" className="text-ui-fg-muted">{t("blogSeo.products.relatedHint")}</Text>
            <ul className="flex flex-col gap-2">
              {productIds.map((pid) => {
                const p = products?.find((x) => x.id === pid)
                return (
                  <li key={pid} className="flex items-center gap-2">
                    <ProductThumb src={p?.thumbnail} size={36} />
                    <Text size="small" className="min-w-0 flex-1 truncate">{p?.title ?? pid}</Text>
                    <Button type="button" variant="transparent" size="small" style={{ minHeight: 36 }} onClick={() => update({ product_ids: productIds.filter((x) => x !== pid) })} aria-label={t("blogSeo.editor.remove")}>✕</Button>
                  </li>
                )
              })}
            </ul>
            <Button type="button" variant="secondary" style={{ minHeight: 40 }} disabled={productIds.length >= 12} onClick={() => setPickerOpen(true)}>{t("blogSeo.products.add")}</Button>
            <ProductPicker open={pickerOpen} onClose={() => setPickerOpen(false)} exclude={productIds} onPick={(p) => { update({ product_ids: [...productIds, p.id] }); setPickerOpen(false) }} />
          </Container>

          {post.status !== "published" && (
            <Container className="flex flex-col gap-3 px-4 py-4">
              <Text size="small" weight="plus">{t("blogSeo.schedule.title")}</Text>
              <Text size="xsmall" className="text-ui-fg-muted">{t("blogSeo.schedule.hint", { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}</Text>
              <Input type="datetime-local" value={scheduleAt || (post.published_at ? toLocalInput(post.published_at) : "")} min={toLocalInput(new Date())} onChange={(e) => setScheduleAt(e.target.value)} style={{ height: 44 }} />
              <Button type="button" variant="secondary" style={{ minHeight: 40 }} isLoading={act.isPending && act.variables?.kind === "publish" && !!act.variables.at} disabled={!scheduleAt && !post.published_at} onClick={schedule}>{post.status === "scheduled" ? t("blogSeo.schedule.change") : t("blogSeo.schedule.set")}</Button>
            </Container>
          )}

          <Container className="flex flex-col gap-2 px-4 py-4">
            <Text size="small" weight="plus">{t("blogSeo.preview.title")}</Text>
            {!config?.storefront_url && <Text size="xsmall" className="text-ui-fg-muted">{t("blogSeo.preview.noStorefront")}</Text>}
            {locales.map((x) => (
              <div key={x.code} className="flex flex-wrap items-center gap-2" style={{ minHeight: 32 }}>
                <Text size="xsmall" className="w-16 font-mono">{x.code}</Text>
                <a className="text-ui-fg-interactive txt-compact-small" href={post.preview_urls[x.code]} target="_blank" rel="noreferrer">{t("blogSeo.preview.open")}</a>
                {post.status === "published" && post.public_urls[x.code] && <a className="text-ui-fg-interactive txt-compact-small" href={post.public_urls[x.code]} target="_blank" rel="noreferrer">{t("blogSeo.preview.public")}</a>}
              </div>
            ))}
            <Button type="button" variant="transparent" size="small" className="self-start" style={{ minHeight: 36 }} isLoading={act.isPending && act.variables?.kind === "rotate"} onClick={() => act.mutate({ kind: "rotate" })}>{t("blogSeo.preview.rotate")}</Button>
            <Text size="xsmall" className="text-ui-fg-muted">{t("blogSeo.preview.rotateHint")}</Text>
          </Container>
        </div>
      </div>
      <CreditFooter />
    </div>
  )
}

export const handle = { breadcrumb: () => "Post" }
export default PostEditor
