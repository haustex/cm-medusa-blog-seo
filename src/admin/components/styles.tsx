/**
 * Layout rules the plugin needs that the Admin's own stylesheet may not contain: Medusa's Tailwind build only
 * scans the dashboard, not plugin extensions, so arbitrary grid templates written as utility classes never
 * exist at runtime. Rendered once per page.
 */
export const BseoStyles = () => (
  <style>{`
.bseo-cols-2, .bseo-cols-filters, .bseo-cols-editor, .bseo-cols-locale { display: grid; grid-template-columns: minmax(0, 1fr); }
.bseo-active { border-color: var(--fg-base); }
.bseo-baseline { align-items: baseline; }
.bseo-maxh { max-height: 70vh; }
@media (min-width: 640px) {
  .bseo-cols-filters { grid-template-columns: minmax(0, 1fr) 200px 200px; }
  .bseo-cols-locale { grid-template-columns: 72px minmax(0, 1fr) 110px auto auto; }
  .bseo-cols-2.bseo-sm { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .bseo-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bseo-cols-editor { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; }
}
`}</style>
)
