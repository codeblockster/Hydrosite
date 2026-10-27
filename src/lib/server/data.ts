import "server-only";
import { and, asc, count, desc, eq, gte, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { analysisJobs, dataSources, sites, userSettings, users } from "@/db/schema";
import type { DashboardData, DataSourceRecord, JobSnapshot, PaginatedSites } from "@/lib/contracts";
import type { Criterion, SiteRecord, SiteStatus } from "@/lib/hydro";
import { DEFAULT_WEIGHTS } from "@/lib/hydro";
import { ensureBootstrap } from "@/lib/server/bootstrap";
import { jobResultFor, snapshotJob } from "@/lib/server/engine";

export interface JobAccess {
  userId: number;
  role: string;
}

export interface SiteFilters {
  q?: string;
  province?: string;
  plantType?: string;
  status?: string;
  envRisk?: string;
  minScore?: number;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

function toSiteRecord(row: typeof sites.$inferSelect): SiteRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    river: row.river,
    basin: row.basin,
    province: row.province,
    district: row.district,
    lat: row.lat,
    lng: row.lng,
    headM: row.headM,
    dischargeQ40: row.dischargeQ40,
    slopePct: row.slopePct,
    catchmentKm2: row.catchmentKm2,
    powerKw: row.powerKw,
    plantType: row.plantType as SiteRecord["plantType"],
    score: row.score,
    envRisk: row.envRisk as SiteRecord["envRisk"],
    confidence: row.confidence,
    status: row.status as SiteStatus,
    subscores: row.subscores as Record<Criterion, number>,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDataSourceRecord(row: typeof dataSources.$inferSelect): DataSourceRecord {
  return {
    ...row,
    lastSync: row.lastSync.toISOString(),
  };
}

async function allSiteRecords(): Promise<SiteRecord[]> {
  const rows = await db.select().from(sites).orderBy(desc(sites.score));
  return rows.map(toSiteRecord);
}

async function freshJobSnapshots(owner?: JobAccess): Promise<JobSnapshot[]> {
  const rows = owner && owner.role !== "admin"
    ? await db.select().from(analysisJobs).where(eq(analysisJobs.userId, owner.userId)).orderBy(desc(analysisJobs.createdAt)).limit(30)
    : await db.select().from(analysisJobs).orderBy(desc(analysisJobs.createdAt)).limit(30);
  const now = Date.now();
  const snapshots: JobSnapshot[] = [];
  for (const row of rows) {
    const jobLike = {
      id: row.id,
      label: row.label,
      lat: row.lat,
      lng: row.lng,
      bufferKm: row.bufferKm,
      status: row.status,
      startedAt: row.startedAt,
      durationMs: row.durationMs,
      result: row.result,
    };
    if (row.status === "running" && now - row.startedAt.getTime() >= row.durationMs) {
      const result = jobResultFor(jobLike);
      await db.update(analysisJobs)
        .set({ status: "completed", finishedAt: new Date(), result })
        .where(and(eq(analysisJobs.id, row.id), eq(analysisJobs.status, "running")));
      snapshots.push(snapshotJob({ ...jobLike, status: "completed", result }, now));
    } else {
      snapshots.push(snapshotJob(jobLike, now));
    }
  }
  return snapshots;
}

export async function getDashboardData(): Promise<DashboardData> {
  await ensureBootstrap();
  const [allSites, sourceRows] = await Promise.all([
    allSiteRecords(),
    db.select().from(dataSources).orderBy(dataSources.name),
  ]);
  const totalPower = allSites.reduce((sum, site) => sum + site.powerKw, 0);
  const averageScore = allSites.length > 0
    ? allSites.reduce((sum, site) => sum + site.score, 0) / allSites.length
    : 0;
  return {
    metrics: {
      sites: allSites.length,
      totalMw: Math.round((totalPower / 1000) * 10) / 10,
      avgScore: Math.round(averageScore * 10) / 10,
      highRisk: allSites.filter((site) => site.envRisk === "High").length,
    },
    sites: allSites,
    topSites: [...allSites].sort((a, b) => b.score - a.score).slice(0, 5),
    jobs: [],
    dataSources: sourceRows.map(toDataSourceRecord),
  };
}

export async function getSitesPage(filters: SiteFilters = {}): Promise<PaginatedSites> {
  await ensureBootstrap();
  const conditions: SQL[] = [];
  const query = filters.q?.trim();
  if (query) {
    const escaped = query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const pattern = `%${escaped}%`;
    const search = or(
      ilike(sites.name, pattern),
      ilike(sites.code, pattern),
      ilike(sites.river, pattern),
      ilike(sites.district, pattern),
    );
    if (search) conditions.push(search);
  }
  if (filters.province) conditions.push(eq(sites.province, filters.province));
  if (filters.plantType) conditions.push(eq(sites.plantType, filters.plantType));
  if (filters.status) conditions.push(eq(sites.status, filters.status));
  if (filters.envRisk) conditions.push(eq(sites.envRisk, filters.envRisk));
  if (typeof filters.minScore === "number") conditions.push(gte(sites.score, filters.minScore));
  const where = conditions.length ? and(...conditions) : undefined;

  const sortColumns = {
    name: sites.name,
    score: sites.score,
    powerKw: sites.powerKw,
    headM: sites.headM,
    dischargeQ40: sites.dischargeQ40,
    confidence: sites.confidence,
    createdAt: sites.createdAt,
  } as const;
  const sortColumn = sortColumns[filters.sort as keyof typeof sortColumns] ?? sites.score;
  const orderBy = filters.order === "asc" ? asc(sortColumn) : desc(sortColumn);
  const pageSize = Math.max(1, Math.min(200, Math.floor(filters.pageSize ?? 12)));
  const [{ total = 0 } = { total: 0 }] = await db
    .select({ total: count() })
    .from(sites)
    .where(where);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(totalPages, Math.floor(filters.page ?? 1)));
  const rows = await db
    .select()
    .from(sites)
    .where(where)
    .orderBy(orderBy, asc(sites.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    items: rows.map(toSiteRecord),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getSiteById(id: number): Promise<SiteRecord | null> {
  await ensureBootstrap();
  const [row] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return row ? toSiteRecord(row) : null;
}

export async function getJobById(id: string, owner?: JobAccess): Promise<JobSnapshot | null> {
  await ensureBootstrap();
  const [row] = owner && owner.role !== "admin"
    ? await db.select().from(analysisJobs).where(and(eq(analysisJobs.id, id), eq(analysisJobs.userId, owner.userId))).limit(1)
    : await db.select().from(analysisJobs).where(eq(analysisJobs.id, id)).limit(1);
  if (!row) return null;
  const jobLike = {
    id: row.id,
    label: row.label,
    lat: row.lat,
    lng: row.lng,
    bufferKm: row.bufferKm,
    status: row.status,
    startedAt: row.startedAt,
    durationMs: row.durationMs,
    result: row.result,
  };
  if (row.status === "running" && Date.now() - row.startedAt.getTime() >= row.durationMs) {
    const result = jobResultFor(jobLike);
    await db.update(analysisJobs)
      .set({ status: "completed", finishedAt: new Date(), result })
      .where(and(eq(analysisJobs.id, row.id), eq(analysisJobs.status, "running")));
    return snapshotJob({ ...jobLike, status: "completed", result });
  }
  return snapshotJob(jobLike);
}

export async function listJobSnapshots(owner?: JobAccess): Promise<JobSnapshot[]> {
  await ensureBootstrap();
  return freshJobSnapshots(owner);
}

export async function getDataSources(): Promise<DataSourceRecord[]> {
  await ensureBootstrap();
  const rows = await db.select().from(dataSources).orderBy(dataSources.category, dataSources.name);
  return rows.map(toDataSourceRecord);
}

export async function getPlannerSettings(): Promise<Record<string, unknown>> {
  await ensureBootstrap();
  const [planner] = await db.select().from(users).where(eq(users.email, "planner@hydrosite.np")).limit(1);
  if (!planner) return { weights: DEFAULT_WEIGHTS, bufferKm: 5, efficiency: 0.85, theme: "dark", basemap: "dark" };
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, planner.id)).limit(1);
  return row?.settings ?? { weights: DEFAULT_WEIGHTS, bufferKm: 5, efficiency: 0.85, theme: "dark", basemap: "dark" };
}
