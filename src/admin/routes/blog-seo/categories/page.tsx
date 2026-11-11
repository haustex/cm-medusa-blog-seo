import { Button, Container, Heading, Input, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { BseoStyles } from "../../../components/styles"
import { CreditFooter } from "../../../components/credit-footer"
import { Field } from "../../../components/states"
import { api, CATEGORIES_KEY, POSTS_KEY, slugPreview, type AdminCategory } from "../../../lib/api"
import { useRuleMessage } from "../../../lib/use-settings"
import { useBlogSettings } from "../../../lib/use-settings"

type Draft = { rank: string; translations: Record<string, { name: string; slug: string; description: string }> }
const toDraft = (c: AdminCategory | null, codes: string[]): Draft => ({
  rank: String(c?.rank ?? 0),
  translations: Object.fromEntries(codes.map((code) => [code, { name: c?.translations[code]?.name ?? "", slug: c?.translations[code]?.slug ?? "", description: c?.translations[code]?.description ?? "" }])),
})

function CategoryForm({ initial, isNew, busy, onSave, onCancel }: { initial: Draft; isNew: boolean; busy: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const { locales, defaultLocale, settings } = useBlogSettings()
  const [d, setD] = useState(initial)
  const setT = (code: string, k: "name" | "slug" | "description", v: string) => setD({ ...d, translations: { ...d.translations, [code]: { ...d.translations[code], [k]: v } } })
  const base = settings?.routing.base ?? "/blog"
  const seg = settings?.routing.category ?? "category"
  return (
    <form className="flex flex-col gap-4 px-6 py-4" onSubmit={(e) => { e.preventDefault(); onSave(d) }}>
      <div className="bseo-cols-2 gap-4">
        {locales.map((x) => {
          const tr = d.translations[x.code]
          const isDefault = x.code === defaultLocale
          return (
            <Container key={x.code} className="flex flex-col gap-3 px-4 py-3" dir={x.dir}>
              <Text size="small" weight="plus">{x.name}{isDefault ? ` · ${t("blogSeo.defaultLocale")}` : ""}</Text>
              <Field label={t("blogSeo.fields.name")}>
                <Input required={isDefault} maxLength={120} value={tr.name} onChange={(e) => setT(x.code, "name", e.target.value)} style={{ height: 44 }} />
              </Field>
              <Field label={t("blogSeo.fields.slug")} hint={`${base}/${seg}/${tr.slug || slugPreview(tr.name) || "…"}`}>
                <Input maxLength={80} value={tr.slug} autoCapitalize="none" spellCheck={false} onChange={(e) => setT(x.code, "slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} placeholder={t("blogSeo.fields.slugAuto")} style={{ height: 44 }} />
              </Field>
              <Field label={t("blogSeo.fields.descriptionOptional")}>
                <Textarea rows={2} maxLength={1000} value={tr.description} onChange={(e) => setT(x.code, "description", e.target.value)} />
              </Field>
            </Container>
          )
        })}
      </div>
      <Field label={t("blogSeo.fields.rank")} hint={t("blogSeo.fields.rankHint")}>
        <Input type="number" inputMode="numeric" value={d.rank} onChange={(e) => setD({ ...d, rank: e.target.value })} style={{ height: 44, maxWidth: 160 }} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" isLoading={busy} style={{ minHeight: 40 }}>{isNew ? t("blogSeo.categories.add") : t("blogSeo.save")}</Button>
        <Button type="button" variant="secondary" onClick={onCancel} style={{ minHeight: 40 }}>{t("blogSeo.cancel")}</Button>
      </div>
    </form>
  )
}

const CategoriesPage = () => {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const prompt = usePrompt()
  const ruleMessage = useRuleMessage()
  const { codes, defaultLocale, settings } = useBlogSettings()
  const [editing, setEditing] = useState<string | null>(null)
  const { data, isLoading, isError } = useQuery({ queryKey: CATEGORIES_KEY, queryFn: api.listCategories })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
    qc.invalidateQueries({ queryKey: POSTS_KEY })
  }
  const body = (d: Draft) => ({
    rank: Number(d.rank) || 0,
    translations: Object.fromEntries(Object.entries(d.translations).map(([code, tr]) => [code, { name: tr.name, ...(tr.slug ? { slug: tr.slug } : {}), description: tr.description || null }])),
  })
  const save = useMutation({
    mutationFn: ({ id, d }: { id: string | null; d: Draft }) => (id ? api.updateCategory(id, body(d)) : api.createCategory(body(d))),
    onSuccess: () => { toast.success(t("blogSeo.categories.saved")); setEditing(null); refresh() },
    onError: (e) => toast.error(ruleMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => { toast.success(t("blogSeo.categories.deleted")); refresh() },
    onError: (e) => toast.error(ruleMessage(e)),
  })
  const name = (c: AdminCategory) => c.translations[defaultLocale]?.name ?? Object.values(c.translations)[0]?.name ?? ""
  const askRemove = async (c: AdminCategory) => {
    const ok = await prompt({ title: t("blogSeo.categories.confirmDelete", { name: name(c) }), description: t("blogSeo.categories.confirmDeleteText", { count: c.post_count ?? 0 }), confirmText: t("blogSeo.delete"), cancelText: t("blogSeo.cancel") })
    if (ok) remove.mutate(c.id)
  }
  return (
    <div className="flex flex-col gap-y-3">
      <Link to="/blog-seo" className="txt-compact-small text-ui-fg-subtle flex items-center gap-1" style={{ minHeight: 32 }}>← Blog</Link>
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
          <div>
            <Heading>{t("blogSeo.categories.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle mt-1">{t("blogSeo.categories.description")}</Text>
          </div>
          {editing !== "new" && <Button style={{ minHeight: 40 }} onClick={() => setEditing("new")}>{t("blogSeo.categories.new")}</Button>}
        </div>
        {editing === "new" && settings && <CategoryForm isNew initial={toDraft(null, codes)} busy={save.isPending} onSave={(d) => save.mutate({ id: null, d })} onCancel={() => setEditing(null)} />}
        {isError ? (
          <div className="px-6 py-4"><Text size="small" className="text-ui-fg-error">{t("blogSeo.loadError")}</Text></div>
        ) : isLoading || !settings ? (
          <div className="px-6 py-6"><Text size="small" className="text-ui-fg-subtle">{t("blogSeo.loading")}</Text></div>
        ) : !data?.categories.length ? (
          <div className="px-6 py-6"><Text size="small">{t("blogSeo.categories.empty")}</Text></div>
        ) : (
          <ul className="divide-y">
            {data.categories.map((c) =>
              editing === c.id ? (
                <li key={c.id}><CategoryForm isNew={false} initial={toDraft(c, codes)} busy={save.isPending} onSave={(d) => save.mutate({ id: c.id, d })} onCancel={() => setEditing(null)} /></li>
              ) : (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-3" style={{ minHeight: 64 }}>
                  <div className="min-w-0 flex-1">
                    <Text size="small" weight="plus">{name(c)}</Text>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {codes.map((code) => `${code}: ${c.translations[code]?.slug ?? "–"}`).join(" · ")} · {t("blogSeo.categories.postCount", { count: c.post_count ?? 0 })}
                    </Text>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" style={{ minHeight: 40 }} onClick={() => setEditing(c.id)}>{t("blogSeo.edit")}</Button>
                    <Button variant="secondary" style={{ minHeight: 40 }} onClick={() => askRemove(c)}>{t("blogSeo.delete")}</Button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </Container>
      <CreditFooter />
      <BseoStyles />
    </div>
  )
}

export const handle = { breadcrumb: () => "Categories" }
export default CategoriesPage
