# Chat & Wallet — Design System

> The look and feel: **soft minimalist neumorphism, disciplined by Apple's Human
> Interface Guidelines.** Tactile, calm, and trustworthy — a money app that feels
> gentle to touch but never fuzzy about what's actionable.

**Status:** Draft v0.1 · Companion to `docs/PROJECT_BIBLE.md` · Last updated 2026-07-15

---

## 1. Philosophy

Two influences, deliberately combined:

- **Neumorphism** — soft UI. Surfaces look extruded from or pressed into a single
  base color using paired light/dark shadows. Gives a physical, pillowy,
  tactile feel.
- **Apple HIG** — clarity, deference, depth. Content first, generous space,
  legible type, meaningful motion, and — crucially — **accessibility as a
  requirement, not a nice-to-have.**

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
> reserved for secondary/toggle controls.

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

> **Implementation note (React Native):** RN 0.76+ (New Architecture) supports the
> `boxShadow` style with comma-separated shadows **and** the `inset` keyword, and
> React Native Web supports it natively — so a single cross-platform `boxShadow`
> string gives us true neumorphism on iOS, Android, and web. On older RN, fall
> back to `react-native-shadow-2` (which stacks two `<Shadow>` layers). Tokens
> below are authored as `boxShadow` strings.

---

## 4. Typography

Apple's type voice, with a **rounded** companion that pairs beautifully with soft
UI.

- **iOS:** system **SF Pro** for text; **SF Pro Rounded** for headings, balances,
  and numbers (rounded terminals echo the neumorphic radii).
- **Android / web:** **Inter** for text; **Nunito** (or **SF Pro Rounded** if
  licensed/bundled) for the rounded headings/numbers.
- **Numbers are tabular** (monospaced figures) wherever money is shown, so digits
  don't jump as balances update.

### Type scale (pt) — Apple HIG derived

| Token | Size / Line | Weight | Use |
|---|---|---|---|
| `largeTitle` | 34 / 41 | Bold, rounded | screen hero (e.g. wallet balance) |
| `title1` | 28 / 34 | Bold, rounded | section headers |
| `title2` | 22 / 28 | Semibold | card titles |
| `title3` | 20 / 25 | Semibold | subsection |
| `headline` | 17 / 22 | Semibold | emphasized body, list titles |
| `body` | 17 / 22 | Regular | default text, chat messages |
| `callout` | 16 / 21 | Regular | secondary body |
| `subhead` | 15 / 20 | Regular | metadata, labels |
| `footnote` | 13 / 18 | Regular | timestamps, helper text |
| `caption` | 12 / 16 | Regular | smallest labels |

**Respect Dynamic Type** — sizes scale with the user's system text-size setting;
layouts must reflow, not clip.

---

## 5. Spacing, radius & layout

- **Grid:** 8pt base, with 4pt for fine adjustments. Spacing tokens:
  `xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48`.
- **Generous whitespace** — minimalism means breathing room. Default screen
  padding `md`–`lg`. Soft UI needs space around each element so shadows read.
- **Radii** (soft, generous — neumorphism lives on rounded corners):
  `sm 12 · md 16 · lg 24 · xl 32 · pill 999`. Cards default to `lg`; buttons
  `md`–`pill`; inputs `md`.
- **Touch targets** ≥ 44×44 pt (Apple HIG minimum).

---

## 6. Motion

Subtle, springy, physical — motion should feel like touching a real soft object.

- **Engine:** Reanimated (spring-based) on the Expo app.
- **Press feedback:** on tap, primary/secondary controls **scale to 0.97** and
  swap from **raised → inset** shadow (it physically presses in), then spring back.
- **Springs:** gentle — roughly `damping 15, stiffness 150`. Screen transitions
  200–300 ms with Apple-style ease-in-out.
- **Reduce Motion:** honor the OS setting — replace movement with simple opacity
  fades.

---

## 7. Core components

Depth mapping tells you the treatment at a glance.

| Component | Treatment |
|---|---|
| **Wallet balance card** | Floating (L2) soft surface; `largeTitle` rounded, tabular, high-contrast number; "money in/out" chips in `success`/`text.secondary`. |
| **Primary button** | **Solid `primary` fill** + soft drop shadow (clarity). Presses in on tap. |
| **Secondary / toggle button** | Neumorphic **raised** (L1); becomes **inset** when active/pressed. |
| **Input field** | **Inset** (L−1) — looks pressed into the surface. Label above, `subhead`. Focus adds a subtle `primary` ring. |
| **Card (Circle, list item)** | Raised (L1), radius `lg`, generous padding. |
| **Chat bubble — mine** | Solid `primary`-tinted fill, white text, radius `lg`, soft shadow. |
| **Chat bubble — theirs** | Neumorphic raised (L1) on base, `text.primary`. |
| **System message (money event)** | Flat, centered, `footnote`, `text.secondary`, tiny status dot in the semantic color. |
| **Tab bar** | Floating (L2) neumorphic bar, slightly inset; active tab icon in `primary`, inactive in `text.tertiary`. |
| **Toggle / switch** | Inset track (L−1), raised knob (L1) that slides. |
| **Modal / sheet** | Floating (L2), large top radius, dim scrim behind. |

**Iconography:** **SF Symbols** on iOS; rounded line icons (**Phosphor** or
**Lucide**) elsewhere for a consistent soft, rounded stroke. Icons inherit text color.

---

## 8. Accessibility (non-negotiable)

Neumorphism's failure mode is low contrast. We refuse to ship that.

- **Text contrast** ≥ 4.5:1 (body) / 3:1 (large text) against its actual
  background. Money figures and CTAs aim higher.
- **Never** convey state by shadow alone. Pair depth with **color + label +
  icon** (e.g. a "paid" row shows a green check + "Paid", not just a lifted look).
- **Actionable ≠ soft-only.** Primary actions carry solid fills so they're
  obviously tappable.
- **Focus & hit states** are visible; touch targets ≥ 44 pt.
- **Dynamic Type** and **Reduce Motion** are honored.
- **Dark mode** is a first-class theme, not an afterthought — every token has a
  dark value.

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
  // boxShadow strings (RN 0.76+ / RN Web). Two shadows per level; inset flips them.
  elevation: {
    raised:   '6px 6px 12px var(--shadowDark), -6px -6px 12px var(--shadowLight)',
    floating: '10px 10px 20px var(--shadowDark), -10px -10px 20px var(--shadowLight)',
    inset:    'inset 4px 4px 8px var(--shadowDark), inset -4px -4px 8px var(--shadowLight)',
  },
} as const
```

> The `var(--shadow*)` placeholders resolve per active theme (light/dark). In
> React Native we inject the literal theme hex; on web they can be CSS variables.

---

## 10. Do / Don't

**Do**
- Keep one base surface per theme; build depth only with the two shadows.
- Use solid accent fills for primary actions and money figures.
- Give elements room so shadows can breathe.
- Make every depth cue redundant with color/label/icon.

**Don't**
- Put low-contrast grey text on a soft grey surface.
- Make everything neumorphic — flatten passive content.
- Use hard, heavy drop shadows (that's Material, not this).
- Signal an action with shadow alone.

---

_This document is v0.1 and expected to evolve alongside the app. Propose edits via
PR against `docs/DESIGN.md`._
