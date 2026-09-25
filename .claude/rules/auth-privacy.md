---
paths:
  - "server/src/routes/auth.ts"
  - "server/src/routes/players.ts"
  - "server/src/middleware/**"
  - "server/src/shared/privacy.ts"
  - "server/src/shared/mail.ts"
  - "server/src/shared/errors.ts"
  - "server/src/app.ts"
  - "client/src/context/AuthContext.tsx"
  - "client/src/lib/legal.ts"
  - "client/src/pages/Login.tsx"
  - "client/src/pages/Register.tsx"
  - "client/src/pages/ForgotPassword.tsx"
  - "client/src/pages/LegalPage.tsx"
  - "client/src/pages/ProfilePage.tsx"
  - "client/src/components/ConsentFields.tsx"
---

# Auth, accounts, personal data

## Auth
- JWT bearer token signed with `JWT_SECRET`. There is no fallback secret: `index.ts` refuses to start without it, and `jwtSecret()` reads it lazily so Vercel still serves public pages.
- `authMiddleware` requires a token. `roleMiddleware` exists but **nothing uses it**. Roles: `ADMIN`, `ORGANIZER`, `JUDGE`, `PLAYER`, `VIEWER`. Only `ADMIN` means anything: editing other people's profiles and unmanaged clubs, with the role read from the DB.
- `POST /auth/register` is open self-signup (`SelfRegisterSchema`). It never reads `role` or `rating` from the body and creates an `ORGANIZER`.
- Passwords are hashed with bcryptjs. Errors go through `publicError` (`shared/errors.ts`), which hides Prisma messages.
- **Rate limits** (`middleware/rateLimits.ts`, in memory, per instance) are keyed on the **account when a valid token is present, else the IP**, because a whole club shares one Wi-Fi address. Separate buckets exist for login, register, forgot/reset, demo and self-join. Check the file for the numbers.

## Forgot password (`/auth/forgot`, `/auth/reset`, screen `ForgotPassword.tsx`)
- `/forgot` answers the same 200 whether or not the address exists. Demo and `@localhost`/`@demo.local` addresses never get a code.
- The code is 6 digits, stored as a bcrypt hash (`PasswordReset`). It lives 15 minutes and allows 5 tries. Tries are spent by a conditional `updateMany` *before* the compare. One live code per user, at most one letter a minute. Email lookup is case-insensitive.
- `/reset` answers `{ token, user }` like `/login`.
- Mail goes through `shared/mail.ts` (SMTP: `SMTP_HOST`, `SMTP_PORT` (465 = TLS), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). With no `SMTP_HOST` it prints to the console outside production and answers 503 in production.

## Profile edit (`PUT /players/:id`, `UpdateProfileSchema`)
- Allowed for the owner, or an `ADMIN` editing someone else. Only the fields sent are written.
- **Never settable**: `rating` (computed from matches) and `role`.
- A password **or email** change by the owner requires `currentPassword` (email is where reset codes go). A duplicate email returns a friendly 400.
- The response has the `/auth/me` shape.

## Personal data (152-FZ)
- **Consent**: register and `/auth/claim` require `acceptTerms: true`. They stamp `consentAt` and `consentVersion`. `CONSENT_VERSION` (`shared/privacy.ts`) **must equal** `LEGAL_VERSION` (`client/src/lib/legal.ts`); bump both when the text changes.
- **Documents**: `/privacy`, `/terms` (`LegalPage.tsx`) with texts in `lib/legal.ts`. Operator details come from `VITE_LEGAL_OPERATOR`/`_ADDRESS`/`_EMAIL`/`_HOSTING`; unset, they show bracketed placeholders.
- **Public name**: `User.publicProfile` is a separate consent, unticked at signup and toggled on `ProfilePage`.
- `listed` (`privacy.ts`: real, not deleted, public) filters **every public list of players**. Wins over hidden players are counted before filtering.
- `maskHiddenPlayers` (mounted on `/api` in `app.ts`) handles requests with no valid token, and a demo token counts as none. It rewrites every object with a `firstName` belonging to a hidden or deleted user: the name becomes "Скрытый игрок"/"Hidden player" (from `X-Lang`), and `lastName`/`club`/`city` are cleared. It fails closed.
- **Delete account**: `DELETE /auth/me { password }` -> `anonymiseAccount`. The row stays (other people's standings reference it) as "Удалённый игрок", `deleted-<id>@deleted.invalid`, with `deletedAt`. Notifications, chat, follows, push subscriptions, audit, sessions and match-less roster rows are deleted. Bookings stay. `/auth/me` then answers 401.

## Guest access (server side)
- `GET /players/:id` is unauthenticated and returns the public shape (no email or phone).
- `GET /players` requires auth and carries no email or phone.
- The gated GETs (`/auth/me`, `/players`, `/profile/stats`, `/tournaments/mine`, chat, `/bookings/mine`, `/subscriptions/mine`) are exactly the ones no guest screen calls.
