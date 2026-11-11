import { Button, Text, toast } from "@medusajs/ui"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { uploadImage } from "../lib/api"
import { Field } from "./states"

/** Image upload tile (covers, OG image, avatar) */
export function CoverField({ label, hint, value, ratio, kind, onChange, maxWidth = 320 }: { label: string; hint?: string; value: string | null; ratio: string; kind: "cover" | "og" | "avatar"; onChange: (url: string | null) => void; maxWidth?: number }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onChange((await uploadImage(file, kind)).url)
    } catch (e) {
      const m = (e as Error).message
      toast.error(m === "not_image" ? t("blogSeo.upload.notImage") : m === "too_large" ? t("blogSeo.upload.tooLarge") : m)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Field label={label} hint={hint}>
      <div className="bg-ui-bg-subtle flex items-center justify-center overflow-hidden rounded-lg border" style={{ aspectRatio: ratio, maxWidth }}>
        {value ? <img src={value} alt="" className="size-full object-cover" /> : <Text size="xsmall" className="text-ui-fg-muted">{t("blogSeo.upload.none")}</Text>}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" isLoading={busy} style={{ minHeight: 40 }} onClick={() => ref.current?.click()}>
          {value ? t("blogSeo.upload.replace") : t("blogSeo.upload.choose")}
        </Button>
        {value && <Button type="button" variant="transparent" style={{ minHeight: 40 }} onClick={() => onChange(null)}>{t("blogSeo.upload.remove")}</Button>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
    </Field>
  )
}
