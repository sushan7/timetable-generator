# Academic Studio: Warm Minimalism & Swiss Design (DESIGN.md)

> Visual design system for **Timetable Pro**. Inspired by Swiss typographic rigor, Dieter Rams' functional restraint, and modern editorial UI.

---

## 1. Design Philosophy

- **Archetype**: Warm Minimalism + Swiss Typography + Editorial Precision.
- **Tone**: Quiet, confident, calm, functional, highly organized.
- **Rule of Thumb**: Less decoration, more intention. Less color, more hierarchy. Less clutter, more clarity.

---

## 2. Anti-Slop Dials

| Dial | Level | Implementation |
|---|---|---|
| **ENERGY** | **1 (Calm)** | Warm paper canvas, natural stone contrast, grounded editorial layout. Absolute zero neon or blue/purple gradients. |
| **RHYTHM** | **2 (Balanced)** | Timetable grid acts as the centerpiece with typographic contrast; forms and lists follow clean Swiss grid lines. |
| **MOTION** | **1 (Subtle)** | 120ms-150ms ease-out transitions on hover and active states. Zero loops, bounces, or pulse animations. |

---

## 3. Strict Color System

Strictly adhering to the Warm Minimalism palette:

| Token | Hex | Role | Usage |
|---|---|---|---|
| **Canvas Background** | `#F8F7F3` | Main app backdrop | Warm off-white paper canvas |
| **Secondary Background** | `#F0EFE9` | Structural surfaces | Table headers, inactive pill backgrounds, nested panels |
| **White Surface** | `#FFFFFF` | Cards & Matrix cells | Crisp reading surfaces |
| **Dividers & Borders** | `#E5E2DA` | Hairline boundaries | Subtle 1px structural dividing lines |
| **Primary Ink** | `#252522` | Primary typography | High-contrast editorial headings, values, key labels |
| **Secondary Ink** | `#77766F` | Metadata & labels | Body copy, timestamps, secondary instructions |
| **Primary Accent** | `#C47B59` | Terracotta | Primary buttons, active nav indicators, confirmed states |
| **Secondary Accent** | `#A58A68` | Warm Ochre | Secondary highlights, subject category metrics, filters |

### Banned Colors
- No purple, violet, indigo, blue, cyan, green, or neon.
- No purple-to-blue gradients or generic AI dashboard treatments.

---

## 4. Typography & Swiss Editorial Grid

- **Font Family**: Inter & DM Sans (`--font-sans`).
- **Tabular Figures**: `font-feature-settings: "cv02", "cv03", "cv04", "cv11", "tnum"`.
- **Typographic Scale**:
  - **H1 (Page Title)**: `text-2xl font-bold tracking-tight text-[#252522]`
  - **H2 (Section Heading)**: `text-base sm:text-lg font-bold text-[#252522]`
  - **H3 / Batch Label**: `text-sm font-semibold text-[#252522]`
  - **Body Text**: `text-sm text-[#252522]`
  - **Metadata & Labels**: `text-xs font-medium text-[#77766F]`
  - **Micro Time / Room**: `text-[11px] font-medium text-[#77766F]`

---

## 5. Timetable Grid Architecture

- **Clean Matrix Geometry**: Fixed cell proportions, clean hairline borders (`#E5E2DA`), white slot backgrounds.
- **Sticky Batch Column**: Stays anchored on horizontal scroll with a subtle border divider.
- **Subject Representation**: Muted, editorial typography with subtle indicator tags in Terracotta (`#C47B59`) or Warm Ochre (`#A58A68`).
- **Print / PDF Precision**: Contrast tested to render cleanly in both digital displays and monochrome/color PDF exports.
