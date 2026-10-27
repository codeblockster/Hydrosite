import { z } from "zod";
import type { DashboardData, DataSourceRecord, JobSnapshot, PaginatedSites } from "@/lib/contracts";
import type { SiteRecord } from "@/lib/hydro";
import { ApiClientError, apiClient, clearAuthTokens, setAccessToken, setRefreshToken } from "@/api/client";

const subscoreSchema = z.object({
  hydrology: z.number(),
  topography: z.number(),
  accessibility: z.number(),
  environment: z.number(),
  socioEconomic: z.number(),
  grid: z.number(),
});

export const siteSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  river: z.string(),
  basin: z.string(),
  province: z.string(),
  district: z.string(),
  lat: z.number(),
  lng: z.number(),
  headM: z.number(),
  dischargeQ40: z.number(),
  slopePct: z.number(),
  catchmentKm2: z.number(),
  powerKw: z.number(),
  plantType: z.enum(["Micro", "Mini", "Small", "Large"]),
  score: z.number(),
  envRisk: z.enum(["Low", "Medium", "High"]),
  confidence: z.number(),
  status: z.enum(["candidate", "screening", "shortlisted", "rejected"]),
  subscores: subscoreSchema,
  notes: z.string(),
  createdAt: z.string(),
});

const jobSchema: z.ZodType<JobSnapshot> = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  bufferKm: z.number(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  progress: z.number(),
  currentStep: z.string(),
  startedAt: z.string(),
  durationMs: z.number(),
  result: z.object({ candidateCount: z.number(), bestScore: z.number(), potentialMw: z.number() }).nullable(),
  steps: z.array(z.object({ key: z.string(), label: z.string(), status: z.enum(["complete", "active", "pending"]), progress: z.number() })),
  logs: z.array(z.object({ time: z.string(), message: z.string(), tone: z.enum(["info", "success", "neutral"]) })),
});

const sourceSchema: z.ZodType<DataSourceRecord> = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  category: z.string(),
  description: z.string(),
  resolution: z.string(),
  status: z.string(),
  enabled: z.boolean(),
  coveragePct: z.number(),
  records: z.number(),
  latencyMs: z.number(),
  lastSync: z.string(),
});

const dashboardSchema: z.ZodType<DashboardData> = z.object({
  metrics: z.object({ sites: z.number(), totalMw: z.number(), avgScore: z.number(), highRisk: z.number() }),
  sites: z.array(siteSchema),
  topSites: z.array(siteSchema),
  jobs: z.array(jobSchema),
  dataSources: z.array(sourceSchema),
});

const paginatedSitesSchema: z.ZodType<PaginatedSites> = z.object({
  items: z.array(siteSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    console.error("HydroSite API contract mismatch", parsed.error.issues);
    throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned data in an unexpected format.", parsed.error.issues);
  }
  return parsed.data;
}

export async function getDashboard(): Promise<DashboardData> {
  const { data } = await apiClient.get<unknown>("/dashboard");
  return parseContract(dashboardSchema, data);
}

export async function getSites(params: Record<string, string | number | undefined> = {}): Promise<PaginatedSites> {
  const { data } = await apiClient.get<unknown>("/sites", { params });
  return parseContract(paginatedSitesSchema, data);
}

export async function createSite(input: {
  name: string;
  lat: number;
  lng: number;
  headM?: number;
  dischargeQ40?: number;
  river?: string;
  district?: string;
  notes?: string;
}): Promise<SiteRecord> {
  const { data } = await apiClient.post<unknown>("/sites", input);
  return parseContract(siteSchema, data);
}

export async function updateSite(id: number, input: { name?: string; status?: string; notes?: string }): Promise<SiteRecord> {
  const { data } = await apiClient.patch<unknown>(`/sites/${id}`, input);
  return parseContract(siteSchema, data);
}

export async function deleteSite(id: number): Promise<void> {
  await apiClient.delete(`/sites/${id}`);
}

export async function createJob(input: {
  label: string;
  lat: number;
  lng: number;
  bufferKm: number;
  efficiency: number;
  superResolution: boolean;
  environmental: boolean;
}): Promise<JobSnapshot> {
  const { data } = await apiClient.post<unknown>("/jobs", input);
  return parseContract(jobSchema, data);
}

export async function getJobs(): Promise<JobSnapshot[]> {
  const { data } = await apiClient.get<unknown>("/jobs");
  const parsed = z.array(jobSchema).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid job data.", parsed.error.issues);
  return parsed.data;
}

export async function getJob(id: string): Promise<JobSnapshot> {
  const { data } = await apiClient.get<unknown>(`/jobs/${id}`);
  return parseContract(jobSchema, data);
}

export async function cancelJob(id: string): Promise<JobSnapshot> {
  const { data } = await apiClient.post<unknown>(`/jobs/${id}/cancel`);
  return parseContract(jobSchema, data);
}

export async function promoteJob(id: string, name: string, district: string): Promise<SiteRecord> {
  const { data } = await apiClient.post<unknown>(`/jobs/${id}/promote`, { name, district });
  return parseContract(siteSchema, data);
}

export async function getCurrentUser(): Promise<{ userId: number; email: string; name: string; role: string; organization?: string }> {
  const { data } = await apiClient.get<unknown>("/auth/me");
  const parsed = z.object({ userId: z.number(), email: z.string(), name: z.string(), role: z.string(), organization: z.string().optional() }).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid session data.", parsed.error.issues);
  return parsed.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout");
  } finally {
    clearAuthTokens();
  }
}

