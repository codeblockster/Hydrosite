import { eq } from "drizzle-orm";
import { settingsSchema } from "@/api/schemas";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { DEFAULT_WEIGHTS } from "@/lib/hydro";
import { requireRole } from "@/lib/server/auth";
import { ensureBootstrap } from "@/lib/server/bootstrap";
import { ApiError, readJson, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS = {
  weights: DEFAULT_WEIGHTS,
  bufferKm: 5,
  efficiency: 0.85,
  theme: "dark",
  basemap: "dark",
  units: "metric",
};

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner", "viewer"]);
    await ensureBootstrap();
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, claims.userId)).limit(1);
    return Response.json(row?.settings ?? DEFAULT_SETTINGS);
  });
}

export function PUT(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner"]);
    const input = await readJson(request, settingsSchema);
    if (input.weights) {
      const total = Object.values(input.weights).reduce((sum, weight) => sum + weight, 0);
      if (total <= 0) throw new ApiError(422, "VALIDATION_ERROR", "At least one feasibility criterion must have a positive weight.");
      const normalized = Object.fromEntries(Object.entries(input.weights).map(([key, value]) => [key, value / total]));
      input.weights = normalized as typeof input.weights;
    }
    await ensureBootstrap();
    const [previous] = await db.select().from(userSettings).where(eq(userSettings.userId, claims.userId)).limit(1);
    const settings = { ...DEFAULT_SETTINGS, ...(previous?.settings ?? {}), ...input };
    await db.insert(userSettings).values({ userId: claims.userId, settings, updatedAt: new Date() })
      .onConflictDoUpdate({ target: userSettings.userId, set: { settings, updatedAt: new Date() } });
    return Response.json(settings);
  });
}
