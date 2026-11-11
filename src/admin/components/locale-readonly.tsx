import { Badge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import type { TranslationFields } from "../lib/api"

/** The default language's text next to the one being edited (side-by-side mode): read-only */
export function LocaleReadOnly({ code, name, dir, t: tr }: { code: string; name: string; dir: "ltr" | "rtl"; t: TranslationFields }) {
  const { t } = useTranslation()
  return (
    <div className="bg-ui-bg-subtle flex min-w-0 flex-col gap-3 rounded-lg border p-4" dir={dir} data-bseo={`readonly-${code}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="plus">{name}</Text>
        <Badge size="2xsmall" color="grey">{code}</Badge>
        <Badge size="2xsmall" color="blue">{t("blogSeo.defaultLocale")}</Badge>
        <Text size="xsmall" className="text-ui-fg-muted">{t("blogSeo.readOnly")}</Text>
      </div>
      <Text size="small" className="text-ui-fg-muted">{t("blogSeo.fields.title")}</Text>
      <Text size="large" weight="plus">{tr.title || "–"}</Text>
      <Text size="small" className="text-ui-fg-muted">{t("blogSeo.fields.excerpt")}</Text>
      <Text size="small">{tr.excerpt || "–"}</Text>
      <Text size="small" className="text-ui-fg-muted">{t("blogSeo.fields.body")}</Text>
      <div className="bseo-prose bseo-maxh overflow-y-auto rounded-md border bg-ui-bg-base" dangerouslySetInnerHTML={{ __html: tr.body || "<p>–</p>" }} />
    </div>
  )
}
