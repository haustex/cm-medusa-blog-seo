import { Spinner } from "@medusajs/icons"
import { Label, Text } from "@medusajs/ui"

export const Loading = () => (
  <div className="flex items-center justify-center p-8">
    <Spinner className="animate-spin text-ui-fg-muted" />
  </div>
)

export const Field = ({ label, hint, count, children, htmlFor }: { label: string; hint?: React.ReactNode; count?: string; children: React.ReactNode; htmlFor?: string }) => (
  <div className="flex flex-col gap-1">
    <div className="bseo-baseline flex justify-between gap-2">
      <Label size="xsmall" weight="plus" htmlFor={htmlFor}>{label}</Label>
      {count && <Text size="xsmall" className="text-ui-fg-muted tabular-nums">{count}</Text>}
    </div>
    {children}
    {hint && <Text size="xsmall" className="text-ui-fg-muted">{hint}</Text>}
  </div>
)

export const BackLink = ({ to, label }: { to: string; label: string }) => (
  <a href={to} className="txt-compact-small text-ui-fg-subtle flex items-center gap-1" style={{ minHeight: 32 }} onClick={(e) => { e.preventDefault(); window.history.length > 1 ? window.history.back() : (window.location.hash = to) }}>
    ← {label}
  </a>
)
