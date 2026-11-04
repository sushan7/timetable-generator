# Timetable Pro — Design System & Editorial Tokens (DESIGN.md)

> Visual design guidelines, color architecture, and typographic hierarchy for **Timetable Pro**. Inspired by Swiss typographic rigor, Dieter Rams' functional restraint, and modern academic editorial interfaces.

---

## 1. Design Philosophy

- **Archetype**: Quiet Editorial Elegance + Swiss Grid Precision + Architectural Restraint.
- **Palette Essence**: Deep Charcoal (primary dark), Warm Beige / Taupe (secondary canvas and surfaces), and Brushed Gold / Cognac (accents used with deliberate restraint).
- **Core Principle**: Tokens define **operational role**, not arbitrary shades. Minimalist color application where every visual accent carries operational meaning.
- **Contrast Rigor**: All text and background combinations strictly pass WCAG AA standards (≥ 4.5:1 for normal text, ≥ 3:1 for large text and UI affordances).

---

## 2. Anti-Slop Calibration

| Dial | Level | Implementation Strategy |
|---|---|---|
| **ENERGY** | **1 (Quiet & Authoritative)** | Warm beige canvas (`#F5F0E8`), deep charcoal typography (`#2A2826`), muted hairline borders (`#DCD2C1`). Absolute zero neon, saturated tech blues, or purple AI gradients. |
| **RHYTHM** | **2 (Balanced & Editorial)** | Timetable matrix is the structured centerpiece; forms, navigation tabs, and data cards adhere strictly to Swiss grid alignment with tight 4–6px rounded radii. |
| **MOTION** | **1 (Subtle & Restrained)** | 120ms–150ms ease-out transitions on hover, focus, and modal triggers. Zero continuous loops, bounces, or decorative pulses. |

---

## 3. Semantic Token Architecture

All colors are tokenized via Tailwind v4 `@theme` in `src/index.css`. **Zero hard-coded hex literals are permitted in React components (`src/**/*.tsx`).**

### Light Palette (`:root` / default)

| Token | CSS Variable | Hex | Role & Usage |
|---|---|---|---|
| `canvas` | `--color-canvas` | `#F5F0E8` | App background canvas, editorial warm beige (never cool grey). |
| `surface` | `--color-surface` | `#FFFFFF` | Cards, timetable matrix cells, modal dialog panels. |
| `surface-muted`| `--color-surface-muted` | `#ECE4D6` | Table headers, inactive filter pills, nested summary boxes. |
| `border` | `--color-border` | `#DCD2C1` | Hairline dividers, table row separations, card edges. |
| `ink` | `--color-ink` | `#2A2826` | Primary high-contrast typography, section titles, matrix labels. |
| `ink-muted` | `--color-ink-muted` | `#6E6559` | Secondary metadata, timestamps, teacher count labels (WCAG AA on canvas). |
| `taupe` | `--color-taupe` | `#9C8F7E` | Decorative UI elements, dashed unfilled borders, "Other" curriculum category in BalanceBar. |
| `primary` | `--color-primary` | `#2A2826` | Deep Charcoal: primary buttons (Generate, Save), active nav items, active day tabs. |
| `primary-hover`| `--color-primary-hover` | `#3B3835` | Hover state for primary charcoal buttons. |
| `accent` | `--color-accent` | `#B08A4A` | Brushed Gold: keyboard focus rings, active indicators, Language quota bar. |
| `accent-hover` | `--color-accent-hover` | `#96753C` | Hover state for gold accent buttons. |
| `accent-soft` | `--color-accent-soft` | `#F1E6CF` | Soft gold tint: locked/frozen cells, gold badges, duplicate notices. |
| `cognac` | `--color-cognac` | `#8B4A2B` | Secondary accent: manual slot overrides, schedule warnings, links. |
| `cognac-soft` | `--color-cognac-soft` | `#F2E1D6` | Soft cognac tint: manual/overridden cell backgrounds, unfilled slot cards. |
| `burgundy` | `--color-burgundy` | `#6B1E2E` | Strictly reserved for danger, gap shortages, hard errors, destructive actions. |
| `burgundy-soft`| `--color-burgundy-soft`| `#F4E4E4` | Soft burgundy tint: cell gap backgrounds, violation banners, delete confirmations. |

### Dark Palette (`.dark`)

Dark mode uses the identical semantic token names with an inverted nocturne palette:

| Token | CSS Variable | Hex | Role in Dark Mode |
|---|---|---|---|
| `canvas` | `--color-canvas` | `#1E1D1B` | Deep nocturnal charcoal background. |
| `surface` | `--color-surface` | `#282624` | Elevated dark surface for cards and matrix cells. |
| `surface-muted`| `--color-surface-muted` | `#363330` | Inactive pills, subtle panel insets. |
| `border` | `--color-border` | `#4A4641` | Soft dark dividing lines. |
| `ink` | `--color-ink` | `#F5F0E8` | High-contrast warm off-white primary text. |
| `ink-muted` | `--color-ink-muted` | `#B4ACA0` | Muted secondary text. |
| `primary` | `--color-primary` | `#F5F0E8` | Inverted primary action button fill. |
| `accent` | `--color-accent` | `#C49F58` | Warm gold metallic accent for rings and indicators. |
| `burgundy` | `--color-burgundy` | `#E26D82` | Legible rose-burgundy for errors and gaps. |

