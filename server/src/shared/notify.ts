import { prisma } from "../config/db";

// Every kind of notification the app writes. The client turns `type` + `params`
// into text (`notif.<type>` in client/src/i18n), so adding a type means adding
// its key on both language sides there.
export type NotificationType =
  | "JOIN_REQUEST"        // manager: someone asked to join their event
  | "JOIN_APPROVED"       // player: the manager let them in
  | "JOIN_DECLINED"       // player: the manager turned their request down
  | "ADDED_TO_EVENT"      // player: the manager put them on the roster directly
  | "REMOVED_FROM_EVENT"  // player: the manager took them off the roster
  | "ROUND_PAIRED"        // player: next round is out, here is the opponent and table
  | "ROUND_BYE"           // player: sitting this round out
  | "MATCH_WON"           // player: their match was settled in their favour
  | "MATCH_LOST"
  | "WALKOVER_WON"        // player: the opponent did not show up
  | "WALKOVER_LOST"
  | "MATCH_REOPENED"      // player: the manager took a settled match back
  | "EVENT_COMPLETED"     // participants: every match is played, the table is final
  | "EVENT_DELETED"       // participants: the event is gone
  | "CHAT_MESSAGE"        // participants: someone wrote in the event chat
  | "QUICK_GAME"          // opponent: someone recorded a game played against them
  | "CLUB_NEW_EVENT";     // followers of a club: a new public event there

export interface NewNotification {
  userId: string;
  type: NotificationType;
  params?: Record<string, string | number | null>;
  link?: string;
  tournamentId?: string;
}

// How long a notification is kept. An inbox is not an archive: the events,
// matches and ratings it points at are all still there after it is gone.
export const NOTIFICATION_TTL_DAYS = 60;

// "Иван П." — same shape as playerName() in the client, so a name reads the same
// in a notification as everywhere else in the app.
export const shortName = (p?: { firstName?: string | null; lastName?: string | null } | null) => {
  const first = p?.firstName?.trim();
  if (!first) return "";
  const initial = p?.lastName?.trim()?.[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
};

// Writes notifications as a side effect of whatever just happened. It never
// throws: the route that calls it has already done its real work (settled a
// match, paired a round), and a failed inbox write must not turn that into an
// error on the judge's screen. `actorId` is left out of the recipients — nobody
// needs telling about what they have just done themselves.
export async function notify(items: NewNotification[], actorId?: string | null): Promise<void> {
  const rows = items.filter((n) => n.userId && n.userId !== actorId);
  if (!rows.length) return;
  try {
    await prisma.notification.createMany({
      data: rows.map((n) => ({ userId: n.userId, type: n.type, params: n.params ?? undefined, link: n.link ?? null, tournamentId: n.tournamentId ?? null })),
    });
  } catch (err: any) {
    console.error("[NOTIFY]", err?.message);
  }
}

// Everyone taking part in an event (plus its manager), for notifications that
// concern the whole room. Pending requests are included only when asked.
export async function eventAudience(tournamentId: string, withPending = false): Promise<string[]> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { organizerId: true, players: { where: { status: { in: withPending ? ["REGISTERED", "PENDING"] : ["REGISTERED"] } }, select: { userId: true } } },
  });
  if (!t) return [];
  return [...new Set([t.organizerId, ...t.players.map((p) => p.userId)])];
}

// A new public event at a club tells everyone following that club. Private
// events (a solo practice booking, a demo) stay quiet, same as they stay out of
// the feed.
export async function notifyClubFollowers(event: { id: string; name: string; clubId: string | null; isPublic: boolean; startTime: Date | null; kind: string }, actorId: string) {
  if (!event.clubId || !event.isPublic) return;
  try {
    const [club, subs] = await Promise.all([
      prisma.club.findUnique({ where: { id: event.clubId }, select: { name: true } }),
      prisma.subscription.findMany({ where: { clubId: event.clubId }, select: { userId: true } }),
    ]);
    await notify(subs.map((s) => ({
      userId: s.userId, type: "CLUB_NEW_EVENT" as const, tournamentId: event.id, link: `/tournament/${event.id}`,
      params: { event: event.name, club: club?.name ?? "", kind: event.kind, startTime: event.startTime?.toISOString() ?? null },
    })), actorId);
  } catch (err: any) {
    console.error("[NOTIFY club]", err?.message);
  }
}
