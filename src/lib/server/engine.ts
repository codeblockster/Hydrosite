import "server-only";
import { computeSiteMetrics } from "@/lib/hydro";
import type { JobLog, JobSnapshot, JobStep } from "@/lib/contracts";

const PIPELINE = [
  { key: "fetch", label: "Fetch & align inputs", weight: 1.15 },
  { key: "dem", label: "Correct elevation surface", weight: 1.05 },
  { key: "super-resolution", label: "Super-resolve terrain", weight: 1.35 },
  { key: "features", label: "Extract catchment features", weight: 1.1 },
  { key: "infer", label: "Infer river network", weight: 1.25 },
  { key: "score", label: "Score & compile report", weight: 1.1 },
] as const;

const PIPELINE_WEIGHT = PIPELINE.reduce((sum, step) => sum + step.weight, 0);

export interface JobLike {
  id: string;
  label: string;
  lat: number;
  lng: number;
  bufferKm: number;
  status: string;
  startedAt: Date;
  durationMs: number;
  result: unknown;
}

function jobResult(job: JobLike): JobSnapshot["result"] {
  const metrics = computeSiteMetrics({ lat: job.lat, lng: job.lng, seed: job.id });
  return {
    candidateCount: 2 + Math.floor(metrics.score / 18),
    bestScore: metrics.score,
    potentialMw: Math.round(metrics.powerKw * (0.42 + metrics.confidence * 0.25)) / 1000,
  };
}

export function snapshotJob(job: JobLike, now = Date.now()): JobSnapshot {
  const elapsed = Math.max(0, now - job.startedAt.getTime());
  const completedAlready = job.status === "completed";
  const cancelled = job.status === "cancelled";
  const failed = job.status === "failed";
  const progress = completedAlready ? 100 : cancelled || failed ? 0 : Math.min(99, Math.floor((elapsed / job.durationMs) * 100));
  let accumulated = 0;
  let activeIndex = 0;
  const steps: JobStep[] = PIPELINE.map((step, index) => {
    const start = accumulated / PIPELINE_WEIGHT;
    accumulated += step.weight;
    const end = accumulated / PIPELINE_WEIGHT;
    const stageProgress = clampProgress((progress / 100 - start) / (end - start));
    const isComplete = progress >= Math.round(end * 100) || completedAlready;
    if (!isComplete && stageProgress > 0) activeIndex = index;
    return {
      key: step.key,
      label: step.label,
      status: isComplete ? "complete" : index === activeIndex && stageProgress > 0 ? "active" : "pending",
      progress: isComplete ? 100 : Math.round(stageProgress * 100),
    };
  });
  if (completedAlready) activeIndex = PIPELINE.length;
  const currentStep = completedAlready ? "Complete" : failed ? "Failed" : cancelled ? "Cancelled" : PIPELINE[activeIndex]?.label ?? PIPELINE[0].label;
  const logs = buildLogs(job.startedAt, progress, completedAlready, job);
  const result = completedAlready && job.result && typeof job.result === "object"
    ? (job.result as JobSnapshot["result"])
    : completedAlready
      ? jobResult(job)
      : null;

  return {
    id: job.id,
    label: job.label,
    lat: job.lat,
    lng: job.lng,
    bufferKm: job.bufferKm,
    status: completedAlready ? "completed" : failed ? "failed" : cancelled ? "cancelled" : "running",
    progress,
    currentStep,
    startedAt: job.startedAt.toISOString(),
    durationMs: job.durationMs,
    result,
    steps,
    logs,
  };
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildLogs(startedAt: Date, progress: number, completed: boolean, job: JobLike): JobLog[] {
  const events = [
    { at: 0, message: "Job queued on Nepal screening engine", tone: "info" as const },
    { at: 8, message: `Input window set to ${job.bufferKm} km around ${job.lat.toFixed(3)}, ${job.lng.toFixed(3)}`, tone: "neutral" as const },
    { at: 24, message: "Copernicus DEM and HydroRIVERS inputs aligned", tone: "info" as const },
    { at: 42, message: "Terrain correction and flow accumulation complete", tone: "success" as const },
    { at: 63, message: "River graph features and access indicators inferred", tone: "info" as const },
    { at: 84, message: "Weighted feasibility model is compiling candidates", tone: "info" as const },
    { at: 100, message: "Screening report ready for review", tone: "success" as const },
  ];
  return events
    .filter((event) => progress >= event.at && (event.at < 100 || completed))
    .map((event) => ({
      time: new Date(startedAt.getTime() + Math.min(event.at, 95) * 55).toISOString(),
      message: event.message,
      tone: event.tone,
    }));
}

export function jobResultFor(job: JobLike): NonNullable<JobSnapshot["result"]> {
  return jobResult(job) ?? { candidateCount: 0, bestScore: 0, potentialMw: 0 };
}
