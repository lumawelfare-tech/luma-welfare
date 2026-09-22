# Luma Design System

Extracted from the live UI (`frontend/src/index.css` + glass surfaces). **Do not invent new brand hues** — extend tokens only when matching an existing screen.

## Tokens

Defined in `@theme` (`frontend/src/index.css`).

| Category | Tokens | Notes |
|----------|--------|--------|
| Brand | `--color-luma-50…950`, `--color-brand-blue*` | Primary green `#006B2E` (`luma-700`) |
| Status | `--color-status-success/warning/error/info/neutral` | Prefer `StatusBadge` over ad-hoc colors |
| Surfaces | `--color-surface-page`, `--color-surface-page-mid`, `--color-text-primary` | Page atmosphere + body text |
| Spacing | `--space-1…8` | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 |
| Radius | `--radius-sm`, `--radius-control`, `--radius-card`, `--radius-lg`, `--radius-xl` | Buttons → modals |
| Shadow | `--shadow-subtle`, `--shadow-card`, `--shadow-elevated`, `--shadow-modal` | Glass hierarchy |
| Motion | `--motion-micro/fast/normal/section/hero/data` | Sync with `frontend/src/lib/lumaMotion.ts` |
| Glass | `--glass-bg`, `--glass-border`, `--glass-blur*` | Marketing + auth surfaces |

Use CSS vars or Tailwind theme colors (`bg-luma-700`, `text-luma-900`). Prefer named spacing/radius over one-off arbitrary values when touching a screen.

## Primitives

| Component | Path | Maps to |
|-----------|------|---------|
| `Button` | `components/ui/Button.tsx` | `.luma-btn` + variants |
| `buttonClassName()` | same | Links / anchors matching button look |
| `Input` | `components/ui/Input.tsx` | `.glass-input` / admin border |
| `Card` | `components/ui/Card.tsx` | `.glass-card` / `.glass-panel` / interactive |
| `Skeleton*` | `components/Skeleton.tsx` | `.luma-skeleton` (not `animate-pulse`) |
| `EmptyState` / `ErrorState` | `components/` | Shared empty/error surfaces |

```tsx
import { Button, Input, Card, buttonClassName } from '../components/ui'

<Button variant="primary" size="md" loading={busy}>Save</Button>
<Link to="/register" className={buttonClassName({ variant: 'primary', size: 'lg' })}>Join</Link>
<Input label="Email" type="email" error={err} />
<Card variant="panel">…</Card>
```

### Button variants

- `primary` — solid luma-700 (CTAs)
- `secondary` — glass/white border (Google, cancel-adjacent)
- `ghost` — text-only luma
- `danger` — status-error fill

Sizes: `sm` | `md` | `lg`. Use `block` for full-width auth forms.

### Input

- `appearance="glass"` (default) — auth/marketing
- `appearance="admin"` — denser bordered fields
- Wire `label`, `hint`, `error` for a11y (`aria-invalid` / `aria-describedby`)

`fieldClass` / `fieldAdminClass` are also exported for textarea / custom controls. `PageHero` re-exports `fieldClass` for existing pages.

## Motion

Use `lumaMotion` presets and CSS `--motion-*`. Loading placeholders use `.luma-skeleton` / `Skeleton*` components. Keep intentional attention pulses (e.g. pending payment) only where they already convey live status — do not use `animate-pulse` for layout loading.

Route transitions: `PageTransition` on public, member, and admin layouts.

## Migration rule

When editing a screen, prefer shared primitives over duplicating `bg-luma-700 rounded-xl` or raw `animate-pulse` loaders. No visual redesign unless a phase explicitly says so.
