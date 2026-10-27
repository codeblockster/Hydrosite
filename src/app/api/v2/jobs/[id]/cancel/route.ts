import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { analysisJobs } from "@/db/schema";
import { requireRole } from "@/lib/server/auth";
import { getJobById } from "@/lib/server/data";
import { ApiError, route } from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner"]);
    const { id } = await context.params;
    if (!/^job_[a-f0-9]{16}$/i.test(id)) throw new ApiError(400, "BAD_PARAM", "The analysis id is invalid.");

    const existing = await getJobById(id, claims);
    if (!existing) throw new ApiError(404, "JOB_NOT_FOUND", "That analysis job could not be found.");
    if (existing.status === "running") {
      const ownership = claims.role === "admin" ? undefined : eq(analysisJobs.userId, claims.userId);
      const where = ownership
        ? and(eq(analysisJobs.id, id), eq(analysisJobs.status, "running"), ownership)
        : and(eq(analysisJobs.id, id), eq(analysisJobs.status, "running"));
      await db.update(analysisJobs)
        .set({ status: "cancelled", finishedAt: new Date() })
        .where(where);
    }

    const job = await getJobById(id, claims);
    if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "That analysis job could not be found.");
    return Response.json(job);
  });
}
