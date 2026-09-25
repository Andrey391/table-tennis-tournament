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
- A club's manager is `createdById`. A club with no manager is editable only by an `ADMIN` (role from the DB).
- `/club/:id` (`ClubPage.tsx`, guest-readable):
  - Contacts: map link and `tel:`.
  - "Book a table" opens `/bookings?club=<id>` (`EventForm`'s `initialClubId`).
  - Follow/unfollow, each table's current state (today's availability).
  - Upcoming events (`GET /tournaments?clubId=`) and recent results (`GET /results?clubId=`).
  - For the manager only, folded at the bottom: editing details, tables and prices.
- `/clubs` (`ClubsPage.tsx`) is the list plus "add a club". Each row shows `minPrice` from `GET /clubs`.
- **Follow** = `Subscription` (`userId`+`clubId` unique, no billing). It is a player's only link to a club.
