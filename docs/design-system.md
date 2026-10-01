# Design system: "light breaking through"

The live reference is **`/dev/components`**, which shows every component in every state, in either theme.

## Tokens (`src/styles/tokens.css`)

| Token                   | Light                   | Dark                   | Use                                            |
| ----------------------- | ----------------------- | ---------------------- | ---------------------------------------------- |
| `--color-bg`            | `#f5f3fa` pre-dawn mist | `#13112b` indigo night | Page background                                |
| `--color-surface`       | `#ffffff`               | `#1d1a3d`              | Cards, sheets, bars                            |
| `--color-ink`           | `#1d1940`               | `#efecfa`              | Text                                           |
| `--color-ink-muted`     | `#57527a`               | `#b9b3d9`              | Secondary text (≥ 4.5:1)                       |
| `--color-primary`       | `#3b3391` indigo        | `#f2c14e` gold         | Primary actions, focus ring                    |
| `--color-accent`        | `#e6a82e` gold          | `#f2c14e`              | Fills: clean days, check-in, pressed reactions |
| `--color-accent-strong` | `#a86e00`               | `#f2c14e`              | Graphics that need 3:1 (ring arc, borders)     |
| `--color-slip`          | `#7a4b83` soft plum     | `#d7b3de`              | A slip: never red                              |

Every text/background pair is checked against WCAG 2.2 AA in `src/styles/__tests__/tokens.test.ts`, in both themes.

Type uses a major-third scale (`--text-xs` … `--text-4xl`). Spacing is on a 4 px grid (`--space-1` … `--space-8`). Radius is rounder the smaller the element: pills for buttons, `--radius-lg` for cards. Shadows are tinted indigo. Motion tokens drop to `0ms` under `prefers-reduced-motion`.

## Principles

1. **One flourish.** The dawn horizon (a 3 px indigo → rose → gold line) and the rising-sun mark carry the brand. Everything else stays quiet.
2. **Grace in colour.** Clean days are gold. A slip is a soft plum ring with a dot, never red and never an ✕. A missed day is a dotted outline labelled "No check-in".
3. **Shape, not just colour.** Every state is also told by shape and text, and in forced-colours mode.
4. **Big targets.** Interactive controls are at least 44 × 44 px.

## States

Each component documents default, hover, focus, active, disabled, loading and error. Where a state doesn't apply, the gallery says why. Hover, focus and active can be forced with `data-preview` for review, but only in the gallery.
