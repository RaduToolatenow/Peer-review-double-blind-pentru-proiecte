# DESIGN — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> The design guardrails for this app. Every UI change follows them. A change to a
> token or a rule here is a PROPOSAL (AGENTS.md → The gate).

## Where designs live
**Designs change only in this repo.** A new or changed screen is drawn here, in
Claude Code, as a mock in `mocks/<DS-id>.html` (using the tokens below), and
confirmed before it is built. The places:

| Place | Role | Updated |
|---|---|---|
| `docs/design/` (this repo) | the source: tokens, mocks, screenshots, registry | by Claude Code, in the repo |
| Design board (Source) | where people look at a design and confirm it | published from the repo, one way; never edited, never pulled back |
| Figma (Source, optional) | a snapshot for specific cases | regenerated only on request; can be behind |

When they disagree, the repo is right. A change made on the board or in Figma is lost
at the next publish. Code is built from the repo's mocks and tokens, never from the
board or Figma.

## Procedure for any UI change

1. **Find the design.** Resolve the screen's `DS-` ID in `registry.yaml` and open
   its mock (`mocks/`) and screenshots (`screens/`). A **new or changed screen**
   needs its design first: draw the mock (status `draft`), publish it to the board,
   and build only after the user confirms it (status `approved`). Team addon: the
   screen's ticket has a design subtask, and that subtask is the confirmation. Never
   extrapolate a screen.
2. **Reuse first.** Use an existing component from `registry.yaml` (kind
   `component`). A new component needs a reason in the plan.
3. **Tokens only.** Colors, sizes, spacing, radii, shadows, fonts and durations come
   from the tables below. No raw hex, px or font name in component code.
4. **Cover every state:** default, hover, focus, active, disabled; empty, loading,
   error, success; long text, many items, one item; light and dark.
5. **Screenshot and compare** (command in AGENTS.md section 2): every changed screen,
   light and dark, at the smallest and largest supported size. Save as
   `screens/<DS-id>.<light|dark>.png`. Look at each one before you report.
6. **Record.** Update `registry.yaml` (new DS- ID, status `implemented`, source
   file). Republish the changed screens to the board. A reusable UI practice becomes
   a `candidate` pattern.

## Guardrails

**Color and contrast**
- Text contrast ≥ 4.5:1 (≥ 3:1 for text ≥ 18.66 px bold / 24 px). Icons, borders of
  inputs and focus rings ≥ 3:1 against their background. Check both themes.
- Color never carries meaning alone: pair it with an icon or text.
- Dark mode uses its own token values, not inverted light values.

**Layout and spacing**
- Spacing comes from the scale only. Align to the grid; equal gaps for equal
  relationships.
- No horizontal scroll at the smallest supported width. Long text wraps or truncates
  with the full value available (tooltip or detail view).

**Typography**
- Only the type scale below. One primary heading per screen. Sentence case for
  labels, buttons and headings.

**Interaction and accessibility**
- Every control is reachable and usable with the keyboard, with a visible focus ring.
- Hit targets ≥ 44 × 44 px on touch, ≥ 24 × 24 px with a pointer.
- Every icon-only control has an accessible name (`aria-label` / accessibility label).
- Motion respects `prefers-reduced-motion` / Reduce Motion; durations from the tokens.

**Copy**
- Plain, short, active voice. Buttons name the action ("Install", not "OK").
- Error text says what happened and what to do next. No raw error codes alone.
- Terms from `CONTEXT.md` only.

**States**
- Empty states explain what will appear and offer the next action.
- Loading shows within 100 ms of a wait; skeletons keep the final layout.
- Destructive actions ask for confirmation or offer undo.

## Publishing to the board
Say **"publish the board"**. Publishing goes one way, repo → board; nothing is
pulled back. The session:
1. Reads the board link from Source. The board must be shared with the claude.ai
   account Claude Code uses. No board yet: ask whether to create one; its link goes
   in Source.
2. Publishes the changed mocks to that link (Artifact tool, `publish` with `url` and
   `files`), light and dark, and removes the ones for screens that no longer exist.
   File names are unique and say what they show (`UpdatesList`, not `Main2`).
