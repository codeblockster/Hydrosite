import type { SiteRecord } from "@/lib/hydro";

export interface JobStep {
  key: string;
  label: string;
  status: "complete" | "active" | "pending";
  progress: number;
}

export interface JobLog {
  time: string;
  message: string;
  tone: "info" | "success" | "neutral";
}

export interface JobSnapshot {
  id: string;
  label: string;
  lat: number;
  lng: number;
  bufferKm: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  startedAt: string;
  durationMs: number;
  result: { candidateCount: number; bestScore: number; potentialMw: number } | null;
  steps: JobStep[];
  logs: JobLog[];
}

export interface DataSourceRecord {
  id: string;
  name: string;
  provider: string;
  category: string;
  description: string;
  resolution: string;
  status: string;
  enabled: boolean;
  coveragePct: number;
  records: number;
  latencyMs: number;
  lastSync: string;
}

export interface DashboardData {
  metrics: {
    sites: number;
    totalMw: number;
    avgScore: number;
    highRisk: number;
  };
  sites: SiteRecord[];
  topSites: SiteRecord[];
  jobs: JobSnapshot[];
  dataSources: DataSourceRecord[];
}

export interface PaginatedSites {
  items: SiteRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
