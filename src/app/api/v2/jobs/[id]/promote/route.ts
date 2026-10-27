import { z } from "zod";
import { computeSiteMetrics } from "@/lib/hydro";
import { requireRole } from "@/lib/server/auth";
import { getJobById, getSiteById } from "@/lib/server/data";
import { ApiError, readJson, route } from "@/lib/server/http";
import { createCandidate } from "@/lib/server/services/sites";

const promoteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  district: z.string().trim().min(2).max(100),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner"]);
    const { id } = await context.params;
    if (!/^job_[a-f0-9]{16}$/i.test(id)) throw new ApiError(400, "BAD_PARAM", "The analysis id is invalid.");
    const input = await readJson(request, promoteSchema);
    const job = await getJobById(id, claims);
    if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "That analysis job could not be found.");
    if (job.status !== "completed") throw new ApiError(409, "JOB_NOT_COMPLETE", "Wait for the analysis to finish before promoting it.");

    const metrics = computeSiteMetrics({
      lat: job.lat,
      lng: job.lng,
      name: input.name,
      district: input.district,
      river: "Screened reach",
      basin: "Nepal river basin",
      province: provinceFor(job.lat, job.lng),
      seed: id,
    });
    const created = await createCandidate({
      metrics,
      createdBy: claims.userId,
      notes: `Promoted from ${job.label} (${id}). Buffer ${job.bufferKm} km.`,
      promotionJobId: id,
    });
    const site = await getSiteById(created.id);
    if (!site) throw new ApiError(500, "INTERNAL", "The candidate was promoted but could not be loaded.");
    return Response.json(site, { status: 201 });
  });
}

function provinceFor(lat: number, lng: number): string {
  if (lng >= 86.5) return "Koshi Province";
  if (lng >= 85.15) return lat > 27.2 ? "Bagmati Province" : "Madhesh Province";
  if (lng >= 83.1) return lat > 28.4 ? "Gandaki Province" : "Lumbini Province";
  if (lng >= 81.6) return "Karnali Province";
  return "Sudurpashchim Province";
}
