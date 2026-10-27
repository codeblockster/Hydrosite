import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reports, sites, uploads, users } from "@/db/schema";
import {
  CRITERIA,
  calculateAHP,
  computeSiteMetrics,
  matrixFromWeights,
  type Criterion,
  type SiteMetrics,
  type SiteRecord,
  DEFAULT_WEIGHTS,
} from "@/lib/hydro";
import { ApiError } from "@/lib/server/http";
import { importCandidates } from "@/lib/server/services/sites";

export interface ReportRecord {
  id: number;
  siteId: number | null;
  siteCode: string | null;
  siteName: string | null;
  status: string;
  createdAt: string;
  content: Record<string, unknown>;
}

/** Deterministic next-step guidance, mirroring the v1 rule set. */
export function recommendationsFor(site: SiteRecord): string[] {
  const out: string[] = [];
  if (site.score >= 70) out.push("Advance to detailed feasibility study and secure a survey licence.");
  else if (site.score >= 55) out.push("Schedule a targeted field reconnaissance before detailed design.");
  else out.push("Deprioritise for this screening cycle; revisit after source-data refresh.");
  if (site.subscores.grid < 50) out.push("Plan an evacuation line; the nearest transmission corridor is distant.");
  if (site.subscores.hydrology > 70) out.push("Install a seasonal gauge to validate the strong hydrology signal.");
  if (site.plantType === "Large") out.push("Assess storage potential and flood-probable reservoir sizing early.");
  if (site.subscores.accessibility < 45) out.push("Budget additional logistics cost for access road construction.");
  if (out.length === 0) out.push("Monitor the reach through the next data refresh before committing study budget.");
  return out;
}

export function risksFor(site: SiteRecord): string[] {
  const out: string[] = [];
  if (site.envRisk === "High") out.push("High environmental sensitivity: full EIA and ecological flow study required.");
  else if (site.envRisk === "Medium") out.push("Medium environmental sensitivity: IEE screening likely sufficient.");
  if (site.confidence < 0.75) out.push("Cross-source confidence below 0.75; verify assumptions in the field.");
  if (site.slopePct > 15) out.push("Steep terrain: assess landslide and GLOF hazard along the headrace alignment.");
  if (site.subscores.socioEconomic < 45) out.push("Low socio-economic subscore: confirm resettlement and benefit-sharing context.");
  if (out.length === 0) out.push("No elevated risk flags in the deterministic screen.");
  return out;
}

function consistencyRatio(weights: Record<Criterion, number>): number {
  const values = CRITERIA.map(({ key }) => weights[key] ?? 0);
  if (values.some((value) => value <= 0)) return 0;
  try {
    return calculateAHP(matrixFromWeights(values)).consistencyRatio;
  } catch {
    return 0;
  }
}

export async function listReports(siteId?: number): Promise<ReportRecord[]> {
  const rows = siteId
    ? await db.select().from(reports).where(eq(reports.siteId, siteId)).orderBy(desc(reports.createdAt)).limit(20)
    : await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(40);
  if (rows.length === 0) return [];
  const siteRows = await db.select({ id: sites.id, code: sites.code, name: sites.name }).from(sites);
  const byId = new Map(siteRows.map((row) => [row.id, row]));
  return rows.map((row) => ({
    id: row.id,
    siteId: row.siteId,
    siteCode: row.siteId ? byId.get(row.siteId)?.code ?? null : null,
    siteName: row.siteId ? byId.get(row.siteId)?.name ?? null : null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    content: (row.content ?? {}) as Record<string, unknown>,
  }));
}

export async function createReport(siteId: number, userId: number): Promise<ReportRecord> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new ApiError(404, "SITE_NOT_FOUND", "That candidate site could not be found.");
  const [owner] = await db.select({ name: users.name, organization: users.organization }).from(users).where(eq(users.id, userId)).limit(1);
  const record: SiteRecord = {
    id: site.id,
    code: site.code,
    name: site.name,
    river: site.river,
    basin: site.basin,
    province: site.province,
    district: site.district,
    lat: site.lat,
    lng: site.lng,
    headM: site.headM,
    dischargeQ40: site.dischargeQ40,
    slopePct: site.slopePct,
    catchmentKm2: site.catchmentKm2,
    powerKw: site.powerKw,
    plantType: site.plantType as SiteRecord["plantType"],
    score: site.score,
    envRisk: site.envRisk as SiteRecord["envRisk"],
    confidence: site.confidence,
    status: site.status as SiteRecord["status"],
    subscores: site.subscores as Record<Criterion, number>,
    notes: site.notes,
    createdAt: site.createdAt.toISOString(),
  };
  const weights = DEFAULT_WEIGHTS;
  const content = {
    title: `${record.name} — feasibility snapshot`,
    generatedBy: owner?.name ?? "HydroSite workspace",
    organization: owner?.organization ?? "",
    score: record.score,
    plantType: record.plantType,
    powerKw: record.powerKw,
    headM: record.headM,
    dischargeQ40: record.dischargeQ40,
    confidence: record.confidence,
    envRisk: record.envRisk,
    weights,
    consistencyRatio: Number(consistencyRatio(weights).toFixed(3)),
    subscores: record.subscores,
    recommendations: recommendationsFor(record),
    risks: risksFor(record),
    deterministic: true,
  };
  await db.insert(reports).values({ siteId: record.id, userId, status: "ready", content, createdAt: new Date() });
  const saved = (await listReports(record.id)).find((report) => report.siteId === record.id);
  if (!saved) throw new ApiError(500, "INTERNAL", "The report was created but could not be loaded.");
  return saved;
}

