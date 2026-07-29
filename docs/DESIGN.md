# Chat & Wallet — Design System

> The look and feel: **soft minimalist neumorphism, disciplined by Apple's Human
> Interface Guidelines, and executed with design-engineering craft.** Tactile,
> calm, trustworthy — a money app that feels gentle to touch, crisp to use, and
> never fuzzy about what's actionable.

**Status:** Draft v0.2 · Companion to `docs/PROJECT_BIBLE.md` · Last updated 2026-07-15

> **v0.2 note:** motion, typography, materials, and anti-patterns were rebuilt
> using the craft encoded in our vendored design skills (`.claude/skills/` —
> Emil Kowalski's design-engineering, Apple design, and Impeccable). Those skills
> are the *how*; this doc is the *what for Chat & Wallet*.

---

## 1. Philosophy

Two influences, deliberately combined, then executed with craft:

- **Neumorphism** — soft UI. Surfaces look extruded from or pressed into a single
  base color using paired light/dark shadows. Physical, pillowy, tactile.
- **Apple HIG** — clarity, deference, depth; fluid, physical motion; and
  accessibility as a **requirement**, not a nice-to-have.

### The tension, and how we resolve it

Pure neumorphism is notoriously low-contrast and fails accessibility. Apple HIG
demands the opposite. So we do **not** ship "everything is a soft grey blob."

**The rule:**

- **Neumorphism carries surfaces and passive/secondary controls** — cards,
  panels, inputs, toggles, the tab bar, containers.
- **Apple clarity carries anything that acts or informs** — primary buttons get
  **solid accent fills**, text meets contrast minimums, and important numbers
  (your balance!) are high-contrast and unmistakable.
- **Depth is meaningful, never decorative.** Raised = interactive/elevated.
  Inset = pressed/input. Flat = passive background. If it looks pressable, it is.

> If a user can't instantly tell what to tap or read, softness has gone too far.
> Clarity wins every tie.

### This app runs in "Operate" mode

Borrowing Impeccable's framing: our product screens are **Operate** surfaces —
the user is completing a task (send money, contribute, chat). That means
**scanability, consistency, native expectations, and the real usage scene
outrank expression.** Brand lives in precise details, not loud decoration. (A
future marketing landing page would be **Persuade** mode and play by different
rules — don't design app screens like a landing page.)

### Three craft beliefs we design by

- **Taste is trained, not innate.** Study why the best interfaces feel right;
  reverse-engineer them. Every value here is a defensible choice, not a default.
- **Unseen details compound.** Most polish users never consciously notice — that's
  the point. "A thousand barely-audible voices all singing in tune."
- **Beauty is leverage; good defaults beat options.** Ship excellent out of the
  box. Most users never customize, so the default easing, spacing, and color must
  already be right.

### Feel in five words

Soft · Calm · Spacious · Tactile · Trustworthy.

---

## 2. Color

Neumorphism is built on **one base surface color** per theme, plus two shadows
(a lighter tint and a darker tint of that base). Accent and semantic colors sit
on top as solid fills.

### 2.1 Light theme

| Token | Hex | Use |
|---|---|---|
| `bg.base` | `#E8EDF3` | app background & the base every soft surface is cut from |
| `shadow.light` | `#FFFFFF` | top-left highlight of neumorphic shadows |
| `shadow.dark` | `#C4CDD8` | bottom-right shadow of neumorphic shadows |
| `text.primary` | `#2A2F36` | headings, balances, body |
| `text.secondary` | `#6B7580` | captions, metadata, hints |
| `text.tertiary` | `#9AA3AD` | disabled, placeholders |

### 2.2 Dark theme

Neumorphism in dark mode: `shadow.light` is a touch **lighter** than base
(top-left), `shadow.dark` a touch **darker** (bottom-right).

| Token | Hex | Use |
|---|---|---|
| `bg.base` | `#22262C` | app background & base surface |
| `shadow.light` | `#2C323A` | top-left highlight |
| `shadow.dark` | `#171A1F` | bottom-right shadow |
| `text.primary` | `#E6EAF0` | headings, balances, body |
| `text.secondary` | `#9AA3AD` | captions, metadata |
| `text.tertiary` | `#6B7580` | disabled, placeholders |

### 2.3 Accent & semantic (shared, tuned per theme)

Green leads — it reads as money, growth, and (nod to the flag) Nigeria. Solid,
high-contrast, used for action and status. **Never** rendered as a low-contrast
neumorphic blob.

| Token | Light | Dark | Use |
|---|---|---|---|
| `primary` | `#12B981` | `#2ED89B` | primary actions, brand, "money in" |
| `primary.pressed` | `#0EA372` | `#24BE86` | pressed state of primary |
| `info` | `#3B82F6` | `#5B9DFF` | links, informational |
| `success` | `#12B981` | `#2ED89B` | contribution paid, payout sent |
| `warning` | `#F5A524` | `#FFB84D` | late / due soon |
| `danger` | `#EF4444` | `#FF6B6B` | missed, failed, destructive |

> Primary CTAs use a **solid `primary` fill with a soft drop shadow** — Apple
> clarity for the one thing we most want tapped. Neumorphic-only buttons are
> reserved for secondary/toggle controls. **Color always accompanies depth** to
> signal state (never rely on a lifted/pressed look alone — see §10).

---

## 3. Elevation & the neumorphic shadow system

Depth is expressed through **four levels**. Each maps to a specific shadow recipe.

| Level | Name | Look | Used for |
|---|---|---|---|
| 0 | **Flat** | no shadow, sits on base | passive backgrounds, section fills |
| 1 | **Raised** | soft outer dual shadow | cards, secondary buttons, tab bar |
| 2 | **Floating** | stronger outer dual shadow | modals, active/hero cards, FAB |
| −1 | **Inset** | inner dual shadow (pressed-in) | inputs, pressed buttons, tracks |

**The dual-shadow recipe** (the essence of neumorphism): every raised element
casts **two** shadows — a `shadow.dark` offset to the bottom-right and a
`shadow.light` offset to the top-left. Inset flips them inward.

```
Raised (level 1):
  shadow 1:  offset (+6, +6)  blur 12  color shadow.dark
  shadow 2:  offset (−6, −6)  blur 12  color shadow.light

Floating (level 2):
  shadow 1:  offset (+10, +10) blur 20 color shadow.dark
  shadow 2:  offset (−10, −10) blur 20 color shadow.light

Inset (level −1):   (inner shadows)
  inset shadow 1: offset (+4, +4) blur 8 color shadow.dark
  inset shadow 2: offset (−4, −4) blur 8 color shadow.light
```

**Shadows are soft and low-contrast by design.** Never use harsh, dark drop
shadows (`rgba(0,0,0,0.3)`, heavy `shadow-md`) or generic 1px solid grey
borders — those read as Material/Bootstrap, not this. Prefer a hairline of light
(a bright top edge, `inset 0 1px rgba(255,255,255,0.5)`) over a dark border. When
a real drop shadow is needed (solid CTA, floating chrome), keep it **large,
diffuse, and semi-transparent**, tinted from `shadow.dark`.

> **Implementation note (React Native):** RN 0.76+ (New Architecture) supports the
> `boxShadow` style with comma-separated shadows **and** the `inset` keyword, and
> React Native Web supports it natively — so a single cross-platform `boxShadow`
> string gives us true neumorphism on iOS, Android, and web. On older RN, fall
> back to `react-native-shadow-2`. Tokens (§9) are authored as `boxShadow` strings.

---

## 4. Materials & depth (overlay chrome)

Content surfaces are neumorphic. **Floating chrome and overlays** (nav bar, tab
bar, sheets, modals) may instead use Apple-style **translucent materials** for a
sense of real depth — a functional layer floating over content.

- Build overlay chrome as a **translucent layer**: a semi-transparent background
  + `backdrop-filter: blur(20px) saturate(180%)`, with content scrolling under —
  not an opaque strip.
- **Material weight encodes hierarchy.** Bigger surfaces read as thicker (stronger
  blur, deeper shadow). Never stack one light translucent surface on another —
  legibility collapses.
- **Dim to focus, separate to keep flow.** A modal task pairs the surface with a
  dimming scrim and pushes the background back. A parallel, non-blocking panel
  (e.g. a peek sheet) uses translucency + offset **without** a scrim.
- **Vibrancy keeps text legible** over translucent/blurred surfaces: use
  higher-contrast, slightly heavier text with a small letter-spacing bump — never
  flat grey text on glass. Put color on a solid layer, not the glass foreground.
- **Scroll edge effects, not hard dividers.** Where content meets a sticky
  header/tab bar, fade a small blur/gradient mask instead of a 1px border.
- **Materialize, don't just fade.** Animate blur radius + scale together on
  enter/exit so glass arrives like a real material.

**Performance:** apply `backdrop-blur` **only** to fixed/sticky elements. Never
blur scrolling containers or large content areas — it causes continuous GPU
repaints and drops frames on mobile.

---

## 5. Typography

Apple's type voice, with a **rounded** companion that pairs beautifully with soft
UI.

- **iOS:** system **SF Pro** for text; **SF Pro Rounded** for headings, balances,
  and numbers (rounded terminals echo the neumorphic radii).
- **Android / web:** **Inter** for text; **Nunito** (or **SF Pro Rounded** if
  bundled) for the rounded headings/numbers. *Default to the platform system font
  before a custom face — it already ships optical sizing and legibility tuning.*
- **Numbers are tabular** (monospaced figures) wherever money is shown, so digits
  don't jump as balances update.

### Type scale (pt) — Apple HIG derived

| Token | Size / Line | Weight | Tracking | Use |
|---|---|---|---|---|
| `largeTitle` | 34 / 41 | Bold, rounded | −0.02em | screen hero (e.g. wallet balance) |
| `title1` | 28 / 34 | Bold, rounded | −0.015em | section headers |
| `title2` | 22 / 28 | Semibold | −0.01em | card titles |
| `title3` | 20 / 25 | Semibold | −0.01em | subsection |
| `headline` | 17 / 22 | Semibold | 0 | emphasized body, list titles |
| `body` | 17 / 22 | Regular | 0 | default text, chat messages |
| `callout` | 16 / 21 | Regular | 0 | secondary body |
| `subhead` | 15 / 20 | Regular | +0.01em | metadata, labels |
| `footnote` | 13 / 18 | Regular | +0.01em | timestamps, helper text |
| `caption` | 12 / 16 | Regular | +0.02em | smallest labels |

**Typography rules that matter:**

- **Tracking is size-specific.** Large display text wants **negative** tracking
  (letters read too far apart as they grow); small text wants slightly
  **positive** tracking. A single `letter-spacing` value is wrong somewhere.
- **Leading tracks size inversely** — tight on large headings, looser on body.
- **Build hierarchy from weight + size + leading as a set,** not size alone.
  Weight adds presence without taking more space.
- **Respect Dynamic Type.** Sizes scale with the user's system text-size setting;
  spacing in relative units so layouts reflow, not clip.

---

## 6. Motion

Motion is designed *with* the visuals, not layered on after. In an Operate-mode
money app the bias is **restraint**: crisp, fast, and purposeful. Delight is
reserved for rare moments (first payout received, a cycle completing), never
sprinkled on routine actions.

### 6.1 Should it animate at all? (decide first)

| How often the user sees it | Decision |
|---|---|
| 100+×/day (send confirm, tab switch by habit) | **No animation.** |
| Tens×/day (list nav, hover) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare / first-time (onboarding, first payout, celebration) | Can add delight |

Every animation needs a purpose — feedback, spatial consistency, state change, or
preventing a jarring jump. "It looks cool" on something seen often = **don't**.
A live balance figure that just updated should *not* bounce every time.

### 6.2 Easing — use custom curves, never the CSS defaults

Built-in CSS easings are too weak. Our tokens:

```
--ease-out:     cubic-bezier(0.23, 1, 0.32, 1)     /* entering/exiting UI — feels instant */
--ease-in-out:  cubic-bezier(0.77, 0, 0.175, 1)    /* on-screen movement/morph */
--ease-sheet:   cubic-bezier(0.32, 0.72, 0, 1)     /* iOS-like drawers/sheets */
```

- **Entering/exiting → `ease-out`.** Starts fast = responsive.
- **Moving/morphing on screen → `ease-in-out`.**
- **Hover/color → `ease`. Constant motion (progress) → `linear`.**
- **Never `ease-in` on UI** — it delays the first moment the user is watching, so
  it *feels* slower even at the same duration.

### 6.3 Duration — keep UI under 300ms

| Element | Duration |
|---|---|
| Button press feedback | 100–160ms |
| Tooltips, small popovers | 125–200ms |
| Dropdowns, selects | 150–250ms |
| Modals, drawers, sheets | 200–500ms |

**Asymmetric timing:** slow where the *user* is deciding (hold-to-confirm a
transfer: ~1.5–2s linear), fast where the *system* responds (release: ~200ms
ease-out). Perceived speed matters as much as real speed.

### 6.4 Springs (for anything touchable)

Springs are interruptible and velocity-aware — reach for them for drags, sheets,
and anything a gesture drives. Think in Apple's two parameters:

- **Damping** — overshoot. `1.0` = critically damped, no bounce (our default).
  `~0.8` = slight bounce, **only** when the gesture carried momentum (a flick).
- **Response** — how fast it reaches target (~`0.3–0.4`s). Not a fixed duration.

| Interaction | Damping | Response | Framer/Motion |
|---|---|---|---|
| Default UI (reposition, settle) | `1.0` | `0.35` | `bounce: 0, duration: 0.35` |
| Sheet / drawer | `0.8` | `0.3` | `bounce: 0.15, duration: 0.3` |
| Momentum / flick release | `0.8` | `0.35` | `bounce: 0.2, duration: 0.35` |

**Interruptibility is the most important principle:** never lock input during a
transition; always animate from the element's *current on-screen* value; carry
velocity through a re-target so a reversed gesture doesn't hit a "brick wall."
Hand off pointer release velocity to the spring, and **project momentum** to
decide where a flick lands (don't snap from the release point).

### 6.5 Component motion reflexes

- **Press feedback:** pressable elements scale to `0.97` on `:active` (~120ms
  ease-out) and swap **raised → inset**. Respond on pointer-**down**, not release.
- **Never animate from `scale(0)`** — nothing appears from nothing. Enter from
  `scale(0.95)` + `opacity: 0`.
- **Origin-aware popovers/menus** scale from their trigger (`transform-origin`),
  not center. Modals stay centered.
- **Spatial consistency:** exit along the entry path (a sheet in from the bottom
  leaves to the bottom).
- **Stagger** list entrances 30–80ms apart; never block interaction while it plays.
- **Only animate `transform` and `opacity`** (GPU; skips layout/paint). Prefer CSS
  transitions over keyframes for rapidly-triggered UI (they retarget smoothly);
  use `IntersectionObserver`/`whileInView` for scroll reveals, never scroll
  listeners.

### 6.6 Reduced motion

`prefers-reduced-motion` means **gentler, not zero** — keep opacity/color
transitions that aid comprehension, drop movement, springs, and parallax. Also
honor `prefers-reduced-transparency` (frostier/solid materials) and
`prefers-contrast` (near-solid backgrounds, defined borders).

---

## 7. Spacing, radius & layout

- **Grid:** 8pt base, 4pt for fine adjustments.
  `xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48`.
- **Generous whitespace.** Minimalism means breathing room; soft UI needs space
  around each element so its shadows read. Be willing to over-space hero areas.
- **Radii** (soft, generous): `sm 12 · md 16 · lg 24 · xl 32 · pill 999`. Cards
  default to `lg`; buttons `md`–`pill`; inputs `md`.
- **Concentric radii for nested surfaces.** When one soft surface sits inside
  another (a tray holding a card), the inner radius = outer − padding, so the
  curves stay parallel (`inner = outer − pad`). This "machined hardware" nesting
  is what makes soft cards feel physical rather than flat.
- **Touch targets** ≥ 44×44 pt (Apple HIG minimum), with a little hit-padding.

---

## 8. Core components

Depth mapping tells you the treatment at a glance.

| Component | Treatment |
|---|---|
| **Wallet balance card** | Floating (L2) soft surface; `largeTitle` rounded, tabular, high-contrast number; "money in/out" chips in `success`/`text.secondary`. Balance updates without a bounce. |
| **Primary button** | **Solid `primary` fill** + soft, diffuse drop shadow (clarity). Scales to `0.97` and presses in on tap. |
| **CTA with trailing icon** | Icon nests inside its own circular wrapper flush to the right padding ("button-in-button"), not naked beside the text. |
| **Secondary / toggle button** | Neumorphic **raised** (L1); becomes **inset** when active/pressed. |
| **Input field** | **Inset** (L−1) — pressed into the surface. Label above (`subhead`). Focus adds a subtle `primary` ring, not a hard border. |
| **Card (Circle, list item)** | Raised (L1), radius `lg`, generous padding. |
| **Chat bubble — mine** | Solid `primary`-tinted fill, white text, radius `lg`, soft shadow. |
| **Chat bubble — theirs** | Neumorphic raised (L1) on base, `text.primary`. |
| **System message (money event)** | Flat, centered, `footnote`, `text.secondary`, tiny status dot in the semantic color. |
| **Tab bar** | Floating chrome — neumorphic L2, or translucent material (§4). Active icon `primary`, inactive `text.tertiary`. |
| **Toggle / switch** | Inset track (L−1), raised knob (L1) that springs across. |
| **Modal / sheet** | Floating (L2), large top radius, dim scrim; enters via `ease-sheet` spring, exits along the same path. |

**Iconography:** **SF Symbols** on iOS; ultra-light, precise line icons
(**Phosphor Light** or **Lucide**, thin weight) elsewhere for a consistent soft
stroke. Avoid heavy/thick icon sets. Icons inherit text color.

---

## 9. Design tokens (source of truth)

Tokens live in `packages/shared` and are consumed by the Expo app across all
platforms. Illustrative shape:

```ts
export const tokens = {
  color: {
    light: {
      bg: '#E8EDF3', shadowLight: '#FFFFFF', shadowDark: '#C4CDD8',
      textPrimary: '#2A2F36', textSecondary: '#6B7580', textTertiary: '#9AA3AD',
    },
    dark: {
      bg: '#22262C', shadowLight: '#2C323A', shadowDark: '#171A1F',
      textPrimary: '#E6EAF0', textSecondary: '#9AA3AD', textTertiary: '#6B7580',
    },
    primary: '#12B981', primaryPressed: '#0EA372',
    info: '#3B82F6', success: '#12B981', warning: '#F5A524', danger: '#EF4444',
  },
  radius: { sm: 12, md: 16, lg: 24, xl: 32, pill: 999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  // Two shadows per level; inset flips them. RN 0.76+ / RN Web boxShadow.
  elevation: {
    raised:   '6px 6px 12px var(--shadowDark), -6px -6px 12px var(--shadowLight)',
    floating: '10px 10px 20px var(--shadowDark), -10px -10px 20px var(--shadowLight)',
    inset:    'inset 4px 4px 8px var(--shadowDark), inset -4px -4px 8px var(--shadowLight)',
  },
  motion: {
    ease: {
      out:    'cubic-bezier(0.23, 1, 0.32, 1)',
      inOut:  'cubic-bezier(0.77, 0, 0.175, 1)',
      sheet:  'cubic-bezier(0.32, 0.72, 0, 1)',
    },
    duration: { press: 120, popover: 160, dropdown: 200, sheet: 320 }, // ms
    spring: {
      default:  { damping: 1.0, response: 0.35 }, // bounce 0
      sheet:    { damping: 0.8, response: 0.30 }, // bounce ~0.15
      momentum: { damping: 0.8, response: 0.35 }, // bounce ~0.2
    },
    pressScale: 0.97,
  },
} as const
```

> `var(--shadow*)` resolves per active theme; in React Native we inject the
> literal theme hex, on web they can be CSS variables.

---

## 10. Anti-patterns — no "AI slop"

Every model was trained on the same SaaS templates. These are the tells that make
a UI look auto-generated. We don't ship them.

**Visual**
- Generic **1px solid grey borders** and **harsh dark drop shadows** — use soft
  neumorphic shadows / light hairlines instead.
- **Purple→blue gradients**, and gradients used as a crutch for depth.
- **Cards nested in cards nested in cards** with no hierarchy.
- **Grey text on a colored background** (fails contrast and looks cheap).
- A **rounded-square icon tile above every heading**.
- Heavy, thick-stroke icons; mismatched icon sets.

**Motion**
- `transition: all` — always name the exact properties.
- `ease-in` on UI; `linear`/`ease-in-out` as the default for interactions.
- Entering from `scale(0)`; instant state changes with no interpolation.
- Same enter and exit speed; everything appearing at once (no stagger).
- Animating `width`/`height`/`top`/`left` instead of `transform`.

**Structure**
- Never rely on depth alone to signal state — pair it with **color + label +
  icon** (a "Paid" row = green check + "Paid", not just a lifted look).
- Don't design app screens like a marketing page — we're **Operate** mode (§1).

---

## 11. Do / Don't

**Do**
- Keep one base surface per theme; build depth only with the two soft shadows.
- Use solid accent fills for primary actions and money figures.
- Give elements room so shadows can breathe.
- Make every depth cue redundant with color/label/icon.
- Use custom easing curves and keep UI motion under 300ms.
- Animate only `transform` and `opacity`; keep animations interruptible.

**Don't**
- Put low-contrast grey text on a soft grey surface.
- Make everything neumorphic — flatten passive content.
- Use hard, heavy drop shadows or 1px grey borders (that's Material, not this).
- Signal an action with shadow alone.
- Animate high-frequency actions, or bounce a value that just updated.

---

## 12. Craft & process

- **Prototype interactively.** A working prototype is worth "a million static
  designs" — you discover the interface by playing with it, and it sets a bar the
  final build must meet.
- **Design interaction and visuals together** — you shouldn't be able to tell
  where one ends and the other begins.
- **Review motion with fresh eyes.** Play animations in slow motion / frame by
  frame; you'll catch next-day what you miss while building.
- **Verify in bounded passes, not an endless loop.** Build fully, inspect once
  (desktop + mobile together), fix everything in one batch, confirm once, stop.
- **Use the skills.** `.claude/skills/` carries the craft — invoke `/impeccable
  critique` / `polish` / `audit` on real screens, and lean on the Emil and Apple
  design skills when building motion.

---

_This document is v0.2 and expected to evolve alongside the app. Propose edits via
PR against `docs/DESIGN.md`._
