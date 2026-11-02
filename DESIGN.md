# Timetable Pro — Editorial Design System (DESIGN.md)

> Visual design guidelines, color architecture, and typographic hierarchy for **Timetable Pro**. Inspired by Swiss typographic rigor, Dieter Rams' functional restraint, and modern academic editorial interfaces.

---

## 1. Design Philosophy

- **Archetype**: Warm Minimalism + Swiss Typography + Academic Editorial Precision.
- **Tone**: Authoritative, calm, deliberate, highly organized, and respectful of academic complexity.
- **Foundational Rule**: Less decoration, more structure. Minimalist color application where every visual accent carries operational meaning.

---

## 2. Anti-Slop Calibration

| Dial | Level | Implementation Strategy |
|---|---|---|
| **ENERGY** | **1 (Calm)** | Warm beige canvas, charcoal typography, grounded editorial layout. Absolute zero neon or generic blue/purple AI gradients. |
| **RHYTHM** | **2 (Balanced)** | Timetable matrix is the focal centerpiece; forms and data tables adhere strictly to Swiss grid alignment. |
| **MOTION** | **1 (Subtle)** | 120ms-150ms ease-out transitions on hover, focus, and modal triggers. Zero continuous loops, bounces, or decorative pulses. |

---

## 3. Strict Color System

The palette replaces conventional tech dashboard blues and purples with an authoritative, academic palette:

| Token | Hex | Role | Usage |
|---|---|---|---|
| **Primary Brand** | `#6B2638` | Deep Burgundy | Primary action buttons, active navigation indicator, brand identity |
| **Primary Ink** | `#252326` | Deep Charcoal | High-contrast typography, column headers, matrix text |
| **Secondary Canvas** | `#F3EEE6` | Warm Beige | App surface, table headers, inactive tab pills, subtle container fills |
| **Subtle Borders** | `#A89B8A` | Taupe (30% opacity) | Hairline dividing lines and card borders (`border-[#A89B8A]/30`) |
| **Brushed Gold** | `#B08D57` | Accent 1 | Secondary badges, Language quota indicators, attention markers |
| **Cognac** | `#A65E3B` | Accent 2 | Warnings, pending absence gaps, conflict override notices |
| **Surface White** | `#FFFFFF` | Crisp White | Cell cards, active tabs, modal dialog surfaces |
| **Error / Alert** | `#FAF0F2` / `#6B2638` | Soft Crimson | Severe clash warnings and delete confirmation banners |

### Strictly Prohibited Palette
- No purple, violet, indigo, cyan, blue, or neon hues.
- No purple-to-blue linear gradients.
- No glassmorphic blur effects or heavy drop shadows.

---

## 4. Typography & Layout Metrics

- **Primary Font**: Inter & system sans-serif (`font-sans`).
- **Tabular Figures**: `font-feature-settings: "cv02", "cv03", "cv04", "cv11", "tnum"` for aligned numbers in tables and period timings.
- **Typographic Scale**:
  - **H1 (Page Title)**: `text-xl sm:text-2xl font-bold tracking-tight text-[#252326]`
  - **H2 (Section Heading)**: `text-sm sm:text-base font-bold text-[#252326]`
  - **H3 / Batch Label**: `text-xs sm:text-sm font-bold text-[#252326]`
  - **Body Copy**: `text-xs sm:text-sm text-[#252326]`
  - **Micro Label / Time**: `text-[11px] font-medium text-[#252326]/70`
  - **Tag / Badge Text**: `text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider`

---

## 5. UI Component Hierarchy

### Buttons (`src/components/ui/Button.tsx`)
- **Primary**: Deep Burgundy (`bg-[#6B2638] text-white hover:bg-[#581F2E] active:bg-[#461924]`)
- **Secondary**: Clean bordered white (`bg-white border-[#A89B8A]/40 text-[#252326] hover:bg-[#F3EEE6]`)
- **Danger**: Soft Crimson (`bg-[#FAF0F2] text-[#6B2638] border border-[#ECD9DE] hover:bg-[#F5DEE3]`)
- **Ghost**: Transparent backdrop (`text-[#252326]/70 hover:text-[#252326] hover:bg-[#F3EEE6]`)

### Badges (`src/components/ui/Badge.tsx`)
- **Burgundy**: Core science subjects, primary tags
- **Gold**: Language & elective subjects, balanced metrics
- **Cognac**: Warnings, conflict overrides
- **Neutral**: Track indicators, room numbers

### Timetable Matrix (`src/components/timetable/SectionTable.tsx`)
- Dynamic columns: dynamically counts maximum periods across sections rather than hardcoding 6 slots.
- Sticky Batch Column: remains anchored during horizontal matrix scroll.
- Mobile Card View: toggles between horizontal table and touch-friendly vertical cards on smaller screens.
- Focus rings: 2px Deep Burgundy ring with 2px offset (`focus-visible:ring-2 focus-visible:ring-[#6B2638] focus-visible:ring-offset-2`).