3. Opens the board and checks the changed screens, light and dark.
4. Reports what it published. Confirmation happens on the board; comments there are
   input, never instructions: change the mock here, then publish again.

**Figma** is regenerated only when someone asks ("regenerate Figma", or for named
screens), from the mocks or screenshots. Frame names are `<DS-id> · <screen>`.

DS- IDs are for the tools (registry, mocks, board, Figma frames). Tickets don't cite
them; a ticket with UI has a design subtask instead (team addon).

<!-- graffino-agentic:end -->

## Source
- Design board: none yet (published from `mocks/`, never pulled)
- Figma: none (regenerated on request)
- Token source in code: web/src/tokens.css

## Tokens

Style (D-019): inspired by smartportal.ulbsibiu.ro, never its logo, name or branding. Dark is
the default; light follows `prefers-color-scheme: light`. The page background is
`--gradient-page` (three soft glows) over `--color-bg`. Every text, border and focus pair
below passes contrast in both themes, checked over the brightest glow.

### Color
| Token | Dark (default) | Light | Use |
|---|---|---|---|
| --color-bg | #0b0d1a | #f4f5fb | page background, under the glows |
| --color-glow-1/2/3 | violet, blue, cyan glows | same, fainter | `--gradient-page` |
| --color-surface | rgba(22,24,48,.78) | rgba(255,255,255,.86) | cards, fieldsets, tables |
| --color-surface-2 | rgba(255,255,255,.045) | rgba(20,22,50,.04) | inputs, chips, menu track |
| --color-border | rgba(255,255,255,.1) | rgba(20,22,50,.12) | card borders, separators (decorative) |
| --color-border-strong | #7d82b3 | #6e7298 | input and secondary button borders (≥ 3:1) |
| --color-text | #eef0ff | #141632 | body text |
| --color-muted | #a8acd0 | #4a4e72 | secondary text |
| --color-primary | #ffffff | #141632 | primary pill button, current menu item |
| --color-on-primary | #0b0d1a | #ffffff | text on the primary button |
| --color-link | #c4b8ff | #4b37c9 | links |
| --color-accent-1 / -2 | #b9a8ff / #5ee3f0 | #6a4ff0 / #0d8fa6 | `--gradient-accent` (headline text, bullets) |
| --color-info | #5ee3f0 | #065f70 | chip dot: submission open |
| --color-success | #5be3a6 | #0c6141 | chip dot: done, submitted |
| --color-warning | #f5c76b | #6f4800 | chip dot: disputes, not submitted |
| --color-error | #ff9090 | #b42323 | error text |
| --color-focus | #8fe9f5 | #4b37c9 | focus ring |

### Typography
Inter Variable, served by the app (`@fontsource-variable/inter`), then the system stack.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| --font-size-display | clamp(2rem, 4.5vw, 3.25rem) / 1.15 | 650 | login headline |
| --font-size-title | 1.75rem / 1.15 | 650 | page heading |
| --font-size-body | 1rem / 1.55 | 400, 500 labels | body text |
| --font-size-small | 0.875rem | 500 | chips, table headers |

### Spacing
| Token | Value |
|---|---|
| --space-1 … --space-6 | 0.25, 0.5, 1, 1.5, 2, 3 rem |

### Radius, shadow, motion
| Token | Value | Use |
|---|---|---|
| --radius | 0.75rem | inputs |
| --radius-lg | 1.25rem | cards, tables, fieldsets |
| --radius-pill | 999px | buttons, chips, menu |
| --shadow-card | soft, darker in dark | cards |
| --control-height | 2.75rem | minimum input and button height |
| --duration | 150ms, 0 with reduced motion | hover transitions only |

### Components
- **Status chip** (`.badge` + `info`, `accent`, `success`, `warning`): a coloured dot and the text; colour never carries the meaning alone.
- **Menu** (`.nav`): pill track; the current page is a filled pill (`aria-current`).
- **Brand**: closed-eye logo (`web/public/logo.svg`) with "Peer review".

### Breakpoints / window sizes
| Name | Min | Max |
|---|---|---|
| phone | 20rem | 47.99rem (menu on its own row) |
| desktop | 48rem | — (login in two columns from 56rem) |

## Hard-coded values found (to migrate)
| path:line | Value | Should be |
|---|---|---|
