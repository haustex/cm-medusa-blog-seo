import { useQuery } from "@tanstack/react-query"
import { api, SETTINGS_KEY, type AdminSettings } from "./api"

/** The blog's settings (locales, default, fallback): every page needs them */
export function useBlogSettings() {
  const q = useQuery({ queryKey: SETTINGS_KEY, queryFn: api.settings, staleTime: 60_000 })
  const settings: AdminSettings | undefined = q.data?.settings
  const locales = settings?.locales.filter((l) => l.enabled) ?? []
  return { ...q, settings, locales, codes: locales.map((l) => l.code), defaultLocale: settings?.default_locale ?? "" }
}
