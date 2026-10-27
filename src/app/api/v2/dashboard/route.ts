import { getDashboardData } from "@/lib/server/data";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return route(request, async () => Response.json(await getDashboardData()));
}
