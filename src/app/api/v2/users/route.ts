import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/server/auth";
import { ensureBootstrap } from "@/lib/server/bootstrap";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    await requireRole(request, ["admin"]);
    await ensureBootstrap();
    const rows = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      organization: users.organization,
      createdAt: users.createdAt,
    }).from(users).orderBy(asc(users.id));
    return Response.json(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })));
  });
}
