import { requireRole } from "@/lib/server/auth";
import { getJobById } from "@/lib/server/data";
import { ApiError, route } from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner", "viewer"]);
    const { id } = await context.params;
    if (!/^job_[a-f0-9]{16}$/i.test(id)) throw new ApiError(400, "BAD_PARAM", "The analysis id is invalid.");
    const job = await getJobById(id, claims);
    if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "That analysis job could not be found.");
    return Response.json(job);
  });
}
