import { Drawer, Input, Text } from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { KEY, searchProducts, type ProductLite } from "../lib/api"

/** Thumbnail of a product (or an empty box) */
export const ProductThumb = ({ src, size = 44 }: { src: string | null | undefined; size?: number }) => (
  <span style={{ width: size, height: size }} className="bg-ui-bg-subtle flex flex-none items-center justify-center overflow-hidden rounded-md border">
    {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover" /> : null}
  </span>
)

/** Pick one product from the catalogue (search by name): product cards in the text and related products */
export function ProductPicker({ open, onClose, onPick, exclude = [], title }: { open: boolean; onClose: () => void; onPick: (p: ProductLite) => void; exclude?: string[]; title?: string }) {
  const { t } = useTranslation()
  const [input, setInput] = useState("")
  const [q, setQ] = useState("")
  useEffect(() => {
    const h = setTimeout(() => setQ(input), 300)
    return () => clearTimeout(h)
  }, [input])
  useEffect(() => {
    if (!open) setInput("")
  }, [open])
  const { data, isLoading, isError } = useQuery({ queryKey: [...KEY, "product-search", q], queryFn: () => searchProducts(q), enabled: open, placeholderData: keepPreviousData })
  const rows = (data ?? []).filter((p) => !exclude.includes(p.id))
  return (
    <Drawer open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{title ?? t("blogSeo.products.pick")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-3 overflow-y-auto">
          <Input type="search" autoFocus placeholder={t("blogSeo.products.search")} value={input} onChange={(e) => setInput(e.target.value)} style={{ height: 44 }} />
          {isError ? (
            <Text size="small" className="text-ui-fg-error">{t("blogSeo.loadError")}</Text>
          ) : isLoading ? (
            <Text size="small" className="text-ui-fg-subtle">{t("blogSeo.loading")}</Text>
          ) : !rows.length ? (
            <Text size="small" className="text-ui-fg-subtle">{t("blogSeo.products.none")}</Text>
          ) : (
            <ul className="divide-y">
              {rows.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPick(p)} style={{ minHeight: 56 }} className="hover:bg-ui-bg-base-hover flex w-full items-center gap-3 rounded-md px-1 py-2 text-left">
                    <ProductThumb src={p.thumbnail} />
                    <span className="min-w-0 flex-1">
                      <Text size="small" weight="plus" className="truncate">{p.title}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">{p.status === "published" ? t("blogSeo.products.live") : t("blogSeo.products.draft")}</Text>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}
