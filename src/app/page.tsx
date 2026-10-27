import { HydroApp } from "@/components/hydro-app";
import type { DashboardData } from "@/lib/contracts";
import { referenceSites } from "@/lib/hydro";
import { getDashboardData } from "@/lib/server/data";

export const dynamic = "force-dynamic";

function fallbackDashboard(): DashboardData {
  const sites = referenceSites().map((site, index) => ({
    id: index + 1,
    code: `HS-${1001 + index}`,
    ...site,
    notes: "",
    createdAt: new Date(Date.now() - index * 36 * 60 * 60 * 1000).toISOString(),
  }));
  return {
    metrics: {
      sites: sites.length,
      totalMw: Math.round(sites.reduce((sum, site) => sum + site.powerKw, 0) / 100) / 10,
      avgScore: Math.round(sites.reduce((sum, site) => sum + site.score, 0) / sites.length * 10) / 10,
      highRisk: sites.filter((site) => site.envRisk === "High").length,
    },
    sites,
    topSites: [...sites].sort((a, b) => b.score - a.score).slice(0, 5),
    jobs: [],
    dataSources: [],
  };
}

export default async function HomePage() {
  let dashboard: DashboardData;
  try {
    dashboard = await getDashboardData();
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "dashboard.rsc_fallback",
      message: error instanceof Error ? error.message : "PostgreSQL read failed",
    }));
    dashboard = fallbackDashboard();
  }
  return <HydroApp initialData={dashboard} />;
}
