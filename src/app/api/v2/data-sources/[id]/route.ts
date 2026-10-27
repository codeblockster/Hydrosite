import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dataSources } from "@/db/schema";
import { requireRole } from "@/lib/server/auth";
import { getDataSources } from "@/lib/server/data";
import { ApiError, readJson, route } from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };
const toggleSchema = z.object({ enabled: z.boolean() }).strict();

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    await requireRole(request, ["admin", "planner"]);
    const { id } = await context.params;
    const input = await readJson(request, toggleSchema);
    const [updated] = await db.update(dataSources)
      .set({ enabled: input.enabled })
      .where(eq(dataSources.id, id))
      .returning({ id: dataSources.id });
    if (!updated) throw new ApiError(404, "DATA_SOURCE_NOT_FOUND", "That data source could not be found.");
    const source = (await getDataSources()).find((entry) => entry.id === id);
    return Response.json(source);
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    await requireRole(request, ["admin", "planner"]);
    const { id } = await context.params;
    const [updated] = await db.update(dataSources)
      .set({ status: "online", lastSync: new Date(), latencyMs: 180 })
      .where(eq(dataSources.id, id))
      .returning({ id: dataSources.id });
    if (!updated) throw new ApiError(404, "DATA_SOURCE_NOT_FOUND", "That data source could not be found.");
    const source = (await getDataSources()).find((entry) => entry.id === id);
    return Response.json(source, { status: 202 });
  });
}
