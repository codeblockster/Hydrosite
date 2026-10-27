import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/server/auth";
import { ensureBootstrap } from "@/lib/server/bootstrap";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner", "viewer"]);
    await ensureBootstrap();
    const [user] = await db.select({ organization: users.organization }).from(users).where(eq(users.id, claims.userId)).limit(1);
    return Response.json({ ...claims, organization: user?.organization ?? "" });
  });
}
