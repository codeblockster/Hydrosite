import "server-only";
import { hash } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analysisJobs, dataSources, sites, users } from "@/db/schema";
import { referenceSites } from "@/lib/hydro";

const sourceRows = [
  { id: "copernicus-dem", name: "Copernicus DEM GLO-30", provider: "ESA / Airbus", category: "Elevation", description: "Global digital surface model for terrain screening.", resolution: "30 m", status: "online", coveragePct: 100, records: 842000, latencyMs: 184 },
  { id: "alos-palsar", name: "ALOS PALSAR RTC", provider: "JAXA / ASF", category: "Elevation", description: "Fine-resolution radar terrain and forest structure.", resolution: "12.5 m", status: "online", coveragePct: 91, records: 128400, latencyMs: 236 },
  { id: "icesat2", name: "ICESat-2 ATL08", provider: "NASA NSIDC", category: "Elevation", description: "Laser altimetry observations used for elevation validation.", resolution: "70 m", status: "syncing", coveragePct: 78, records: 19620, latencyMs: 512 },
  { id: "hydrorivers", name: "HydroRIVERS v1", provider: "WWF / HydroSHEDS", category: "Hydrology", description: "Consistent river network with reach topology and stream order.", resolution: "15 arc-sec", status: "online", coveragePct: 100, records: 38412, latencyMs: 148 },
  { id: "dhm-gauges", name: "DHM Gauge Archive", provider: "Department of Hydrology and Meteorology", category: "Hydrology", description: "Observed flow and rainfall from national gauge stations.", resolution: "Station", status: "degraded", coveragePct: 83, records: 312, latencyMs: 782 },
  { id: "chirps", name: "CHIRPS Precipitation", provider: "UCSB Climate Hazards Center", category: "Climate", description: "Long-term precipitation estimates for catchment context.", resolution: "0.05°", status: "online", coveragePct: 100, records: 95124, latencyMs: 203 },
  { id: "era5-land", name: "ERA5-Land Reanalysis", provider: "ECMWF / Copernicus", category: "Climate", description: "Hourly land-surface climate variables and extremes.", resolution: "9 km", status: "online", coveragePct: 100, records: 437760, latencyMs: 196 },
  { id: "sentinel-2", name: "Sentinel-2 L2A", provider: "Copernicus / ESA", category: "Land cover", description: "Multispectral imagery for land cover and access screening.", resolution: "10 m", status: "online", coveragePct: 97, records: 188200, latencyMs: 264 },
  { id: "worldcover", name: "WorldCover 2021", provider: "ESA WorldCover", category: "Land cover", description: "Global 10 m land-cover map for ecological sensitivity.", resolution: "10 m", status: "online", coveragePct: 100, records: 29400, latencyMs: 173 },
  { id: "wdpa", name: "Protected Planet WDPA", provider: "UNEP-WCMC / IUCN", category: "Environment", description: "Protected-area boundaries for early environmental risk checks.", resolution: "Vector", status: "online", coveragePct: 100, records: 287, latencyMs: 132 },
  { id: "nea-grid", name: "NEA Transmission Grid", provider: "Nepal Electricity Authority", category: "Infrastructure", description: "Transmission corridors and substations for grid-distance estimates.", resolution: "Vector", status: "offline", coveragePct: 72, records: 148, latencyMs: 0 },
  { id: "osm-roads", name: "OpenStreetMap Roads", provider: "OpenStreetMap contributors", category: "Infrastructure", description: "Road access and travel-time proxies for candidate sites.", resolution: "Vector", status: "online", coveragePct: 99, records: 214280, latencyMs: 168 },
] as const;

const historicalJobs = [
  { label: "Langtang tributary screening", lat: 28.12, lng: 85.42, bufferKm: 6 },
  { label: "Myagdi basin head survey", lat: 28.5, lng: 83.5, bufferKm: 4 },
  { label: "Arun corridor pre-feasibility", lat: 27.6, lng: 87.3, bufferKm: 8 },
  { label: "Karnali lower gorge", lat: 28.85, lng: 81.5, bufferKm: 5 },
] as const;

export async function ensureBootstrap(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(19022026)`);
    let [planner] = await tx.select().from(users).where(eq(users.email, "planner@hydrosite.np")).limit(1);
    if (!planner) {
      await tx
        .insert(users)
        .values([
          {
            email: "admin@hydrosite.np",
            name: "Aarati Shrestha",
            passwordHash: await hash("admin123", 10),
            role: "admin",
            organization: "MoEWRI",
          },
          {
            email: "planner@hydrosite.np",
            name: "Bikash Gurung",
            passwordHash: await hash("planner123", 10),
            role: "planner",
            organization: "Investment Board Nepal",
          },
          {
            email: "investor@hydrosite.np",
            name: "Sita Rai",
            passwordHash: await hash("investor123", 10),
            role: "viewer",
            organization: "Himalayan Renewables Fund",
          },
        ])
        .onConflictDoNothing();
      [planner] = await tx.select().from(users).where(eq(users.email, "planner@hydrosite.np")).limit(1);
    }

    const existingSites = await tx.select({ id: sites.id }).from(sites).limit(1);
    if (existingSites.length === 0 && planner) {
      const created = referenceSites();
      await tx.insert(sites).values(
        created.map((site, index) => {
          const createdAt = new Date(Date.now() - (index + 1) * 36 * 60 * 60 * 1000);
          return {
            code: `HS-${1001 + index}`,
            ...site,
            createdBy: planner.id,
            notes: index === 0 ? "Promising run-of-river reach; confirm access alignment during field reconnaissance." : "",
            createdAt,
            updatedAt: createdAt,
          };
        }),
      ).onConflictDoNothing();
    }

    await tx.insert(dataSources).values(
      sourceRows.map((source) => ({ ...source, enabled: source.status !== "offline" })),
    ).onConflictDoNothing();

    const seedUser = planner;
    if (seedUser) {
      for (const [index, job] of historicalJobs.entries()) {
        const jobId = `job_${(0x19a2bcde + index * 0x1020304).toString(16).padStart(16, "0")}`;
        const exists = await tx.select({ id: analysisJobs.id }).from(analysisJobs).where(eq(analysisJobs.id, jobId)).limit(1);
        if (exists.length === 0) {
          const startedAt = new Date(Date.now() - (index + 1) * 20 * 60 * 60 * 1000);
          await tx.insert(analysisJobs).values({
            id: jobId,
            userId: seedUser.id,
            label: job.label,
            lat: job.lat,
            lng: job.lng,
            bufferKm: job.bufferKm,
            options: { superResolution: index % 2 === 0, efficiency: 0.85, environmental: true },
            status: "completed",
            durationMs: 5600,
            startedAt,
            finishedAt: new Date(startedAt.getTime() + 5600),
            result: { candidateCount: 4 + index, bestScore: 77.4 - index * 2.2, potentialMw: 24.6 - index * 3.1 },
          });
        }
      }
    }

    await tx.execute(sql`select 1`);
  });
}
