---
paths:
  - "client/src/**/*.tsx"
  - "client/src/lib/ui.ts"
  - "client/src/lib/format.ts"
  - "client/src/i18n/**"
  - "client/src/context/**"
---

# Client UI conventions

## Look
- Dark **navy** theme with a lime accent. Tokens:
  - `#0a1628` page, `#101f36` card, `#16283f` avatar fill, `#1c3350` border/secondary surface.
  - `#142a44`->`#0a1628` hero gradient.
  - `#ccff00` accent, with `#0a1628` text on it.
  - Muted text `#6b84a0`/`#93a8c2`/`#4d6480`.
  - Player colours `#3b82f6`/`#ef4444`.
  - Don't reintroduce the old `#0a0a0f`/`#12121a`/`#1e1e2e`/`#3b82f6`-accent palette.
- Phone-first and single-column: no tables, no horizontal scroll.
- Outline (stroke) SVG icons. **No emoji** in UI copy or comments.
- **Class strings come from `lib/ui.ts`**; don't paste them or define local copies:
  - Text: `pageTitle`, `sectionLabel`/`fieldLabel`, `backLink`.
  - Surfaces: `card` (`rounded-lg`) and `cardFeature` (`rounded-2xl` gradient).
  - Fields: `field`, `searchField`.
  - Buttons: `btnPrimary`/`btnSecondary`/`btnGhost`/`btnDanger`, `btnPrimaryLg` (the one action a screen is about), `btnSmall`.
  - Feedback: `errorBox`/`noticeBox`. Filters and podium: `chip(on)`, `MEDALS`.
  - Radius: `rounded-lg` everywhere except `cardFeature` and avatars. No bare `rounded`.
- **Shared components**:
  - Players and branding: `Avatar` (initials + rating badge, the standard way to show a player in a list), `Logo`.
  - Settings: `HelpTip` (the one "?" after a setting; hover and tap; text is a `help.*` key; every `EventForm` setting has one, formats as `format.<FORMAT>.help`; hints live there, not as lines under fields).
  - States: `EmptyState`, `Loader`.
  - Events: `EventCard`, `ScopeToggle` (All/Mine).
  - Inputs: `SetsToWinPicker`, `FormatPicker`.
- JSX style: terse one-line conditionals, no per-row sub-components, reuse existing spacing.

## Text
- **All copy through i18n**: `const { t, lang } = useT()`, `t("key", { n })`. The dictionary is `i18n/dict.ts`, a flat map with `ru` (default, product language) and `en` (fallback). The language is stored in `localStorage` `lang` and switched on `ProfilePage`.
- Dates only through `lib/format.ts` (`formatEventDay`, `formatTimeRange`, `formatSlot`, taking `lang`).
- **Player names through `playerName(p)`** ("Иван П."). Never inline `p.firstName`. Lists already showing the full name are fine.

## Navigation (`components/Layout.tsx`)
- Fixed bottom tab bar:
  - Signed in: Home, Play (`/bookings`), Clubs, Results, Profile (`MEMBER_NAV`).
  - Guest: Home, Games, Clubs, Results, Sign in (`GUEST_NAV`).
  - Plus a sticky header with `Avatar` (or "Войти") and `NotificationBell`.
- The rating list lives in Results -> "Лидеры" -> "Таблица". The `/rating` and `/players` routes still render `RatingPage`, but nothing in the UI links to them.
- New signed-in pages render inside `<Layout>`. `MatchPage`, `LiveScore`, `PublicTournament`, `Login`, `Register`, `TournamentChatPage` are standalone.

## Behaviour
- **Every irreversible action asks first** through `useConfirm()` (`components/ConfirmDialog.tsx`: `const [confirm, dialog] = useConfirm()`; `if (!(await confirm({ title, text, danger }))) return;`). Never `window.confirm` or inline confirm panels. Its button carries `data-tour="confirm-dialog"` for the tour.
- **Polling** through `lib/usePolling.ts`: the next request is scheduled after the previous one finishes, paused while the tab is hidden. `MatchPage`/`LiveScore` poll every 2s, `TournamentPage`/`PublicTournament` every 5s. `TournamentPage` re-reads `/standings` only when a completed match or the roster changed, and fetches `/players` only when the add-players picker opens. `context/SocketContext.tsx` is a polling provider despite its name.
- **Session user goes stale**: `AuthContext` exposes `refreshUser()`/`setUser()` and re-reads `/auth/me` on focus. A screen showing server-changeable user data (e.g. rating) should call `refreshUser()`.
- **Guest mode**: `RequireAuth` wraps only writing screens (`/bookings`, `/profile`, `/notifications`, `/tournament/new`, `/tournament/:id/chat`). A guest-readable screen must not fire a gated request (e.g. `TournamentPage` skips `players.getAll()` without a token). Write controls become a link to `/login` (`guest.signInToJoin`).
- All REST calls go through `apiService` in `services/api.ts` (axios, JWT from `localStorage`, `X-Lang` header).
