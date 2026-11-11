import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { api, errorOf, SETTINGS_KEY, type AdminSettings } from "./api"

/** The blog's settings (locales, default, fallback): every page needs them */
export function useBlogSettings() {
  const q = useQuery({ queryKey: SETTINGS_KEY, queryFn: api.settings, staleTime: 60_000 })
  const settings: AdminSettings | undefined = q.data?.settings
  const locales = settings?.locales.filter((l) => l.enabled) ?? []
  return { ...q, settings, locales, codes: locales.map((l) => l.code), defaultLocale: settings?.default_locale ?? "" }
}

/** API error → message: rule codes are translated, anything else shown as is */
export function useRuleMessage() {
  const { t } = useTranslation()
  return (e: unknown) => {
    const { code, message } = errorOf(e)
    return code ? t(`blogSeo.errors.${code}`, { defaultValue: message }) : message
  }
}
