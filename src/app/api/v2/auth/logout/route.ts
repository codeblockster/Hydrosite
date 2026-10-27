import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/server/auth";
import { ApiError, route } from "@/lib/server/http";

export function POST(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner", "viewer"]);
    const [revoked] = await db.update(users)
      .set({ sessionVersion: claims.sessionVersion + 1 })
      .where(and(
        eq(users.id, claims.userId),
        eq(users.sessionVersion, claims.sessionVersion),
      ))
      .returning({ id: users.id });
    if (!revoked) throw new ApiError(401, "TOKEN_INVALID", "This session has already been revoked.");
    return Response.json({ ok: true });
  });
}
