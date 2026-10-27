import { reportCreateSchema } from "@/api/schemas";
import { requireRole } from "@/lib/server/auth";
import { ApiError, readJson, route } from "@/lib/server/http";
import { createReport, listReports } from "@/lib/server/services/workspace";

export const dynamic = "force-dynamic";

function parseSiteId(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "BAD_PARAM", "The siteId parameter is invalid.");
  return id;
}

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    await requireRole(request, ["admin", "planner", "viewer"]);
    const siteId = parseSiteId(new URL(request.url).searchParams.get("siteId"));
    return Response.json(await listReports(siteId));
  });
}

export function POST(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner"]);
    const input = await readJson(request, reportCreateSchema);
    return Response.json(await createReport(input.siteId, claims.userId), { status: 201 });
  });
}
