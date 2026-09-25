---
paths:
  - "server/src/shared/demo.ts"
  - "server/src/routes/auth.ts"
  - "client/src/lib/tour.ts"
  - "client/src/components/Tour.tsx"
  - "client/src/components/DemoBanner.tsx"
  - "client/src/components/TryDemoButton.tsx"
  - "client/src/pages/DemoJoin.tsx"
---

# Demo mode and the guided tour

A demo is a **real throwaway account**, not a fake UI. The visitor runs the actual manager flow, so there is no second copy of any screen.

## Server (`shared/demo.ts`)
- `POST /auth/demo` (unauthenticated) calls `createDemoAccount()`. It creates the guest "Гость 1" (manager), one sparring partner "Гость 2" (email prefix `demo-`), and a private `DRAFT` event "Демо-вечер" with both players `REGISTERED`. `maxPlayers` is unset, so more players can join.
- Creation is **three separate writes, not a `$transaction`**: the pooler drops multi-statement transactions (`P1017`). Ids are generated up front. On failure it deletes what it made.
- `User.isDemo`/`demoOwnerId`/`demoExpiresAt`. The TTL is `DEMO_TTL_HOURS` (24). `sweepExpiredDemos()` runs at the start of `POST /auth/demo` (there is no scheduler) and deletes in the same hand-written order as `DELETE /tournaments/:id`.
- **Demo rows must never appear next to real players**: `notDemo` on the rating list, `GET /players` and `/leaders`. The event is `isPublic: false`, which keeps it out of the feed and `/results`. Any new list of players or matches must exclude them too.
- **Invitation link**: `POST /auth/demo/join { tournamentId }` (`joinDemoSeat`) creates a guest account (prefix `guest-`, expiring with the manager) and **moves** the sparring seat to it: roster row, paired match, round bye and rating. The sparring partner is then deleted. One seat, one taker: a second redeemer gets 409, an expired or non-demo event gets 404/410. `demoSeatOpen` on `GET /tournaments/:id` means "a roster member is still a `demo-` user". The manager's `TournamentPage` shows `/demo/join/:id` while the seat is open. `DemoJoin.tsx` requires an explicit tap, so a link preview can't use up the seat.
- **Tour reset**: `POST /tournaments/:id/demo-reset-round1` (`resetDemoRound1`, only on the caller's own demo event) runs when the tour finishes. It reverts round 1's rating changes and wipes its sets back to `NOT_STARTED`, keeping the pairing. The tutorial match never counts.
- **Claim**: `POST /auth/claim` (`ClaimDemoSchema`, requires consent) updates the same row with a real email, password and name, and clears `isDemo`/`demoExpiresAt`. It clears the expiry on the opponents, which stay `isDemo`. It answers a fresh token without the `demo` claim. Signing up is an UPDATE, so everything recorded after the tour stays the visitor's.
- A demo token carries `demo: true` and counts as **not signed in** for name masking (see `auth-privacy.md`). Demo accounts cannot delete themselves; they expire. `GET /tournaments/:id` skips the demo-seat query unless the organizer is a demo account.

## Client
- `lib/tour.ts` holds a fixed step list plus a `localStorage` index, outside React. `components/Tour.tsx` is mounted once in `App.tsx`, so it follows onto `MatchPage`. It renders only for `user.isDemo`.
- Every step rings a real `data-tour="..."` anchor and never covers it.
- **A step without an anchor on screen shows its `wait` copy and hides "Next"**, so the tour can't walk past the one thing it is about.
- `doneBy` steps advance when the screen calls `tourDone("pair")` etc.
- `press` steps make "Next" click the real control (`pressStep`): pair, open the match, start it, tap sets for the visitor's side until `setsToWin`, end, then click the `confirm-dialog` button. The screen's own handler runs.
- "Record sets" completes when a side reaches `setsToWin`.
- `DemoBanner.tsx` (in `Layout`) is the "temporary" strip and holds the only claim form. Screens open it with `requestClaim()`. On a demo event, "add players" calls `requestClaim()` instead of opening the picker, because real people must not land in a throwaway event.
- Entry points: `TryDemoButton` on `Login` and the guest hero of `Dashboard`.