export async function login(email: string, password: string): Promise<{ user: { id: number; name: string; role: string; organization: string }; accessToken: string; refreshToken: string }> {
  const { data } = await apiClient.post<unknown>("/auth/login", { email, password });
  const parsed = z.object({
    user: z.object({ id: z.number(), name: z.string(), role: z.string(), organization: z.string() }),
    accessToken: z.string(),
    refreshToken: z.string(),
  }).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid login data.", parsed.error.issues);
  setAccessToken(parsed.data.accessToken);
  setRefreshToken(parsed.data.refreshToken);
  return parsed.data;
}

export async function getDataSources(): Promise<DataSourceRecord[]> {
  const { data } = await apiClient.get<unknown>("/data-sources");
  const parsed = z.array(sourceSchema).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid source data.", parsed.error.issues);
  return parsed.data;
}

export async function toggleDataSource(id: string, enabled: boolean): Promise<DataSourceRecord> {
  const { data } = await apiClient.patch<unknown>(`/data-sources/${id}`, { enabled });
  return parseContract(sourceSchema, data);
}

export async function refreshDataSource(id: string): Promise<DataSourceRecord> {
  const { data } = await apiClient.post<unknown>(`/data-sources/${id}`);
  return parseContract(sourceSchema, data);
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const { data } = await apiClient.get<unknown>("/settings");
  const parsed = z.record(z.string(), z.unknown()).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid settings.", parsed.error.issues);
  return parsed.data;
}

export async function saveSettings(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await apiClient.put<unknown>("/settings", input);
  const parsed = z.record(z.string(), z.unknown()).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid settings.", parsed.error.issues);
  return parsed.data;
}

export interface SiteReport {
  id: number;
  siteId: number | null;
  siteCode: string | null;
  siteName: string | null;
  status: string;
  createdAt: string;
  content: Record<string, unknown>;
}

export interface UploadRecord {
  id: number;
  filename: string;
  size: number;
  kind: string;
  status: string;
  rowsImported: number;
  createdAt: string;
}

export interface ImportResult {
  filename: string;
  rowsRequested: number;
  rowsImported: number;
  errors: string[];
  sites: Array<{ id: number; code: string }>;
}

export interface WorkspaceUser {
  id: number;
  email: string;
  name: string;
  role: string;
  organization: string;
  createdAt: string;
}

const reportSchema: z.ZodType<SiteReport> = z.object({
  id: z.number(),
  siteId: z.number().nullable(),
  siteCode: z.string().nullable(),
  siteName: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  content: z.record(z.string(), z.unknown()),
});

export async function getReports(siteId?: number): Promise<SiteReport[]> {
  const { data } = await apiClient.get<unknown>("/reports", { params: siteId ? { siteId } : {} });
  const parsed = z.array(reportSchema).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid report data.", parsed.error.issues);
  return parsed.data;
}

export async function createReport(siteId: number): Promise<SiteReport> {
  const { data } = await apiClient.post<unknown>("/reports", { siteId });
  return parseContract(reportSchema, data);
}

export async function deleteReport(id: number): Promise<void> {
  await apiClient.delete(`/reports/${id}`);
}

export async function importSitesCsv(filename: string, content: string): Promise<ImportResult> {
  const { data } = await apiClient.post<unknown>("/uploads", { filename, content });
  const parsed = z.object({
    filename: z.string(),
    rowsRequested: z.number(),
    rowsImported: z.number(),
    errors: z.array(z.string()),
    sites: z.array(z.object({ id: z.number(), code: z.string() })),
  }).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid import results.", parsed.error.issues);
  return parsed.data;
}

export async function listUploads(): Promise<UploadRecord[]> {
  const { data } = await apiClient.get<unknown>("/uploads");
  const parsed = z.array(z.object({
    id: z.number(), filename: z.string(), size: z.number(), kind: z.string(),
    status: z.string(), rowsImported: z.number(), createdAt: z.string(),
  })).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid upload data.", parsed.error.issues);
  return parsed.data;
}

export async function listUsers(): Promise<WorkspaceUser[]> {
  const { data } = await apiClient.get<unknown>("/users");
  const parsed = z.array(z.object({
    id: z.number(), email: z.string(), name: z.string(), role: z.string(),
    organization: z.string(), createdAt: z.string(),
  })).safeParse(data);
  if (!parsed.success) throw new ApiClientError(502, "SCHEMA_MISMATCH", "The server returned invalid user data.", parsed.error.issues);
  return parsed.data;
}

export async function exportSites(format: "csv" | "pdf"): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/sites/export?format=${format}`, { responseType: "blob" });
  return data;
}
