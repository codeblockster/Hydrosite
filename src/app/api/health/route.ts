import { db } from "@/db";
import { sql } from "drizzle-orm";
import { describeRuntimeConfig } from "@/lib/server/env";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    await db.execute(sql`select 1`);
    await db.execute(sql`select session_version from users limit 0`);
    return Response.json({
      ok: true,
      checks: {
        database: "ok",
        schema: "ready",
        ...describeRuntimeConfig(),
      },
      timestamp: new Date().toISOString(),
    });
  });
}
