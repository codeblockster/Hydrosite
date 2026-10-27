import { jobCreateSchema } from "@/api/schemas";
import { db } from "@/db";
import { analysisJobs } from "@/db/schema";
import { requireRole } from "@/lib/server/auth";
import { listJobSnapshots } from "@/lib/server/data";
import { ApiError, readJson, route } from "@/lib/server/http";
import { snapshotJob } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner", "viewer"]);
    return Response.json(await listJobSnapshots(claims));
  });
}

export function POST(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner"]);
    const input = await readJson(request, jobCreateSchema);
    const randomHex = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const id = `job_${randomHex}`;
    const startedAt = new Date();
    const durationMs = input.superResolution ? 6400 : 4600;
    const [job] = await db.insert(analysisJobs).values({
      id,
      userId: claims.userId,
      label: input.label,
      lat: input.lat,
      lng: input.lng,
      bufferKm: input.bufferKm,
      options: {
        efficiency: input.efficiency,
        superResolution: input.superResolution,
        environmental: input.environmental,
      },
      status: "running",
      durationMs,
      startedAt,
      createdAt: startedAt,
    }).returning();
    if (!job) throw new ApiError(500, "INTERNAL", "The analysis could not be started.");
    return Response.json(snapshotJob({
      id: job.id,
      label: job.label,
      lat: job.lat,
      lng: job.lng,
      bufferKm: job.bufferKm,
      status: job.status,
      startedAt: job.startedAt,
      durationMs: job.durationMs,
      result: job.result,
    }), { status: 201 });
  });
}
