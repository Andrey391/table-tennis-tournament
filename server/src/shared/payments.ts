import { ClubTable, Booking } from "@prisma/client";

// A booking's price is a snapshot, not a live lookup: it is computed once at
// booking time from the table's current pricePerHour, and stored on the
// booking itself (Booking.priceTotal). A later price change on the table must
// never reshape a booking that already exists.
export function computeBookingPrice(table: Pick<ClubTable, "pricePerHour"> | null, durationHours: number): number | null {
  if (!table || table.pricePerHour == null) return null;
  return Math.round(table.pricePerHour * durationHours * 100) / 100;
}

// --------------------------------------------------------------------------
// Payment provider seam.
//
// No real gateway is wired up here: doing that needs a merchant account and
// live API keys (Stripe, YooKassa/СБП, ...) that only the operator can supply,
// and faking a "successful" charge would be worse than not billing at all.
// What this gives instead is the seam a real integration plugs into —
// `initiatePayment` starts a charge and returns where to send the payer,
// and a provider's webhook handler is expected to call `confirmPayment`
// once the provider itself confirms funds moved.
//
// PAYMENT_PROVIDER unset (the default everywhere until an operator sets it)
// runs `mockProvider`, which confirms the payment immediately with no money
// changing hands — good enough to exercise the booking flow end to end in
// dev/staging, and it is the only mode that works without any provider
// credentials. Wire a real provider by adding a case below that calls out to
// its SDK and reads its own webhook signature, then setting PAYMENT_PROVIDER.
// --------------------------------------------------------------------------

export interface PaymentIntent {
  paymentRef: string;
  // Where the client should send the payer to complete the charge. The mock
  // provider has nothing to redirect to, so this is null and the booking is
  // simply marked paid on the spot.
  redirectUrl: string | null;
}

export async function initiatePayment(booking: Pick<Booking, "id" | "priceTotal">): Promise<PaymentIntent> {
  const provider = process.env.PAYMENT_PROVIDER;
  if (!provider || provider === "mock") {
    return { paymentRef: `mock_${booking.id}`, redirectUrl: null };
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${provider}" — no gateway integration is wired up yet`);
}

// Marks a booking paid. In the mock flow this runs synchronously right after
// initiatePayment; a real provider would instead call this from its webhook
// handler, after verifying the webhook's signature, never from a client call.
export function isMockPayment(paymentRef: string): boolean {
  return paymentRef.startsWith("mock_");
}
