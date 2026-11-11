import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Select, Text, toast } from "@medusajs/ui"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { CreditFooter } from "../../components/credit-footer"
import { api, CATEGORIES_KEY, errorOf, formatDateTime, lang, POSTS_KEY, STATUS_COLOR, STATUSES, type AdminPost, type PostStatus } from "../../lib/api"
import { useBlogSettings } from "../../lib/use-settings"

const PAGE_SIZE = 20

/** Title of a post for lists: default locale first, then any locale that has one */
const postTitle = (p: AdminPost, defaultLocale: string, fallback: string) => p.translations[defaultLocale]?.title || Object.values(p.translations).find((t) => t.title)?.title || fallback

const BlogPage = () => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get("status") ?? ""
  const category = params.get("category") ?? ""
  const missing = params.get("missing") ?? ""
  const q = params.get("q") ?? ""
  const offset = Math.max(Number(params.get("offset")) || 0, 0)
  const [search, setSearch] = useState(q)
  const { settings, locales, defaultLocale } = useBlogSettings()

  const setFilter = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    next.delete("offset")
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k)
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const h = setTimeout(() => (search.trim() !== q ? setFilter({ q: search.trim() || null }) : undefined), 350)
    return () => clearTimeout(h)
  }, [search])

  const { data: cats } = useQuery({ queryKey: CATEGORIES_KEY, queryFn: api.listCategories })
  const { data, isLoading, isError } = useQuery({
    queryKey: [...POSTS_KEY, status, category, missing, q, offset],
    queryFn: () => api.listPosts({ limit: PAGE_SIZE, offset, status: (status || undefined) as PostStatus | undefined, category_id: category || undefined, missing_locale: missing || undefined, q: q || undefined }),
    placeholderData: keepPreviousData,
  })
  const create = useMutation({
    mutationFn: () => api.createPost({}),
    onSuccess: (res) => navigate(`/blog-seo/${res.post.id}`),
    onError: (e) => toast.error(errorOf(e).message),
  })

  const counts = data?.counts
  const total = counts ? STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0) : 0
  const chip = (active: boolean) => `flex flex-none flex-col items-start justify-center rounded-lg border px-3 py-2 text-left ${active ? "border-ui-fg-base bg-ui-bg-base-pressed" : "bg-ui-bg-base"}`
  const filtered = !!(status || category || q || missing)
  const catName = (c: { translations: Record<string, { name: string }> }) => c.translations[defaultLocale]?.name ?? Object.values(c.translations)[0]?.name ?? ""

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
          <div>
            <Heading>{t("blogSeo.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle mt-1">{t("blogSeo.description", { locales: locales.map((x) => x.name).join(", ") || "–" })}</Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/blog-seo/categories"><Button variant="secondary" style={{ minHeight: 40 }}>{t("blogSeo.nav.categories")}</Button></Link>
            <Link to="/blog-seo/authors"><Button variant="secondary" style={{ minHeight: 40 }}>{t("blogSeo.nav.authors")}</Button></Link>
            <Link to="/blog-seo/settings"><Button variant="secondary" style={{ minHeight: 40 }}>{t("blogSeo.nav.settings")}</Button></Link>
            <Button style={{ minHeight: 40 }} isLoading={create.isPending} onClick={() => create.mutate()}>{t("blogSeo.newPost")}</Button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-6 py-3">
          <button type="button" style={{ minHeight: 48, minWidth: 88 }} className={chip(!status)} onClick={() => setFilter({ status: null })}>
            <Text size="xsmall" className="text-ui-fg-subtle">{t("blogSeo.status.all")}</Text>
            <Text weight="plus">{total}</Text>
          </button>
          {STATUSES.map((s) => (
            <button key={s} type="button" style={{ minHeight: 48, minWidth: 88 }} className={chip(status === s)} onClick={() => setFilter({ status: status === s ? null : s })}>
              <Text size="xsmall" className="text-ui-fg-subtle">{t(`blogSeo.status.${s}`)}</Text>
              <Text weight="plus">{counts?.[s] ?? 0}</Text>
            </button>
          ))}
        </div>

        <div className="grid gap-2 px-6 py-3 sm:grid-cols-[1fr_200px_200px]">
          <Input type="search" placeholder={t("blogSeo.search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ height: 44 }} />
          <Select value={category || "all"} onValueChange={(v) => setFilter({ category: v === "all" ? null : v })}>
            <Select.Trigger style={{ height: 44 }} aria-label={t("blogSeo.fields.category")}><Select.Value /></Select.Trigger>
            <Select.Content>
              <Select.Item value="all">{t("blogSeo.filters.allCategories")}</Select.Item>
              {(cats?.categories ?? []).map((c) => <Select.Item key={c.id} value={c.id}>{catName(c)}</Select.Item>)}
              <Select.Item value="none">{t("blogSeo.filters.noCategory")}</Select.Item>
            </Select.Content>
          </Select>
          <Select value={missing || "all"} onValueChange={(v) => setFilter({ missing: v === "all" ? null : v })}>
            <Select.Trigger style={{ height: 44 }} aria-label={t("blogSeo.filters.missing")}><Select.Value /></Select.Trigger>
            <Select.Content>
              <Select.Item value="all">{t("blogSeo.filters.anyTranslation")}</Select.Item>
              {locales.map((x) => <Select.Item key={x.code} value={x.code}>{t("blogSeo.filters.missingIn", { locale: x.name })}</Select.Item>)}
            </Select.Content>
          </Select>
        </div>

        {isError ? (
          <div className="px-6 py-4"><Text size="small" className="text-ui-fg-error">{t("blogSeo.loadError")}</Text></div>
        ) : isLoading || !settings ? (
          <div className="px-6 py-6"><Text size="small" className="text-ui-fg-subtle">{t("blogSeo.loading")}</Text></div>
        ) : !data?.count ? (
          <div className="px-6 py-6"><Text size="small">{filtered ? t("blogSeo.emptyFiltered") : t("blogSeo.empty")}</Text></div>
        ) : (
          <ul className="divide-y">
            {data.posts.map((p) => {
              const title = postTitle(p, defaultLocale, t("blogSeo.untitled"))
              const when = p.status === "published" ? t("blogSeo.publishedAt", { date: formatDateTime(p.published_at, l) }) : p.status === "scheduled" ? t("blogSeo.scheduledFor", { date: formatDateTime(p.published_at, l) }) : t("blogSeo.changedAt", { date: formatDateTime(p.updated_at, l) })
              const incomplete = p.completeness.locales.filter((x) => x.missing.length).map((x) => x.locale)
              return (
                <li key={p.id}>
                  <Link to={`/blog-seo/${p.id}`} className="hover:bg-ui-bg-base-hover flex items-center gap-3 px-6 py-3" style={{ minHeight: 72 }}>
                    <span className="bg-ui-bg-subtle flex-none overflow-hidden rounded-md border" style={{ width: 56, height: 56 }}>
                      {p.cover ? <img src={p.cover} alt="" loading="lazy" className="size-full object-cover" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <Text size="small" weight="plus" className="truncate">{title}</Text>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge size="2xsmall" color={STATUS_COLOR[p.status]}>{t(`blogSeo.status.${p.status}`)}</Badge>
                        {!p.completeness.publishable && <Badge size="2xsmall" color="orange">{t("blogSeo.incomplete")}</Badge>}
                        {p.featured && <Badge size="2xsmall" color="blue">{t("blogSeo.featured")}</Badge>}
                        {locales.map((x) => (
                          <Badge key={x.code} size="2xsmall" color={incomplete.includes(x.code) ? "grey" : "green"} title={incomplete.includes(x.code) ? t("blogSeo.localeIncomplete", { locale: x.name }) : t("blogSeo.localeComplete", { locale: x.name })}>
                            {x.code}
                          </Badge>
                        ))}
                      </span>
                      <Text size="xsmall" className="text-ui-fg-muted truncate">{when}</Text>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {data && data.count > PAGE_SIZE && (
          <div className="flex items-center justify-between px-6 py-3">
            <Text size="small" className="text-ui-fg-subtle">{t("blogSeo.pagination", { from: offset + 1, to: Math.min(offset + PAGE_SIZE, data.count), total: data.count })}</Text>
            <div className="flex gap-2">
              <Button variant="secondary" style={{ minHeight: 40, minWidth: 44 }} disabled={offset === 0} aria-label={t("blogSeo.prev")} onClick={() => setParams((prev) => (prev.set("offset", String(Math.max(0, offset - PAGE_SIZE))), prev))}>‹</Button>
              <Button variant="secondary" style={{ minHeight: 40, minWidth: 44 }} disabled={offset + PAGE_SIZE >= data.count} aria-label={t("blogSeo.next")} onClick={() => setParams((prev) => (prev.set("offset", String(offset + PAGE_SIZE)), prev))}>›</Button>
            </div>
          </div>
        )}
      </Container>
      <CreditFooter />
    </div>
  )
}

export const config = defineRouteConfig({ label: "Blog", icon: BookOpen })
export const handle = { breadcrumb: () => "Blog" }
export default BlogPage
