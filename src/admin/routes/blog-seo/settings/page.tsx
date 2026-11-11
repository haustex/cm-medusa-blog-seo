import { Badge, Button, Container, Heading, Input, Select, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { CreditFooter } from "../../../components/credit-footer"
import { Field } from "../../../components/states"
import { api, errorOf, POSTS_KEY, SETTINGS_KEY, type AdminSettings } from "../../../lib/api"
import { useBlogSettings } from "../../../lib/use-settings"

type LocaleRow = { code: string; name: string; dir: "ltr" | "rtl"; enabled: boolean }

function SettingsForm({ initial }: { initial: AdminSettings }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [locales, setLocales] = useState<LocaleRow[]>(initial.locales.map(({ code, name, dir, enabled }) => ({ code, name, dir, enabled })))
  const [defaultLocale, setDefaultLocale] = useState(initial.default_locale)
  const [fallback, setFallback] = useState(initial.fallback)
  const [newCode, setNewCode] = useState("")
  const locked = initial.locked
  useEffect(() => {
    if (!locales.some((l) => l.enabled && l.code === defaultLocale)) setDefaultLocale(locales.find((l) => l.enabled)?.code ?? "")
  }, [locales])

  const save = useMutation({
    mutationFn: () => api.saveSettings({ ...(locked.locales ? {} : { locales }), ...(locked.default_locale ? {} : { default_locale: defaultLocale }), ...(locked.fallback ? {} : { fallback }) }),
    onSuccess: () => {
      toast.success(t("blogSeo.settings.saved"))
      qc.invalidateQueries({ queryKey: SETTINGS_KEY })
      qc.invalidateQueries({ queryKey: POSTS_KEY })
    },
    onError: (e) => {
      const { code, message } = errorOf(e)
      toast.error(code ? t(`blogSeo.errors.${code}`, { defaultValue: message }) : message)
    },
  })
  const move = (i: number, d: -1 | 1) => {
    const next = [...locales]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setLocales(next)
  }
  const add = () => {
    const code = newCode.trim()
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(code)) return toast.error(t("blogSeo.settings.badCode"))
    if (locales.some((l) => l.code.toLowerCase() === code.toLowerCase())) return toast.error(t("blogSeo.settings.duplicate"))
    setLocales([...locales, { code, name: "", dir: "ltr", enabled: true }])
    setNewCode("")
  }
  const upd = (i: number, patch: Partial<LocaleRow>) => setLocales(locales.map((l, k) => (k === i ? { ...l, ...patch } : l)))

  return (
    <Container className="flex flex-col gap-5 px-6 py-4">
      <div>
        <Heading level="h2">{t("blogSeo.settings.locales")}</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">{t("blogSeo.settings.localesHelp")}</Text>
        {locked.locales && <Badge size="2xsmall" color="grey" className="mt-2">{t("blogSeo.settings.lockedByOptions")}</Badge>}
      </div>
      <ul className="divide-y rounded-lg border">
        {locales.map((l, i) => (
          <li key={l.code} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[72px_1fr_110px_auto_auto]">
            <Text size="small" weight="plus" className="font-mono">{l.code}</Text>
            <Input value={l.name} disabled={locked.locales} placeholder={t("blogSeo.settings.nameAuto")} maxLength={80} onChange={(e) => upd(i, { name: e.target.value })} style={{ height: 40 }} aria-label={t("blogSeo.settings.localeName")} />
            <Select value={l.dir} disabled={locked.locales} onValueChange={(v) => upd(i, { dir: v as "ltr" | "rtl" })}>
              <Select.Trigger style={{ height: 40 }} aria-label={t("blogSeo.settings.direction")}><Select.Value /></Select.Trigger>
              <Select.Content>
                <Select.Item value="ltr">LTR</Select.Item>
                <Select.Item value="rtl">RTL</Select.Item>
              </Select.Content>
            </Select>
            <label className="flex items-center gap-2" style={{ minHeight: 40 }}>
              <Switch checked={l.enabled} disabled={locked.locales} onCheckedChange={(v) => upd(i, { enabled: v })} />
              <Text size="xsmall">{t("blogSeo.settings.enabled")}</Text>
            </label>
            <div className="flex gap-1">
              <Button type="button" variant="secondary" size="small" disabled={locked.locales || i === 0} onClick={() => move(i, -1)} aria-label={t("blogSeo.settings.up")}>↑</Button>
              <Button type="button" variant="secondary" size="small" disabled={locked.locales || i === locales.length - 1} onClick={() => move(i, 1)} aria-label={t("blogSeo.settings.down")}>↓</Button>
              <Button type="button" variant="secondary" size="small" disabled={locked.locales || locales.length === 1} onClick={() => setLocales(locales.filter((_, k) => k !== i))} aria-label={t("blogSeo.delete")}>✕</Button>
            </div>
          </li>
        ))}
      </ul>
      {!locked.locales && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("blogSeo.settings.addLocale")} hint={t("blogSeo.settings.addLocaleHint")}>
            <Input value={newCode} placeholder="pt-BR" maxLength={16} onChange={(e) => setNewCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} style={{ height: 40, maxWidth: 160 }} />
          </Field>
          <Button type="button" variant="secondary" style={{ minHeight: 40 }} onClick={add}>{t("blogSeo.add")}</Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("blogSeo.settings.defaultLocale")} hint={t("blogSeo.settings.defaultLocaleHelp")}>
          <Select value={defaultLocale} disabled={locked.default_locale} onValueChange={setDefaultLocale}>
            <Select.Trigger style={{ height: 44 }}><Select.Value /></Select.Trigger>
            <Select.Content>{locales.filter((l) => l.enabled).map((l) => <Select.Item key={l.code} value={l.code}>{l.name || l.code}</Select.Item>)}</Select.Content>
          </Select>
        </Field>
        <Field label={t("blogSeo.settings.fallback")} hint={t(`blogSeo.settings.fallbackHelp.${fallback}`)}>
          <Select value={fallback} disabled={locked.fallback} onValueChange={(v) => setFallback(v as typeof fallback)}>
            <Select.Trigger style={{ height: 44 }}><Select.Value /></Select.Trigger>
            <Select.Content>
              <Select.Item value="default">{t("blogSeo.settings.fallbackMode.default")}</Select.Item>
              <Select.Item value="label">{t("blogSeo.settings.fallbackMode.label")}</Select.Item>
              <Select.Item value="hide">{t("blogSeo.settings.fallbackMode.hide")}</Select.Item>
            </Select.Content>
          </Select>
        </Field>
      </div>
      <div>
        <Text size="small" weight="plus">{t("blogSeo.settings.routing")}</Text>
        <Text size="xsmall" className="text-ui-fg-muted">{t("blogSeo.settings.routingHelp")}</Text>
        <pre className="bg-ui-bg-subtle mt-2 overflow-x-auto rounded-md border p-3 text-xs">{JSON.stringify(initial.routing, null, 2)}</pre>
      </div>
      <div>
        <Text size="small" weight="plus">{t("blogSeo.settings.imageOrigins")}</Text>
        <Text size="xsmall" className="text-ui-fg-muted">{initial.image_origins.join(", ") || "–"}</Text>
      </div>
      <Button className="self-start" style={{ minHeight: 44 }} isLoading={save.isPending} disabled={locked.locales && locked.default_locale && locked.fallback} onClick={() => save.mutate()}>{t("blogSeo.save")}</Button>
    </Container>
  )
}

const SettingsPage = () => {
  const { t } = useTranslation()
  const { settings, isLoading, isError } = useBlogSettings()
  return (
    <div className="flex flex-col gap-y-3">
      <Link to="/blog-seo" className="txt-compact-small text-ui-fg-subtle flex items-center gap-1" style={{ minHeight: 32 }}>← Blog</Link>
      <Container className="px-6 py-4">
        <Heading>{t("blogSeo.settings.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">{t("blogSeo.settings.description")}</Text>
      </Container>
      {isError ? <Container className="px-6 py-4"><Text size="small" className="text-ui-fg-error">{t("blogSeo.loadError")}</Text></Container> : isLoading || !settings ? <Container className="px-6 py-6"><Text size="small" className="text-ui-fg-subtle">{t("blogSeo.loading")}</Text></Container> : <SettingsForm key={JSON.stringify(settings)} initial={settings} />}
      <CreditFooter />
    </div>
  )
}

export const handle = { breadcrumb: () => "Settings" }
export default SettingsPage
