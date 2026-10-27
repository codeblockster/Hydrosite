import { siteCreateSchema } from "@/api/schemas";
import { computeSiteMetrics } from "@/lib/hydro";
import { requireRole } from "@/lib/server/auth";
import { getSiteById, getSitesPage } from "@/lib/server/data";
import { ApiError, readJson, route } from "@/lib/server/http";
import { createCandidate } from "@/lib/server/services/sites";

export const dynamic = "force-dynamic";

function positiveNumber(value: string | null, fallback: number, key: string): number {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "BAD_PARAM", `The ${key} parameter must be a positive integer.`);
  }
  return parsed;
}

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    const params = new URL(request.url).searchParams;
    const page = positiveNumber(params.get("page"), 1, "page");
    const pageSize = positiveNumber(params.get("pageSize"), 12, "pageSize");
    if (pageSize > 200) throw new ApiError(400, "BAD_PARAM", "The pageSize parameter must not exceed 200.");
    const scoreValue = params.get("minScore");
    const sort = params.get("sort") ?? "score";
    const allowedSorts = new Set(["name", "score", "powerKw", "headM", "dischargeQ40", "confidence", "createdAt"]);
    if (!allowedSorts.has(sort)) throw new ApiError(400, "BAD_PARAM", "The requested sort field is not supported.");
    const minScore = scoreValue === null || scoreValue === "" ? undefined : Number(scoreValue);
    if (minScore !== undefined && (!Number.isFinite(minScore) || minScore < 0 || minScore > 100)) {
      throw new ApiError(400, "BAD_PARAM", "The minScore parameter must be between 0 and 100.");
    }
    const data = await getSitesPage({
      q: params.get("q") ?? undefined,
      province: params.get("province") ?? undefined,
      plantType: params.get("plantType") ?? undefined,
      status: params.get("status") ?? undefined,
      envRisk: params.get("envRisk") ?? undefined,
      minScore,
      sort,
      order: params.get("order") === "asc" ? "asc" : "desc",
      page,
      pageSize,
    });
    return Response.json(data);
  });
}

export function POST(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner"]);
    const input = await readJson(request, siteCreateSchema);
    const metrics = computeSiteMetrics({
      lat: input.lat,
      lng: input.lng,
      headM: input.headM,
      dischargeQ40: input.dischargeQ40,
      name: input.name,
      river: input.river,
      district: input.district ?? "Field survey pending",
      province: provinceFor(input.lat, input.lng),
      seed: `${input.name}:${input.lat}:${input.lng}`,
    });
    const created = await createCandidate({
      metrics,
      createdBy: claims.userId,
      notes: input.notes ?? "",
    });
    const site = await getSiteById(created.id);
    if (!site) throw new ApiError(500, "INTERNAL", "The candidate was created but could not be loaded.");
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
