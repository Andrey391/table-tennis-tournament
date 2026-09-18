// What a failed request may tell the client. A Prisma error carries table and
// column names (and sometimes the query), so it is logged and replaced; a Zod
// error is reduced to its first issue; our own thrown messages pass through.
export function publicError(err: any): string {
  if (err?.name === "ZodError" && Array.isArray(err.issues) && err.issues[0]) {
    const i = err.issues[0];
    return i.path?.length ? `${i.path.join(".")}: ${i.message}` : i.message;
  }
  if (typeof err?.name === "string" && err.name.startsWith("PrismaClient")) {
    console.error("[DB]", err.message);
    return "Invalid request";
  }
  return err?.message || "Invalid request";
}