export async function deleteReport(id: number, claims: { userId: number; role: string }): Promise<void> {
  const [removed] = claims.role === "admin"
    ? await db.delete(reports).where(eq(reports.id, id)).returning({ id: reports.id })
    : await db.delete(reports).where(and(eq(reports.id, id), eq(reports.userId, claims.userId))).returning({ id: reports.id });
  if (!removed) throw new ApiError(404, "REPORT_NOT_FOUND", "That report could not be found.");
}

export interface ParsedSitesCsv {
  metrics: SiteMetrics[];
  errors: string[];
}

/** Accepts CSV with or without a header: name,river,district,lat,lng,headM,dischargeQ40 */
export function parseSitesCsv(text: string): ParsedSitesCsv {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const metrics: SiteMetrics[] = [];
  const errors: string[] = [];
  lines.forEach((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (index === 0 && Number.isNaN(Number(cells[3]))) return; // header
    if (cells.length < 5) {
      errors.push(`Row ${index + 1}: expected at least 5 columns (name,river,district,lat,lng).`);
      return;
    }
    const [name, river = "Imported reach", district = "Field survey pending", latRaw = "", lngRaw = "", headRaw = "", qRaw = ""] = cells;
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!name) {
      errors.push(`Row ${index + 1}: name is required.`);
      return;
    }
    if (!Number.isFinite(lat) || lat < 26.3 || lat > 30.5 || !Number.isFinite(lng) || lng < 80 || lng > 88.3) {
      errors.push(`Row ${index + 1}: coordinates must fall inside Nepal (26.3–30.5 N, 80–88.3 E).`);
      return;
    }
    const headM = Number(headRaw);
    const dischargeQ40 = Number(qRaw);
    metrics.push(computeSiteMetrics({
      name,
      river,
      district,
      lat,
      lng,
      headM: Number.isFinite(headM) && headM > 0 ? headM : undefined,
      dischargeQ40: Number.isFinite(dischargeQ40) && dischargeQ40 > 0 ? dischargeQ40 : undefined,
      seed: `import:${name}:${lat}:${lng}`,
      status: "candidate",
    }));
  });
  return { metrics, errors };
}

export interface ImportResult {
  filename: string;
  rowsRequested: number;
  rowsImported: number;
  errors: string[];
  sites: Array<{ id: number; code: string }>;
}

export async function importSitesCsv(input: {
  filename: string;
  content: string;
  userId: number;
  size?: number;
}): Promise<ImportResult> {
  const { metrics, errors } = parseSitesCsv(input.content);
  const created = metrics.length > 0 ? await importCandidates(metrics, input.userId, (_metric, index) => `Imported from ${input.filename} (row ${index + 1}).`) : [];
  await db.insert(uploads).values({
    userId: input.userId,
    filename: input.filename,
    size: input.size ?? input.content.length,
    mime: "text/csv",
    kind: "sites",
    status: created.length > 0 ? (errors.length ? "partial" : "processed") : "failed",
    rowsImported: created.length,
    createdAt: new Date(),
  }).returning({ id: uploads.id });
  return {
    filename: input.filename,
    rowsRequested: metrics.length + errors.length,
    rowsImported: created.length,
    errors,
    sites: created,
  };
}

export async function listUploads(userId: number, role: string) {
  const rows = role === "admin"
    ? await db.select().from(uploads).orderBy(desc(uploads.createdAt)).limit(20)
    : await db.select().from(uploads).where(eq(uploads.userId, userId)).orderBy(desc(uploads.createdAt)).limit(20);
  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    size: row.size,
    kind: row.kind,
    status: row.status,
    rowsImported: row.rowsImported,
    createdAt: row.createdAt.toISOString(),
  }));
}