---

## 4. Contrast Ratio Verification (WCAG 2.1 AA / AAA)

All core text and background pairings have been mathematically verified against standard luminance formulas:

| Foreground | Background | Calculated Ratio | WCAG Compliance |
|---|---|---|---|
| `text-ink` (`#2A2826`) | `bg-canvas` (`#F5F0E8`) | **13.0 : 1** | Passes AAA (≥ 7:1) |
| `text-ink` (`#2A2826`) | `bg-surface` (`#FFFFFF`) | **14.8 : 1** | Passes AAA (≥ 7:1) |
| `text-canvas` (`#F5F0E8`) | `bg-primary` (`#2A2826`) | **13.0 : 1** | Passes AAA (≥ 7:1) |
| `text-ink-muted` (`#6E6559`) | `bg-canvas` (`#F5F0E8`) | **5.01 : 1** | Passes AA (≥ 4.5:1) |
| `text-ink-muted` (`#6E6559`) | `bg-surface` (`#FFFFFF`) | **5.70 : 1** | Passes AA (≥ 4.5:1) |
| `text-ink` (`#2A2826`) | `bg-accent` (`#B08A4A`) | **4.65 : 1** | Passes AA (≥ 4.5:1) |
| `text-burgundy` (`#6B1E2E`) | `bg-burgundy-soft` (`#F4E4E4`) | **9.50 : 1** | Passes AAA (≥ 7:1) |
| `text-cognac` (`#8B4A2B`) | `bg-cognac-soft` (`#F2E1D6`) | **5.25 : 1** | Passes AA (≥ 4.5:1) |

> [!IMPORTANT]
> **Gold Contrast Constraint**: White text on brushed gold (`#B08A4A`) yields only **3.18:1** (fails WCAG AA for normal text). Therefore, all gold buttons and badges strictly use charcoal text (`text-ink`), achieving a compliant **4.65:1** ratio.

---

## 5. Component Styling Rules

### Primary Actions
- **Primary Buttons (Generate, Save)**: Deep charcoal fill with canvas text (`bg-primary text-canvas hover:bg-primary-hover`).
- **Focus Rings**: Gold accent ring with offset (`focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`).
- **Active Navigation & Day Tabs**: Charcoal background with a thin gold bottom indicator bar (`after:bg-accent`).

### Timetable Matrix Cell States (`AllocationCell.tsx`)
1. **Normal Auto-Scheduled**: Crisp white surface (`bg-surface text-ink`).
2. **Frozen / Locked**: Soft gold tint (`bg-accent-soft border-accent/40`) with gold lock icon (`text-accent`).
3. **Manual Edit**: Crisp white with cognac left accent border (`border-l-2 border-l-cognac`).
4. **Overridden**: Soft cognac tint (`bg-cognac-soft border-cognac/40 text-cognac`).
5. **Absence Patch Gap**: Soft burgundy tint (`bg-burgundy-soft border-burgundy/40 text-burgundy`).
6. **Hard Constraint Violation**: Soft burgundy border edge (`border-2 border-burgundy/60`).
7. **Unfilled Shortage**: Dashed taupe border with cognac label (`border-dashed border-taupe text-cognac`).
8. **Free / Unscheduled**: Muted dashed border (`border-dashed border-border text-ink-muted`).
9. **Subject Changed**: Gold changed badge with cognac explanation note.

### Curriculum Quota Balance Bar (`BalanceBar.tsx`)
- **Core Science (PCMB)**: Charcoal fill (`bg-primary`).
- **Language & Electives**: Brushed Gold fill (`bg-accent`).
- **Other Electives (e.g. CS)**: Taupe fill (`bg-taupe`).
- **Legend & Gaps**: Includes explicit category key and shortage alert pills.

### Badges (`Badge.tsx`)
- **Neutral**: `bg-surface-muted text-ink border-border`
- **Gold / Accent**: `bg-accent-soft text-ink border-accent/40`
- **Cognac / Warning**: `bg-cognac-soft text-cognac border-cognac/30`
- **Burgundy / Danger**: `bg-burgundy-soft text-burgundy border-burgundy/30`

---

## 6. Prohibited Visual Patterns (Anti-Slop)

- **NO Raw Terracotta / Ochre**: Eliminated all previous orange-brown `#C47B59`, `#A58A68`, and raw ochre tones.
- **NO Neons / Saturated Tech Blues**: No electric blue (`#0066FF`), cyan, or purple accents.
- **NO Linear Gradients**: No purple-to-blue or rainbow gradient headers.
- **NO Glassmorphic Blur**: No `backdrop-blur-md` on solid structural panels; clean, crisp solid backgrounds only.
- **NO Hard-Coded Hex in Components**: All styling is 100% tokenized.
