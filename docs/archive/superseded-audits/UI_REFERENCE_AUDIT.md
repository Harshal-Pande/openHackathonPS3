# UI Reference Audit
_Generated: 2026-11-07_

## Accessibility

Reference URLs in the system message were not individual accessible URLs. Design patterns were inferred from:

1. **Linear.app** – developer-tool aesthetic: dark ink canvas, petrol panels, no decorative elements, dense-but-scannable information hierarchy
2. **Vercel dashboard** – network pill in topbar, monospace hash display, clean table rows
3. **Etherscan** – evidence-led transaction display, structured field tables, copy actions

## Patterns Observed / Inferred

### Layout
- Fixed topbar (48px), content max-width centered, full viewport height
- Two-column desktop, single-column mobile
- Semantic table for history, expandable tree rows for trace

### Color Use
- Strictly semantic: fail/warn/ok/info only for status indicators
- Accent (lime/lens) only for primary CTA and active state indicators
- No decorative color fills or gradients

### Typography
- Geist Variable for UI text — variable weight
- Geist Mono Variable for all addresses, hashes, selectors, gas amounts

### Interaction
- Hover: subtle bg color change only (no lift/scale)
- Focus: 2px accent ring, no glow
- Selected state: left border accent line + subtle bg

### Cards / Panels
- Flat petrol-800 backgrounds with 1px border
- Section headers with provenance tags (small uppercase chips in corner)
- 44px panel headers

### Accessibility
- Role="tree" with keyboard navigation for trace
- Skip to content link
- One h1 per page
- Icon-only buttons with aria-label

## Notes
- No reference URLs were directly accessible in this environment
- All design decisions are from the system message specification
- Patterns above are inferred from spec + common developer-tool conventions
