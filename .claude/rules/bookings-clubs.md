---
paths:
  - "server/src/routes/bookings.ts"
  - "server/src/routes/clubs.ts"
  - "server/src/routes/subscriptions.ts"
  - "server/src/shared/booking.ts"
  - "server/src/shared/payments.ts"
  - "client/src/pages/BookingsPage.tsx"
  - "client/src/pages/ClubPage.tsx"
  - "client/src/pages/ClubsPage.tsx"
  - "client/src/components/EventForm.tsx"
  - "client/src/components/*ScheduleModal.tsx"
---

# Bookings, clubs, payments

Bookings, follows and chat are **deliberately minimal**: they clone a reference app's screens minus payments. Don't grow them into a real booking or payment platform unless asked.

## Bookings
- **A booking always books a table for an event.** `POST /bookings { eventType: "GAME" | "TOURNAMENT", eventTitle?, setsToWin?, format?, ... }` creates the booking and its event in one transaction. The event inherits club, table, start time (`bookingStartsAt`/`bookingEndsAt` in `shared/booking.ts`) and, for a tournament, `endTime`. There is no way to book without an event.
- `Booking.gameId`/`tournamentId` are `ON DELETE SET NULL`. Cancelling a booking leaves the event alone, and deleting the event just detaches it.
- **Conflicts**: 409 when the table already has an overlapping booking that day. Overlap is computed in minutes since midnight (`timeToMinutes`, `bookingsOverlap`). `date` is normalised to UTC midnight (`startOfUtcDay`). A booking with no `tableId` never clashes.
- `GET /clubs/:id/availability?date=` returns each table's busy intervals.
- New public events at a club notify its followers (`notifyClubFollowers`).

## Payments (`shared/payments.ts`)
- `paymentMode()`: `off` when `PAYMENT_PROVIDER` is unset. `mock` only when it is `mock` **and** not production. The mock must never be the default.
- `GET /bookings/payments` returns `{ enabled, test }`. When off, `BookingsPage` says "pay at the club". A mock-paid booking says "test payment". Prices are roubles in both languages.

## Clubs
- A club is run by its admins: `ClubAdmin` rows, several per club. The creator becomes the first one; `createdById` is only a record of who made it. Any admin, or an app `ADMIN` at any club, can add one (`POST /clubs/:id/admins`) or remove one, themselves included (`DELETE /clubs/:id/admins/:userId`), but never the last (`loadClubForAdmins`). Everything else about a club is gated by `loadOwnedClub`: its admins, or an app `ADMIN` only when it has none left (role from the DB).
- **Rated tournaments**: `Club.ratingStatus` is `NONE` | `PENDING` | `APPROVED`. A club admin asks (`POST /clubs/:id/rating-request`, NONE -> PENDING, notifies app admins); only an app `ADMIN` decides (`POST /clubs/:id/rating-decision { approved }`, -> APPROVED or back to NONE, notifies the club admins). A `TOURNAMENT`-kind event can be created only by an admin of an APPROVED club (`canHoldRatedEvent` in `shared/clubs.ts`); anyone can still create a `GAME`. Withdrawing approval stops new rated events only. Demo events are created by the server and are exempt.
- `GET /clubs/mine` lists the caller's clubs with `ratingStatus`; `EventForm` offers "tournament" only at one of them that is APPROVED. `GET /clubs?ratingStatus=PENDING` is the app admin's queue on `/clubs`.
- `/club/:id` (`ClubPage.tsx`, guest-readable):
  - Contacts: map link and `tel:`.
  - "Book a table" opens `/bookings?club=<id>` (`EventForm`'s `initialClubId`).
  - Follow/unfollow, each table's current state (today's availability).
  - Upcoming events (`GET /tournaments?clubId=`) and recent results (`GET /results?clubId=`).
  - For its admins and app admins: the admin list with add/remove, in its own card.
  - For the app admin: approve/decline/withdraw rated tournaments.
  - For its admins only, folded at the bottom: rating request, editing details, tables and prices.
- `/clubs` (`ClubsPage.tsx`) is the list plus "add a club". Each row shows `minPrice` from `GET /clubs`.
- **Follow** = `Subscription` (`userId`+`clubId` unique, no billing). It is a player's only link to a club.
