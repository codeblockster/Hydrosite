import { uploadCreateSchema } from "@/api/schemas";
import { requireRole } from "@/lib/server/auth";
import { ensureBootstrap } from "@/lib/server/bootstrap";
import { readJson, route } from "@/lib/server/http";
import { importSitesCsv, listUploads } from "@/lib/server/services/workspace";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner", "viewer"]);
    await ensureBootstrap();
    return Response.json(await listUploads(claims.userId, claims.role));
  });
}

export function POST(request: Request): Promise<Response> {
  return route(request, async () => {
    const claims = await requireRole(request, ["admin", "planner"]);
    const input = await readJson(request, uploadCreateSchema);
    const result = await importSitesCsv({ ...input, userId: claims.userId });
    if (result.rowsImported === 0) {
      return Response.json({
        error: {
          status: 422,
          code: "VALIDATION_ERROR",
          message: "No rows in that file could be imported.",
          details: result.errors.length ? result.errors : ["Add at least one row with a name and Nepal coordinates."],
        },
      }, { status: 422 });
    }
    return Response.json(result, { status: 201 });
  });
}
