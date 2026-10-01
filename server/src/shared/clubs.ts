import { prisma } from "../config/db";

// Who runs a club, and who may hold a rated event there.
//
// A club is run by its ClubAdmin rows (several people, the creator first). An
// app ADMIN — the role read from the database, never from the token — approves
// a club for rated tournaments and stands in for the admins of a club that has
// none left.

export const RATED_EVENT_FORBIDDEN = "Only an admin of a club approved for rated tournaments can create one";

export async function isAppAdmin(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } });
  return me?.role === "ADMIN" && !me.deletedAt;
}

export async function isClubAdmin(clubId: string, userId: string) {
  return !!(await prisma.clubAdmin.findUnique({ where: { clubId_userId: { clubId, userId } }, select: { userId: true } }));
}

// A rated (TOURNAMENT-kind) event is created only by an admin of the club it is
// held at, and only once an app ADMIN has approved that club for rated play.
export async function canHoldRatedEvent(clubId: string | null | undefined, userId: string) {
  if (!clubId) return false;
  const row = await prisma.clubAdmin.findUnique({
    where: { clubId_userId: { clubId, userId } },
    select: { club: { select: { ratingStatus: true } } },
  });
  return row?.club.ratingStatus === "APPROVED";
}
