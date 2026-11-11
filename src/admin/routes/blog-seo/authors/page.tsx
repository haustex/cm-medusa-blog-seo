import { Button, Container, Heading, Input, Select, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { CoverField } from "../../../components/cover-field"
import { CreditFooter } from "../../../components/credit-footer"
import { Field } from "../../../components/states"
import { api, AUTHORS_KEY, errorOf, POSTS_KEY, type AdminAuthor } from "../../../lib/api"
import { useBlogSettings } from "../../../lib/use-settings"

type Draft = { name: string; slug: string; type: "person" | "organization"; avatar: string | null; url: string; same_as: string; translations: Record<string, { job_title: string; bio: string }> }
const toDraft = (a: AdminAuthor | null, codes: string[]): Draft => ({
  name: a?.name ?? "",
  slug: a?.slug ?? "",
  type: a?.type ?? "person",
  avatar: a?.avatar ?? null,
  url: a?.url ?? "",
  same_as: (a?.same_as ?? []).join("\n"),
  translations: Object.fromEntries(codes.map((code) => [code, { job_title: a?.translations[code]?.job_title ?? "", bio: a?.translations[code]?.bio ?? "" }])),
})

function AuthorForm({ initial, isNew, busy, onSave, onCancel }: { initial: Draft; isNew: boolean; busy: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const { locales } = useBlogSettings()
  const [d, setD] = useState(initial)
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch })
  const setT = (code: string, k: "job_title" | "bio", v: string) => setD({ ...d, translations: { ...d.translations, [code]: { ...d.translations[code], [k]: v } } })
  return (
    <form className="flex flex-col gap-4 px-6 py-4" onSubmit={(e) => { e.preventDefault(); onSave(d) }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("blogSeo.fields.name")}>
          <Input required maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })} style={{ height: 44 }} />
        </Field>
        <Field label={t("blogSeo.authors.type")}>
          <Select value={d.type} onValueChange={(v) => set({ type: v as Draft["type"] })}>
            <Select.Trigger style={{ height: 44 }}><Select.Value /></Select.Trigger>
            <Select.Content>
              <Select.Item value="person">{t("blogSeo.authors.person")}</Select.Item>
              <Select.Item value="organization">{t("blogSeo.authors.organization")}</Select.Item>
            </Select.Content>
          </Select>
        </Field>
        <Field label={t("blogSeo.fields.slug")} hint={t("blogSeo.authors.slugHint")}>
          <Input maxLength={80} value={d.slug} autoCapitalize="none" spellCheck={false} placeholder={t("blogSeo.fields.slugAuto")} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") })} style={{ height: 44 }} />
        </Field>
        <Field label={t("blogSeo.authors.url")}>
          <Input inputMode="url" maxLength={500} value={d.url} placeholder="https://" onChange={(e) => set({ url: e.target.value })} style={{ height: 44 }} />
        </Field>
        <Field label={t("blogSeo.authors.sameAs")} hint={t("blogSeo.authors.sameAsHint")}>
          <Textarea rows={3} value={d.same_as} onChange={(e) => set({ same_as: e.target.value })} />
        </Field>
        <CoverField label={t("blogSeo.authors.avatar")} value={d.avatar} ratio="1 / 1" kind="avatar" maxWidth={160} onChange={(url) => set({ avatar: url })} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {locales.map((x) => (
          <Container key={x.code} className="flex flex-col gap-3 px-4 py-3" dir={x.dir}>
            <Text size="small" weight="plus">{x.name}</Text>
            <Field label={t("blogSeo.authors.jobTitle")}>
              <Input maxLength={120} value={d.translations[x.code].job_title} onChange={(e) => setT(x.code, "job_title", e.target.value)} style={{ height: 44 }} />
            </Field>
            <Field label={t("blogSeo.authors.bio")}>
              <Textarea rows={3} maxLength={2000} value={d.translations[x.code].bio} onChange={(e) => setT(x.code, "bio", e.target.value)} />
            </Field>
          </Container>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" isLoading={busy} style={{ minHeight: 40 }}>{isNew ? t("blogSeo.authors.add") : t("blogSeo.save")}</Button>
        <Button type="button" variant="secondary" onClick={onCancel} style={{ minHeight: 40 }}>{t("blogSeo.cancel")}</Button>
      </div>
    </form>
  )
}

const AuthorsPage = () => {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const prompt = usePrompt()
  const { codes, settings } = useBlogSettings()
  const [editing, setEditing] = useState<string | null>(null)
  const { data, isLoading, isError } = useQuery({ queryKey: AUTHORS_KEY, queryFn: api.listAuthors })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: AUTHORS_KEY })
    qc.invalidateQueries({ queryKey: POSTS_KEY })
  }
  const message = (e: unknown) => {
    const { code, message } = errorOf(e)
    return code ? t(`blogSeo.errors.${code}`, { defaultValue: message }) : message
  }
  const body = (d: Draft) => ({
    name: d.name,
    ...(d.slug ? { slug: d.slug } : {}),
    type: d.type,
    avatar: d.avatar,
    url: d.url || null,
    same_as: d.same_as.split(/\s+/).map((s) => s.trim()).filter(Boolean),
    translations: Object.fromEntries(Object.entries(d.translations).map(([code, tr]) => [code, { job_title: tr.job_title || null, bio: tr.bio || null }])),
  })
  const save = useMutation({
    mutationFn: ({ id, d }: { id: string | null; d: Draft }) => (id ? api.updateAuthor(id, body(d)) : api.createAuthor(body(d))),
    onSuccess: () => { toast.success(t("blogSeo.authors.saved")); setEditing(null); refresh() },
    onError: (e) => toast.error(message(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAuthor(id),
    onSuccess: () => { toast.success(t("blogSeo.authors.deleted")); refresh() },
    onError: (e) => toast.error(message(e)),
  })
  const askRemove = async (a: AdminAuthor) => {
    const ok = await prompt({ title: t("blogSeo.authors.confirmDelete", { name: a.name }), description: t("blogSeo.authors.confirmDeleteText", { count: a.post_count ?? 0 }), confirmText: t("blogSeo.delete"), cancelText: t("blogSeo.cancel") })
    if (ok) remove.mutate(a.id)
  }
  return (
    <div className="flex flex-col gap-y-3">
      <Link to="/blog-seo" className="txt-compact-small text-ui-fg-subtle flex items-center gap-1" style={{ minHeight: 32 }}>← Blog</Link>
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
          <div>
            <Heading>{t("blogSeo.authors.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle mt-1">{t("blogSeo.authors.description")}</Text>
          </div>
          {editing !== "new" && <Button style={{ minHeight: 40 }} onClick={() => setEditing("new")}>{t("blogSeo.authors.new")}</Button>}
        </div>
        {editing === "new" && settings && <AuthorForm isNew initial={toDraft(null, codes)} busy={save.isPending} onSave={(d) => save.mutate({ id: null, d })} onCancel={() => setEditing(null)} />}
        {isError ? (
          <div className="px-6 py-4"><Text size="small" className="text-ui-fg-error">{t("blogSeo.loadError")}</Text></div>
        ) : isLoading || !settings ? (
          <div className="px-6 py-6"><Text size="small" className="text-ui-fg-subtle">{t("blogSeo.loading")}</Text></div>
        ) : !data?.authors.length ? (
          <div className="px-6 py-6"><Text size="small">{t("blogSeo.authors.empty")}</Text></div>
        ) : (
          <ul className="divide-y">
            {data.authors.map((a) =>
              editing === a.id ? (
                <li key={a.id}><AuthorForm isNew={false} initial={toDraft(a, codes)} busy={save.isPending} onSave={(d) => save.mutate({ id: a.id, d })} onCancel={() => setEditing(null)} /></li>
              ) : (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-6 py-3" style={{ minHeight: 64 }}>
                  <span className="bg-ui-bg-subtle flex-none overflow-hidden rounded-full border" style={{ width: 40, height: 40 }}>{a.avatar ? <img src={a.avatar} alt="" className="size-full object-cover" /> : null}</span>
                  <div className="min-w-0 flex-1">
                    <Text size="small" weight="plus">{a.name} <span className="text-ui-fg-muted font-normal">· {t(`blogSeo.authors.${a.type}`)}</span></Text>
                    <Text size="xsmall" className="text-ui-fg-muted">{a.slug} · {t("blogSeo.categories.postCount", { count: a.post_count ?? 0 })}</Text>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" style={{ minHeight: 40 }} onClick={() => setEditing(a.id)}>{t("blogSeo.edit")}</Button>
                    <Button variant="secondary" style={{ minHeight: 40 }} onClick={() => askRemove(a)}>{t("blogSeo.delete")}</Button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </Container>
      <CreditFooter />
    </div>
  )
}

export const handle = { breadcrumb: () => "Authors" }
export default AuthorsPage
