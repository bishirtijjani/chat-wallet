# Design skills (vendored)

Design-focused Claude Code skills installed into this project so every session —
current and future — has strong design "taste" available. They're committed to
the repo (not fetched at runtime) so they persist across our ephemeral web
sessions.

These skills load automatically when relevant; some are directly invocable
(e.g. `/impeccable polish`). They complement our own `docs/DESIGN.md` (soft
neumorphism + Apple HIG) — use them to execute that language with real craft.

## What's installed & where it came from

| Skill folder | Frontmatter name | Source | License |
|---|---|---|---|
| `emil-design-eng` | `emil-design-eng` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | MIT |
| `apple-design` | `apple-design` | emilkowalski/skills | MIT |
| `animation-vocabulary` | `animation-vocabulary` | emilkowalski/skills | MIT |
| `review-animations` | `review-animations` | emilkowalski/skills | MIT |
| `improve-animations` | `improve-animations` | emilkowalski/skills | MIT |
| `find-animation-opportunities` | `find-animation-opportunities` | emilkowalski/skills | MIT |
| `pick-ui-library` | `pick-ui-library` | emilkowalski/skills | MIT |
| `prototype` | `prototype` | emilkowalski/skills | MIT |
| `impeccable` | `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 |
| `taste-skill` | `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | MIT |
| `soft-skill` | `high-end-visual-design` | Leonxlnx/taste-skill | MIT |
| `minimalist-skill` | `minimalist-ui` | Leonxlnx/taste-skill | MIT |

Helper sub-agents for `impeccable` live in `.claude/agents/impeccable-*.md`.

## Notes

- **Emil Kowalski's skills** encode design-engineering craft (custom easing,
  <300ms animations, semi-transparent shadows, Apple motion principles) from his
  work on Sonner/Vaul and time at Vercel/Linear.
- **Impeccable** (Paul Bakaus) is one skill with 23 commands (`polish`, `audit`,
  `critique`, `distill`, `animate`, `bolder`, `quieter`, `typeset`, …) plus
  curated anti-patterns that steer away from generic "AI slop" UI. Its
  `reference/ios.md` and `reference/android.md` are derived from
  [ehmo/platform-design-skills](https://github.com/ehmo/platform-design-skills)
  (MIT), per Impeccable's NOTICE.
- **taste-skill** upgrades AI-built interfaces with stronger layout, typography,
  motion, and spacing. We vendored the soft/minimal variants that match our
  aesthetic; brutalist and image-generation variants were intentionally left out
  (available upstream if ever needed).

Upstream licenses (MIT / Apache-2.0) are retained in their respective source
repos; this README serves as the attribution notice for the vendored copies.
