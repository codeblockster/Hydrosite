import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analysisJobs, sites } from "@/db/schema";
import type { SiteMetrics } from "@/lib/hydro";
import { ApiError } from "@/lib/server/http";

/** Allocate the next site codes inside an advisory lock, or reserve a run atomically. */
export async function nextSiteCode(): Promise<string> {
  const existing = await db.select({ code: sites.code }).from(sites);
  return `HS-${lastCodeNumber(existing) + 1}`;
}

function lastCodeNumber(codes: Array<{ code: string }>): number {
  return codes.reduce((maximum, site) => Math.max(maximum, Number(site.code.replace(/^HS-/, "")) || 1000), 1000);
}

interface SiteInsert {
  code: string;
  name: string;
  river: string;
  basin: string;
  province: string;
  district: string;
  lat: number;
  lng: number;
  headM: number;
  dischargeQ40: number;
  slopePct: number;
  catchmentKm2: number;
  powerKw: number;
  plantType: string;
  score: number;
  envRisk: string;
  confidence: number;
  status: string;
  subscores: Record<string, number>;
  notes: string;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCandidateInput {
  metrics: SiteMetrics;
  createdBy: number;
  notes: string;
  promotionJobId?: string;
}

export interface CreatedCandidate {
  id: number;
  code: string;
}

/** Serialize site-code allocation and keep job promotion in the same commit. */
/** Insert many candidates with sequentially allocated codes in a single commit. */
export async function importCandidates(
  metrics: SiteMetrics[],
  createdBy: number,
  notesFor?: (metric: SiteMetrics, index: number) => string,
): Promise<CreatedCandidate[]> {
  if (metrics.length === 0) return [];
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(19022027)`);
    const existing = await tx.select({ code: sites.code }).from(sites);
    let last = lastCodeNumber(existing);
    const now = new Date();
    const rows: SiteInsert[] = metrics.map((metric, index) => {
      last += 1;
      return {
        code: `HS-${last}`,
        name: metric.name,
        river: metric.river,
        basin: metric.basin,
        province: metric.province,
        district: metric.district,
        lat: metric.lat,
        lng: metric.lng,
        headM: metric.headM,
        dischargeQ40: metric.dischargeQ40,
        slopePct: metric.slopePct,
        catchmentKm2: metric.catchmentKm2,
        powerKw: metric.powerKw,
        plantType: metric.plantType,
        score: metric.score,
        envRisk: metric.envRisk,
        confidence: metric.confidence,
        status: metric.status,
        subscores: metric.subscores,
        notes: notesFor?.(metric, index) ?? "",
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
    });
    const inserted = await tx.insert(sites).values(rows).returning({ id: sites.id, code: sites.code });
    if (inserted.length !== rows.length) throw new ApiError(500, "INTERNAL", "Some imported rows could not be saved.");
    return inserted;
  });
}

export async function createCandidate(input: CreateCandidateInput): Promise<CreatedCandidate> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(19022027)`);
    const existing = await tx.select({ code: sites.code }).from(sites);
    const code = `HS-${lastCodeNumber(existing) + 1}`;
    const now = new Date();
    const [created] = await tx.insert(sites).values({
      code,
      ...input.metrics,
      notes: input.notes,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: sites.id });
    if (!created) throw new ApiError(500, "INTERNAL", "The candidate site could not be saved.");

    if (input.promotionJobId) {
      const [linked] = await tx.update(analysisJobs)
        .set({ siteId: code })
        .where(and(
          eq(analysisJobs.id, input.promotionJobId),
          eq(analysisJobs.status, "completed"),
        ))
        .returning({ id: analysisJobs.id });
      if (!linked) throw new ApiError(409, "JOB_NOT_COMPLETE", "The analysis changed before it could be promoted.");
    }
    return { id: created.id, code };
  });
}
