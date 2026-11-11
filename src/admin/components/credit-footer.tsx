import { Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { api, CONFIG_KEY } from "../lib/api"
import { CREDIT_URL, SUPPORT_URL } from "../lib/branding"

/** Small plugin credit under the plugin's own pages; shown only with the plugin option `showCredit: true`. */
export const CreditFooter = () => {
  const { t } = useTranslation()
  const { data } = useQuery({ queryKey: CONFIG_KEY, queryFn: api.config, staleTime: Infinity })
  if (!data?.show_credit) return null
  return (
    <div className="px-6 py-4 text-center">
      <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
        <a href={CREDIT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ui-fg-subtle">{t("blogSeo.credit.text")}</a>
        {" · "}
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-ui-fg-subtle">{t("blogSeo.credit.help")}</a>
      </Text>
    </div>
  )
}
