import { eq } from "drizzle-orm";
import { sitePatchSchema } from "@/api/schemas";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { requireRole } from "@/lib/server/auth";
import { getSiteById } from "@/lib/server/data";
import { ApiError, readJson, route } from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "BAD_PARAM", "The site id is invalid.");
  return id;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    const id = parseId((await context.params).id);
    const site = await getSiteById(id);
    if (!site) throw new ApiError(404, "SITE_NOT_FOUND", "That candidate site could not be found.");
    return Response.json(site);
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    await requireRole(request, ["admin", "planner"]);
    const id = parseId((await context.params).id);
    const input = await readJson(request, sitePatchSchema);
    const [updated] = await db.update(sites).set({ ...input, updatedAt: new Date() }).where(eq(sites.id, id)).returning({ id: sites.id });
    if (!updated) throw new ApiError(404, "SITE_NOT_FOUND", "That candidate site could not be found.");
    return Response.json(await getSiteById(id));
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    await requireRole(request, ["admin", "planner"]);
    const id = parseId((await context.params).id);
    const [deleted] = await db.delete(sites).where(eq(sites.id, id)).returning({ id: sites.id });
    if (!deleted) throw new ApiError(404, "SITE_NOT_FOUND", "That candidate site could not be found.");
    return Response.json({ ok: true, id });
  });
}
