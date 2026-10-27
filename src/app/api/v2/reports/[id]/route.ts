import { requireRole } from "@/lib/server/auth";
import { ApiError, route } from "@/lib/server/http";
import { deleteReport } from "@/lib/server/services/workspace";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner"]);
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "BAD_PARAM", "The report id is invalid.");
    await deleteReport(id, claims);
    return Response.json({ ok: true, id });
  });
}
