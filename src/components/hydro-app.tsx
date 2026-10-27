"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  Download,
  Eye,
  EyeOff,
  Filter,
  Globe2,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Moon,
  Laptop,
  Timer,
  WifiOff,
  X,
  Save,
  LogIn,
  Upload,
  Bookmark,
  Trash2,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  cancelJob,
  createJob,
  createReport,
  createSite,
  deleteReport,
  deleteSite,
  exportSites,
  getCurrentUser,
  getDashboard,
  getJob,
  getJobs,
  getReports,
  getSettings,
  importSitesCsv,
  listUploads,
  listUsers,
  login,
  logout,
  promoteJob,
  refreshDataSource,
  saveSettings,
  toggleDataSource,
  updateSite,
  type ImportResult,
  type SiteReport,
  type UploadRecord,
  type WorkspaceUser,
} from "@/api/hydro.api";
import { ApiClientError, clearAuthTokens, getAccessToken } from "@/api/client";
import { MapView, type BasemapKey } from "@/components/map-view";
import { HydroIcon, sourceIconFor, type HydroIconName } from "@/components/ui/hydro-icon";
import type { DashboardData, DataSourceRecord, JobSnapshot } from "@/lib/contracts";
import {
  CRITERIA,
  DEFAULT_WEIGHTS,
  type Criterion,
  type SiteRecord,
  type SiteStatus,
} from "@/lib/hydro";
import { colorTokens, scoreToken } from "@/lib/tokens";

 type ViewKey = "dashboard" | "sites" | "analysis" | "settings";
type DetailTab = "overview" | "dem" | "river" | "report";
type SettingsTab = "feasibility" | "analysis" | "appearance" | "sources" | "users";
type WriteAction = "run" | "site";
type AppUser = { userId: number; email: string; name: string; role: string; organization?: string };
type RequestLog = { id: string; method: string; target: string; status: number; duration: number; at: string };
type Point = { lat: number; lng: number };
type Density = "comfortable" | "compact";
type SavedView = { name: string; q: string; province: string; plantType: string; risk: string; status: string };

const SAVED_VIEWS_KEY = "hydrosite.saved-views";
const DENSITY_KEY = "hydrosite.density";
const IMPORT_TEMPLATE = `name,river,district,lat,lng,headM,dischargeQ40\nImported Alpha,Karnali,Jumla,29.28,82.17,120,9\nImported Beta,Seti,Doti,29.2,80.95,88,7.5`;

const NAV_ITEMS: { key: ViewKey; label: string; mobileLabel: string; icon: HydroIconName; shortcut?: string }[] = [
  { key: "dashboard", label: "Overview", mobileLabel: "Overview", icon: "overview", shortcut: "G D" },
  { key: "sites", label: "Candidate sites", mobileLabel: "Sites", icon: "sites", shortcut: "G S" },
  { key: "analysis", label: "Analysis runs", mobileLabel: "Analysis", icon: "analysis", shortcut: "G A" },
  { key: "settings", label: "Settings", mobileLabel: "Settings", icon: "settings" },
];

const SETTINGS_ITEMS: { key: SettingsTab; label: string; icon: HydroIconName; adminOnly?: boolean }[] = [
  { key: "feasibility", label: "Feasibility model", icon: "sliders" },
  { key: "analysis", label: "Analysis defaults", icon: "analysis" },
  { key: "appearance", label: "Appearance", icon: "appearance" },
  { key: "sources", label: "Data sources", icon: "sources" },
  { key: "users", label: "Team & access", icon: "planner", adminOnly: true },
];

const DEMO_ACCOUNTS = [
  { role: "Admin", icon: "shield", email: "admin@hydrosite.np", password: "admin123", label: "Aarati · MoEWRI" },
  { role: "Planner", icon: "planner", email: "planner@hydrosite.np", password: "planner123", label: "Bikash · IBN" },
  { role: "Viewer", icon: "viewer", email: "investor@hydrosite.np", password: "investor123", label: "Sita · Investor" },
] as const;

const EMPTY_SETTINGS = {
  weights: DEFAULT_WEIGHTS,
  bufferKm: 5,
  efficiency: 0.85,
  theme: "dark",
  basemap: "dark",
  units: "metric",
};

function formatPower(kw: number, compact = false): string {
  if (kw >= 1000) return `${(kw / 1000).toFixed(compact ? 1 : 2)} MW`;
  return `${Math.round(kw).toLocaleString("en-US")} kW`;
}

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatRelative(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hr ago`;
  return `${Math.floor(elapsed / 86_400_000)} d ago`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function haversineKm(a: Point, b: Point): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const n = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(n), Math.sqrt(1 - n));
}

function plantColor(type: SiteRecord["plantType"]): string {
  if (type === "Micro") return "var(--plant-micro)";
  if (type === "Mini") return "var(--plant-mini)";
  if (type === "Small") return "var(--plant-small)";
  return "var(--plant-large)";
}

function statusClass(value: string): string {
  return `status-${value.toLowerCase().replaceAll(" ", "-")}`;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge ${statusClass(value)}`}>{value}</span>;
}

function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return <button className={`icon-button ${className}`} type="button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function ModalFrame({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    frame.current?.focus();
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") onClose();
    if (event.key === "Tab") {
      const focusable = frame.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={frame} className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="modal-header">
          <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
          <IconButton label="Close dialog" onClick={onClose}><X size={15} /></IconButton>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const color = scoreToken(score);
  const arcLength = 132;
  const filledLength = arcLength * Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="score-gauge" role="img" aria-label={`Feasibility score ${score.toFixed(1)} out of 100`}>
      <svg viewBox="0 0 100 58" aria-hidden="true">
        <path d="M 8 52 A 42 42 0 0 1 92 52" fill="none" stroke="var(--line)" strokeWidth="8" strokeLinecap="round" />
        <path d="M 8 52 A 42 42 0 0 1 92 52" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${filledLength} ${arcLength}`} />
      </svg>
      <div className="score-gauge-copy"><strong>{score.toFixed(1)}</strong><span>feasibility</span></div>
    </div>
  );
}

function ProfileChart({ seed }: { seed: number }) {
  const samples = Array.from({ length: 41 }, (_, index) => {
    const distance = index / 40;
    const base = 14 + 15 * Math.sin(distance * 4.2 + seed * 0.11) + 9 * Math.sin(distance * 10 + seed * 0.07);
    return { x: index, original: base, refined: base + 2.4 * Math.sin(distance * 24 + seed) + Math.cos(distance * 12) * 1.2 };
  });
  const values = samples.flatMap((sample) => [sample.original, sample.refined]);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const point = (value: number, index: number) => `${12 + (index / 40) * 376},${86 - ((value - min) / (max - min)) * 64}`;
  const originalPath = samples.map((sample, index) => `${index === 0 ? "M" : "L"}${point(sample.original, index)}`).join(" ");
  const refinedPath = samples.map((sample, index) => `${index === 0 ? "M" : "L"}${point(sample.refined, index)}`).join(" ");
  return (
    <div className="profile-chart">
      <svg viewBox="0 0 400 105" role="img" aria-label="Synthetic longitudinal elevation profile comparison">
        <path d="M 12 22 H 388 M 12 54 H 388 M 12 86 H 388" stroke="var(--chart-grid)" strokeWidth="1" strokeDasharray="3 4" />
        <path d={originalPath} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" />
        <path d={refinedPath} fill="none" stroke="var(--chart-2)" strokeWidth="1.7" strokeLinejoin="round" strokeDasharray="4 3" />
        <text x="12" y="101" fill="var(--chart-axis)" fontSize="8">0 km</text>
        <text x="355" y="101" fill="var(--chart-axis)" fontSize="8">8 km</text>
      </svg>
      <div className="chart-legend"><span><i className="chart-legend-mark" style={{ "--legend-color": "var(--chart-1)" } as React.CSSProperties} />30 m baseline</span><span><i className="chart-legend-mark" style={{ "--legend-color": "var(--chart-2)" } as React.CSSProperties} />12.5 m enhanced</span></div>
    </div>
  );
}

function ValidationSpark({ seed }: { seed: number }) {
  const points = Array.from({ length: 20 }, (_, index) => {
    const progress = index / 19;
    const train = 78 * Math.exp(-progress * 3.1) + 7.5 + Math.sin(seed + index) * 1.3;
    const validation = train + 4 + Math.sin(seed * 0.4 + index * 1.2) * 2;
    return { train, validation };
  });
  const project = (key: "train" | "validation") => points.map((value, index) => `${index === 0 ? "M" : "L"}${12 + (index / 19) * 376},${83 - (value[key] / 92) * 68}`).join(" ");
  return (
    <div className="profile-chart">
      <svg viewBox="0 0 400 100" role="img" aria-label="Twenty-epoch model validation curve">
        <path d="M 12 18 H 388 M 12 50 H 388 M 12 82 H 388" stroke="var(--chart-grid)" strokeWidth="1" strokeDasharray="3 4" />
        <path d={project("train")} fill="none" stroke="var(--chart-1)" strokeWidth="2" />
        <path d={project("validation")} fill="none" stroke="var(--chart-4)" strokeWidth="1.8" strokeDasharray="4 3" />
        <text x="12" y="96" fill="var(--chart-axis)" fontSize="8">Epoch 1</text>
        <text x="348" y="96" fill="var(--chart-axis)" fontSize="8">Epoch 20</text>
      </svg>
      <div className="chart-legend"><span><i className="chart-legend-mark" style={{ "--legend-color": "var(--chart-1)" } as React.CSSProperties} />Training loss</span><span><i className="chart-legend-mark" style={{ "--legend-color": "var(--chart-4)" } as React.CSSProperties} />Validation loss</span></div>
    </div>
  );
}

function DetailsDrawer({
  site,
  allSites,
  tab,
  onTabChange,
  onClose,
  onSaveNotes,
  onStatusChange,
  onExport,
  canWrite,
  reports,
  reportBusy,
  onSaveReport,
  onDeleteReport,
}: {
  site: SiteRecord;
  allSites: SiteRecord[];
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
  onSaveNotes: (notes: string) => void;
  onStatusChange: (status: SiteStatus) => void;
  onExport: (format: "csv" | "pdf") => void;
  canWrite: boolean;
  reports: SiteReport[];
  reportBusy: boolean;
  onSaveReport: () => void;
  onDeleteReport: (id: number) => void;
}) {
  const [notes, setNotes] = useState(site.notes);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const nearby = allSites.filter((candidate) => candidate.id !== site.id)
    .map((candidate) => ({ site: candidate, distance: haversineKm(site, candidate) }))
    .sort((left, right) => left.distance - right.distance).slice(0, 3);
  const criteria = CRITERIA.map(({ key, label }, index) => ({ key, label, score: site.subscores[key], color: `var(--chart-${index + 1})` }));
  const tabs: { key: DetailTab; label: string; icon: HydroIconName }[] = [
    { key: "overview", label: "Overview", icon: "overview" },
    { key: "dem", label: "DEM", icon: "terrain" },
    { key: "river", label: "River", icon: "river" },
    { key: "report", label: "Report", icon: "report" },
  ];
  const recommendations = site.score >= 70
    ? ["Advance to detailed feasibility study and secure a survey licence.", "Verify seasonal flow assumptions with a dry-season gauge campaign."]
    : site.score >= 55
      ? ["Schedule a targeted field reconnaissance before detailed design.", "Confirm grid interconnection distance and road access conditions."]
      : ["Deprioritise for this screening cycle; revisit after source-data refresh.", "Compare adjacent reaches for a stronger head and flow combination."];

  return (
    <div className="detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={`${site.name} site details`}>
        <div className="drawer-header">
          <div className="drawer-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> Candidate profile · {site.code}</div>
            <h2>{site.name}</h2>
            <p>{site.river} · {site.district}, {site.province} · {site.lat.toFixed(3)}° N, {site.lng.toFixed(3)}° E</p>
          </div>
          <IconButton label="Close site profile" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="drawer-tabs" role="tablist" aria-label="Candidate detail sections">
          {tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? "selected" : ""} key={item.key} onClick={() => onTabChange(item.key)}><HydroIcon name={item.icon} size={16} /><span>{item.label}</span></button>)}
        </div>
        {tab === "overview" ? (
          <>
            <div className="drawer-section">
              <h3>Screening score</h3>
              <ScoreGauge score={site.score} />
              <div className="criteria-list">
                {criteria.map((criterion) => <div className="criteria-row" key={criterion.key}>
                  <span className="criteria-label">{criterion.label}</span>
                  <div className="criteria-track"><span style={{ width: `${criterion.score}%`, "--criterion-color": criterion.color } as React.CSSProperties} /></div>
                  <span className="criteria-score">{criterion.score}</span>
                </div>)}
              </div>
            </div>
            <div className="drawer-section">
              <h3>Hydropower indicators</h3>
              <div className="drawer-metric-grid">
                <div className="drawer-metric"><span>Estimated capacity</span><strong>{formatPower(site.powerKw)}</strong></div>
                <div className="drawer-metric"><span>Net head</span><strong>{formatNumber(site.headM)} m</strong></div>
                <div className="drawer-metric"><span>Q40 discharge</span><strong>{site.dischargeQ40.toFixed(1)} m³/s</strong></div>
                <div className="drawer-metric"><span>Model confidence</span><strong>{Math.round(site.confidence * 100)}%</strong></div>
              </div>
            </div>
            <div className="drawer-section">
              <div className="panel-heading"><h3>Nearby candidate reaches</h3><span className="form-help">straight-line distance</span></div>
              {nearby.map(({ site: near, distance }) => <div className="nearby-row" key={near.id}><span>{near.name}</span><span className="table-muted">{distance.toFixed(1)} km</span></div>)}
              <div className="nearby-row"><span>Nearest protected-area screen</span><span className="table-muted">{site.envRisk === "High" ? "2.4 km" : site.envRisk === "Medium" ? "8.7 km" : "16.2 km"}</span></div>
            </div>
            <div className="drawer-section">
              <div className="panel-heading"><h3>Field notes</h3><span className="form-help">planner workspace</span></div>
              <textarea className="detail-note" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add field context, access notes, or follow-up actions…" aria-label="Site field notes" />
              <div className="note-actions"><button className="button button-secondary button-small" type="button" disabled={!canWrite || notes === site.notes} onClick={() => onSaveNotes(notes)}><Save size={12} /> Save note</button></div>
            </div>
            {site.envRisk !== "Low" ? <div className="risk-note"><ShieldAlert size={13} style={{ verticalAlign: "-3px", marginRight: 5 }} />Environmental risk is {site.envRisk.toLowerCase()}; confirm protected-area proximity and maintain ecological flow in field design.</div> : null}
            <div className="report-action-row">
              <button className="button button-soft" type="button" onClick={() => onStatusChange(site.status === "shortlisted" ? "candidate" : "shortlisted")} disabled={!canWrite}><CheckCircle2 size={13} />{site.status === "shortlisted" ? "Remove shortlist" : "Shortlist site"}</button>
              <button className="button button-secondary" type="button" onClick={() => onExport("pdf")}><HydroIcon name="report" size={13} /> Export profile</button>
            </div>
          </>
        ) : null}
        {tab === "dem" ? (
          <>
            <div className="drawer-section"><h3>30 m → 12.5 m terrain comparison</h3><p className="form-help">Simulated downscaling metrics · reference validation baseline</p>
              <div className="drawer-metric-grid dem-metric-grid">
                {[{ label: "RMSE", value: "4.82 m", change: "−18.1%" }, { label: "MAE", value: "3.61 m", change: "−14.3%" }, { label: "Mean bias", value: "+0.18 m", change: "−62.7%" }, { label: "D8 agreement", value: "84.6%", change: "+9.4 pts" }, { label: "Flow Jaccard", value: "0.73", change: "+0.11" }, { label: "Coverage", value: "91.2%", change: "Nepal" }].map((metric) => <div className="drawer-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><div className="metric-delta">{metric.change}</div></div>)}
              </div>
            </div>
            <div className="drawer-section"><div className="panel-heading"><h3>Longitudinal elevation profile</h3><span className="form-help">8 km reach</span></div><ProfileChart seed={site.id} /></div>
            <div className="drawer-section"><div className="panel-heading"><h3>Validation convergence</h3><span className="form-help">20 epochs · baseline RMSE 5.87 m</span></div><ValidationSpark seed={site.id} /></div>
            <div className="risk-note"><AlertTriangle size={13} style={{ verticalAlign: "-3px", marginRight: 5 }} />This is a deterministic screening simulation, not a terrain survey or engineering-grade DEM product.</div>
          </>
        ) : null}
        {tab === "river" ? (
          <>
            <div className="drawer-section"><h3>River-GNN subgraph</h3><p className="form-help">Reach topology around {site.river} · simulated graph inference</p>
              <div className="drawer-metric-grid">
                <div className="drawer-metric"><span>Graph nodes</span><strong>48</strong></div><div className="drawer-metric"><span>Reach edges</span><strong>62</strong></div>
                <div className="drawer-metric"><span>Accuracy</span><strong>91.4%</strong></div><div className="drawer-metric"><span>F1 / AUC</span><strong>0.89 / 0.96</strong></div>
              </div>
            </div>
            <div className="river-graph" aria-label="Illustrative river network graph">
              <svg viewBox="0 0 430 165" role="img" aria-hidden="true">
                <path d="M30 26 C105 40 120 75 200 77 S317 102 400 136 M55 133 C130 107 128 82 200 77 M100 22 C137 39 164 54 200 77 M296 28 C258 49 229 62 200 77" fill="none" stroke="var(--chart-grid)" strokeWidth="2" />
                <path d="M30 26 C105 40 120 75 200 77 S317 102 400 136" fill="none" stroke="var(--chart-1)" strokeWidth="3" />
                {[[30, 26, "Source"], [55, 133, "Reach"], [100, 22, "Reach"], [200, 77, "Site"], [296, 28, "Confluence"], [400, 136, "Outlet"]].map(([x, y, label], index) => <g key={index}><circle cx={Number(x)} cy={Number(y)} r={label === "Site" ? 8 : 6} fill={label === "Site" ? "var(--chart-4)" : "var(--chart-1)"} stroke="var(--surface)" strokeWidth="2" /><text x={Number(x)} y={Number(y) + 20} fill="var(--muted)" fontSize="8" textAnchor="middle">{String(label)}</text></g>)}
              </svg>
            </div>
            <div className="drawer-section"><h3>Node inspector · selected reach</h3>
              <div className="feature-grid">
                {[{ label: "Elevation", value: `${Math.round(site.headM * 2.7 + 850)} m` }, { label: "Flow accumulation", value: `${formatNumber(site.catchmentKm2 * 100)} cells` }, { label: "Slope", value: `${site.slopePct.toFixed(1)}%` }, { label: "Topographic wetness", value: "8.42" }, { label: "NDVI", value: "0.68" }, { label: "Precipitation", value: "1,864 mm/yr" }, { label: "Land cover", value: "Forest / shrub" }, { label: "Prediction", value: "High suitability" }].map((feature) => <div className="feature-item" key={feature.label}><span>{feature.label}</span><strong>{feature.value}</strong></div>)}
              </div>
            </div>
            <div className="drawer-section"><h3>16-dimensional embedding</h3><div className="embedding-bars">{Array.from({ length: 16 }, (_, index) => <span key={index} style={{ height: `${19 + ((index * 17 + site.id * 11) % 55)}%`, "--embedding-color": index % 3 === 0 ? "var(--chart-2)" : "var(--chart-1)" } as React.CSSProperties} title={`Embedding dimension ${index + 1}`} />)}</div></div>
          </>
        ) : null}
        {tab === "report" ? (
          <>
            <div className="drawer-section"><div className="report-gauge-row"><ScoreGauge score={site.score} /><div><StatusBadge value={site.envRisk} /><div className="report-plant">{site.plantType} hydropower</div><div className="form-help">Ranked in Nepal screening set</div></div></div></div>
            <div className="drawer-section"><h3>Decision criteria profile</h3><div className="criteria-list">{criteria.map((item) => <div className="criteria-row" key={item.key}><span className="criteria-label">{item.label}</span><div className="criteria-track"><span style={{ width: `${item.score}%`, "--criterion-color": item.color } as React.CSSProperties} /></div><span className="criteria-score">{item.score}</span></div>)}</div><div className="cr-summary" style={{ marginTop: 12 }}><span>AHP consistency ratio</span><strong>CR 0.047 · consistent</strong></div></div>
            <div className="drawer-section"><h3>Power estimate</h3><div className="equation-card"><span>ρ · g · Q₄₀ · H · η</span><strong>{formatPower(site.powerKw)}</strong><small>1,000 kg/m³ × 9.81 m/s² × {site.dischargeQ40.toFixed(1)} m³/s × {site.headM} m × 0.85</small></div></div>
            <div className="drawer-section"><h3>Recommended next steps</h3>{recommendations.map((recommendation, index) => <div className="recommendation-row" key={recommendation}><span className="recommendation-number">0{index + 1}</span><span>{recommendation}</span></div>)}</div>
            <div className="drawer-section"><h3>Risk watchlist</h3>{[
              site.envRisk !== "Low" ? "Environmental sensitivity requires early EIA / IEE screening." : "No elevated environmental risk in the deterministic screen.",
              site.confidence < 0.78 ? "Confidence is below 0.78; verify site assumptions in the field." : "Cross-source confidence is within the expected range.",
              site.slopePct > 15 ? "Steep terrain warrants a landslide and GLOF hazard assessment." : "Slope proxy is within the typical screening range.",
            ].map((risk) => <div className="recommendation-row" key={risk}><AlertTriangle size={13} color="var(--warn)" /><span>{risk}</span></div>)}</div>
            <div className="drawer-section">
              <div className="panel-heading"><h3>Snapshot history</h3><span className="form-help">{reports.length} saved</span></div>
              {reports.length ? (
                <div className="snapshot-list">
                  {reports.map((report) => (
                    <div className="snapshot-row" key={report.id}>
                      <div className="snapshot-copy">
                        <strong>{String(report.content.title ?? `${site.name} snapshot`)}</strong>
                        <span>{formatRelative(report.createdAt)} · score {typeof report.content.score === "number" ? report.content.score.toFixed(1) : site.score.toFixed(1)} · CR {typeof report.content.consistencyRatio === "number" ? report.content.consistencyRatio.toFixed(3) : "—"}</span>
                      </div>
                      <button className="icon-button" type="button" aria-label="Delete snapshot" onClick={() => onDeleteReport(report.id)} disabled={!canWrite}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              ) : <div className="snapshot-empty">No snapshots yet. Save one to freeze this score, weighting, and risk set for comparison.</div>}
            </div>
            <div className="report-action-row">
              <button className="button button-secondary" type="button" onClick={onSaveReport} disabled={!canWrite || reportBusy}>{reportBusy ? <LoaderCircle size={13} className="spin-icon" /> : <Save size={13} />} Save snapshot</button>
              <button className="button button-primary" type="button" onClick={() => onExport("pdf")}><Download size={13} /> Export PDF</button>
              <button className="button button-secondary" type="button" onClick={() => onExport("csv")}><HydroIcon name="report" size={13} /> Export CSV</button>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function ChartLegendItem({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  return <span className="legend-item"><i className={line ? "legend-line" : "legend-mark"} style={{ "--legend-color": color } as React.CSSProperties} />{label}</span>;
}

export function HydroApp({ initialData }: { initialData: DashboardData }) {
  const [view, setView] = useState<ViewKey>("dashboard");
  const [sites, setSites] = useState(initialData.sites);
  const [jobs, setJobs] = useState(initialData.jobs);
  const [dataSources, setDataSources] = useState(initialData.dataSources);
  const [metrics, setMetrics] = useState(initialData.metrics);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
  const [themePreferenceReady, setThemePreferenceReady] = useState(false);
  const [basemap, setBasemap] = useState<BasemapKey>("dark");
  const [online, setOnline] = useState(true);
  const [inFlight, setInFlight] = useState(0);
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("planner@hydrosite.np");
  const [loginPassword, setLoginPassword] = useState("planner123");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const continueAfterLogin = useRef<WriteAction | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [siteBusy, setSiteBusy] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [pickTarget, setPickTarget] = useState<WriteAction>("run");
  const [runForm, setRunForm] = useState({ label: "Arun corridor screening", lat: "27.600", lng: "87.300", bufferKm: "5", efficiency: "0.85", superResolution: true, environmental: true });
  const [siteForm, setSiteForm] = useState({ name: "", lat: "28.395", lng: "84.124", headM: "", dischargeQ40: "", river: "", district: "", notes: "" });
  const [selectedSite, setSelectedSite] = useState<SiteRecord | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialData.jobs[0]?.id ?? null);
  const [siteQuery, setSiteQuery] = useState("");
  const [siteProvince, setSiteProvince] = useState("all");
  const [sitePlantType, setSitePlantType] = useState("all");
  const [siteRisk, setSiteRisk] = useState("all");
  const [siteStatus, setSiteStatus] = useState("all");
  const [sitePage, setSitePage] = useState(1);
  const [siteSort, setSiteSort] = useState<keyof SiteRecord>("score");
  const [sortAscending, setSortAscending] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("feasibility");
  const [weights, setWeights] = useState<Record<Criterion, number>>(DEFAULT_WEIGHTS);
  const [defaultBuffer, setDefaultBuffer] = useState(5);
  const [efficiency, setEfficiency] = useState(0.85);
  const [units, setUnits] = useState("metric");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [searchPalette, setSearchPalette] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [busySource, setBusySource] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importFilename, setImportFilename] = useState("candidate-sites.csv");
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [viewNameDraft, setViewNameDraft] = useState<string | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<JobSnapshot | null>(null);
  const [promoteForm, setPromoteForm] = useState({ name: "", district: "" });
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [siteReports, setSiteReports] = useState<Record<number, SiteReport[]>>({});
  const [reportBusy, setReportBusy] = useState(false);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const completionToastIds = useRef(new Set<string>());
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null;

  const recordRequest = useCallback((entry: RequestLog) => {
    setRequestLogs((previous) => [entry, ...previous].slice(0, 30));
  }, []);

  const trackRequest = useCallback(async <T,>(method: string, target: string, action: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    setInFlight((count) => count + 1);
    try {
      const result = await action();
      recordRequest({ id: crypto.randomUUID(), method, target, status: 200, duration: Math.round(performance.now() - started), at: new Date().toISOString() });
      return result;
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : 0;
      recordRequest({ id: crypto.randomUUID(), method, target, status, duration: Math.round(performance.now() - started), at: new Date().toISOString() });
      throw error;
    } finally {
      setInFlight((count) => Math.max(0, count - 1));
    }
  }, [recordRequest]);

  const refreshMetrics = useCallback((items: SiteRecord[]) => {
    setMetrics({
      sites: items.length,
      totalMw: Math.round(items.reduce((sum, site) => sum + site.powerKw, 0) / 100) / 10,
      avgScore: items.length ? Math.round(items.reduce((sum, site) => sum + site.score, 0) / items.length * 10) / 10 : 0,
      highRisk: items.filter((site) => site.envRisk === "High").length,
    });
  }, []);

  const applyJobSnapshot = useCallback((snapshot: JobSnapshot) => {
    setJobs((previous) => {
      const found = previous.some((job) => job.id === snapshot.id);
      return found ? previous.map((job) => job.id === snapshot.id ? snapshot : job) : [snapshot, ...previous];
    });
    if (snapshot.status === "completed" && !completionToastIds.current.has(snapshot.id)) {
      completionToastIds.current.add(snapshot.id);
      toast.success("Analysis complete", { description: `${snapshot.result?.candidateCount ?? 0} high-potential reaches identified.` });
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    const fresh = await trackRequest("GET", "/dashboard", getDashboard);
    setSites(fresh.sites);
    setDataSources(fresh.dataSources);
    setMetrics(fresh.metrics);
  }, [trackRequest]);

  useEffect(() => {
    let mounted = true;
    if (getAccessToken()) {
      void getCurrentUser().then((user) => {
        if (!mounted) return;
        setCurrentUser(user);
        void getJobs().then((ownedJobs) => {
          if (!mounted) return;
          setJobs(ownedJobs);
          setSelectedJobId((current) => current && ownedJobs.some((job) => job.id === current) ? current : ownedJobs[0]?.id ?? null);
        }).catch(() => undefined);
      }).catch(() => {
        clearAuthTokens();
        if (mounted) setCurrentUser(null);
      });
    }
    void getDashboard().then((fresh) => {
      if (!mounted) return;
      setSites(fresh.sites);
      setDataSources(fresh.dataSources);
      setMetrics(fresh.metrics);
    }).catch(() => {
      // The server-rendered dashboard remains usable if the database is temporarily unavailable.
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);
    return () => {
      mounted = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("hydrosite.theme");
      const savedBasemap = localStorage.getItem("hydrosite.basemap");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") setTheme(savedTheme);
      if (savedBasemap === "dark" || savedBasemap === "imagery" || savedBasemap === "topo" || savedBasemap === "street") setBasemap(savedBasemap);
      const savedDensity = localStorage.getItem(DENSITY_KEY);
      if (savedDensity === "comfortable" || savedDensity === "compact") setDensity(savedDensity);
      const rawViews = localStorage.getItem(SAVED_VIEWS_KEY);
      if (rawViews) {
        const parsed: unknown = JSON.parse(rawViews);
        if (Array.isArray(parsed)) {
          setSavedViews(parsed.filter((view): view is SavedView =>
            typeof view === "object" && view !== null && "name" in view && "q" in view));
        }
      }
    } catch {
      // Preferences are an enhancement; the server-rendered dark default remains available.
    } finally {
      setThemePreferenceReady(true);
    }
  }, []);

  useEffect(() => {
    if (!themePreferenceReady) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.setAttribute("data-theme", resolved);
      document.documentElement.setAttribute("data-theme-pref", theme);
    };
    apply();
    try { localStorage.setItem("hydrosite.theme", theme); } catch { /* Optional preference storage. */ }
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, themePreferenceReady]);

  useEffect(() => {
    if (!currentUser || view !== "settings") return;
    void trackRequest("GET", "/settings", getSettings).then((saved) => {
      const incomingWeights = saved.weights;
      if (incomingWeights && typeof incomingWeights === "object") {
        const candidate = incomingWeights as Record<string, unknown>;
        setWeights({
          hydrology: Number(candidate.hydrology) || DEFAULT_WEIGHTS.hydrology,
          topography: Number(candidate.topography) || DEFAULT_WEIGHTS.topography,
          accessibility: Number(candidate.accessibility) || DEFAULT_WEIGHTS.accessibility,
          environment: Number(candidate.environment) || DEFAULT_WEIGHTS.environment,
          socioEconomic: Number(candidate.socioEconomic) || DEFAULT_WEIGHTS.socioEconomic,
          grid: Number(candidate.grid) || DEFAULT_WEIGHTS.grid,
        });
      }
      if (typeof saved.bufferKm === "number") setDefaultBuffer(saved.bufferKm);
      if (typeof saved.efficiency === "number") setEfficiency(saved.efficiency);
      if (saved.theme === "light" || saved.theme === "dark" || saved.theme === "system") setTheme(saved.theme);
      if (saved.basemap === "dark" || saved.basemap === "imagery" || saved.basemap === "topo" || saved.basemap === "street") setBasemap(saved.basemap);
      if (typeof saved.units === "string") setUnits(saved.units);
    }).catch(() => undefined);
  }, [currentUser, trackRequest, view]);

  useEffect(() => {
    if (!selectedSite || detailTab !== "report") return;
    const siteId = selectedSite.id;
    if (siteReports[siteId]) return;
    let active = true;
    void getReports(siteId)
      .then((rows) => { if (active) setSiteReports((previous) => ({ ...previous, [siteId]: rows })); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [selectedSite, detailTab, siteReports]);

  useEffect(() => {
    if (view !== "settings") return;
    if (settingsTab === "users") {
      if (currentUser?.role !== "admin") return;
      void listUsers().then(setWorkspaceUsers).catch(() => setWorkspaceUsers([]));
      void listUploads().then(setUploads).catch(() => undefined);
    }
  }, [view, settingsTab, currentUser]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        setSearchPalette("");
      } else if (event.key === "?" && !event.metaKey && !event.ctrlKey && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        setShortcutOpen(true);
      } else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setInspectorOpen((open) => !open);
      } else if (event.key === "Escape") {
        setCommandOpen(false);
        setShortcutOpen(false);
        setLoginOpen(false);
        setSiteOpen(false);
        setRunOpen(false);
        setPickMode(false);
      } else if (event.key.toLowerCase() === "g" && !event.metaKey && !event.ctrlKey && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        const handleSecond = (next: KeyboardEvent) => {
          window.removeEventListener("keydown", handleSecond);
          const target = next.key.toLowerCase();
          if (target === "d") setView("dashboard");
          if (target === "s") setView("sites");
          if (target === "a") setView("analysis");
        };
        window.addEventListener("keydown", handleSecond, { once: true });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const streamJobId = selectedJob?.id ?? null;
  const streamJobStatus = selectedJob?.status ?? null;

  useEffect(() => {
    if (!streamJobId || streamJobStatus !== "running" || !currentUser) return;
    let alive = true;
    const token = getAccessToken();
    let eventSource: EventSource | null = null;
    if (token) {
      eventSource = new EventSource(`/api/v2/jobs/${streamJobId}/stream?token=${encodeURIComponent(token)}`);
      const onProgress: EventListener = (event) => {
        const message = event as MessageEvent<string>;
        try { applyJobSnapshot(JSON.parse(message.data) as JobSnapshot); } catch { /* Ignore malformed event payloads. */ }
      };
      eventSource.addEventListener("job:progress", onProgress);
      eventSource.addEventListener("job:completed", onProgress);
    }
    const poll = window.setInterval(() => {
      void getJob(streamJobId).then((snapshot) => { if (alive) applyJobSnapshot(snapshot); }).catch(() => undefined);
    }, 2000);
    return () => {
      alive = false;
      eventSource?.close();
      window.clearInterval(poll);
    };
  }, [streamJobId, streamJobStatus, currentUser, applyJobSnapshot]);

  const navigate = useCallback((target: ViewKey) => {
    setView(target);
    setCommandOpen(false);
    setSelectedSite(null);
    setSitePage(1);
  }, []);

  const onMapPick = useCallback((point: Point) => {
    setPickMode(false);
    if (pickTarget === "run") {
      setRunForm((previous) => ({ ...previous, lat: point.lat.toFixed(4), lng: point.lng.toFixed(4) }));
      setRunOpen(true);
      toast.success("Analysis location set", { description: `${point.lat.toFixed(4)}° N, ${point.lng.toFixed(4)}° E` });
    } else {
      setSiteForm((previous) => ({ ...previous, lat: point.lat.toFixed(4), lng: point.lng.toFixed(4) }));
      setSiteOpen(true);
      toast.success("Candidate coordinates captured");
    }
  }, [pickTarget]);

  const onMapSelectSite = useCallback((site: SiteRecord) => {
    setSelectedSite(site);
    setDetailTab("overview");
  }, []);

  const beginWrite = useCallback((action: WriteAction): boolean => {
    if (!currentUser) {
      continueAfterLogin.current = action;
      setLoginOpen(true);
      setLoginError("");
      toast.info("Sign in to make changes", { description: "Demo accounts are available in the sign-in dialog." });
      return false;
    }
    if (currentUser.role === "viewer") {
      toast.error("Viewer access is read-only", { description: "Sign in as a planner or administrator to continue." });
      return false;
    }
    return true;
  }, [currentUser]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const result = await trackRequest("POST", "/auth/login", () => login(loginEmail.trim(), loginPassword));
      const signedInUser = { userId: result.user.id, email: loginEmail.trim(), name: result.user.name, role: result.user.role, organization: result.user.organization };
      setCurrentUser(signedInUser);
      try {
        const ownedJobs = await trackRequest("GET", "/jobs", getJobs);
        setJobs(ownedJobs);
        setSelectedJobId(ownedJobs[0]?.id ?? null);
      } catch {
        setJobs([]);
        setSelectedJobId(null);
      }
      setLoginOpen(false);
      toast.success(`Welcome, ${result.user.name.split(" ")[0]}`, { description: `${result.user.role} access · ${result.user.organization}` });
      const continuation = continueAfterLogin.current;
      continueAfterLogin.current = null;
      if (continuation && result.user.role === "viewer") {
        toast.error("Viewer access is read-only", { description: "Sign in as a planner or administrator to make changes." });
      } else if (continuation === "run") {
        setRunOpen(true);
      } else if (continuation === "site") {
        setSiteOpen(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      setLoginError(message);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    setSettingsBusy(false);
    setRunOpen(false);
    setSiteOpen(false);
    setLoginOpen(false);
    continueAfterLogin.current = null;
    try {
      await logout();
      setCurrentUser(null);
      setJobs([]);
      setSelectedJobId(null);
      setWeights(DEFAULT_WEIGHTS);
      setDefaultBuffer(5);
      setEfficiency(0.85);
      toast.success("Signed out", { description: "Your read-only preview is still available." });
    } catch (error) {
      clearAuthTokens();
      setCurrentUser(null);
      setJobs([]);
      setSelectedJobId(null);
      toast.error(error instanceof Error ? error.message : "Signed out locally, but the server could not be reached.");
    }
  };

  const startPick = (target: WriteAction) => {
    setPickTarget(target);
    setPickMode(true);
    setRunOpen(false);
    setSiteOpen(false);
    toast.info("Pick a location on the map", { description: "Click anywhere inside Nepal to set coordinates." });
  };

  const handleRunJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!beginWrite("run")) return;
    const input = {
      label: runForm.label.trim(),
      lat: Number(runForm.lat),
      lng: Number(runForm.lng),
      bufferKm: Number(runForm.bufferKm),
      efficiency: Number(runForm.efficiency),
      superResolution: runForm.superResolution,
      environmental: runForm.environmental,
    };
    if (!input.label || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
      toast.error("Enter a job label and valid coordinates.");
      return;
    }
    setRunBusy(true);
    try {
      const job = await trackRequest("POST", "/jobs", () => createJob(input));
      setJobs((previous) => [job, ...previous]);
      setSelectedJobId(job.id);
      setRunOpen(false);
      setView("analysis");
      toast.success("Analysis started", { description: "Terrain and river-network simulation is running." });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setCurrentUser(null);
        continueAfterLogin.current = "run";
        setLoginOpen(true);
      } else toast.error(error instanceof Error ? error.message : "Could not start analysis.");
    } finally {
      setRunBusy(false);
    }
  };

  const handleCreateSite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!beginWrite("site")) return;
    const input = {
      name: siteForm.name.trim(),
      lat: Number(siteForm.lat),
      lng: Number(siteForm.lng),
      headM: siteForm.headM ? Number(siteForm.headM) : undefined,
      dischargeQ40: siteForm.dischargeQ40 ? Number(siteForm.dischargeQ40) : undefined,
      river: siteForm.river || undefined,
      district: siteForm.district || undefined,
      notes: siteForm.notes,
    };
    if (!input.name || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
      toast.error("Add a candidate name and valid Nepal coordinates.");
      return;
    }
    setSiteBusy(true);
    try {
      const created = await trackRequest("POST", "/sites", () => createSite(input));
      setSites((previous) => [created, ...previous]);
      setSiteOpen(false);
      setSiteForm({ name: "", lat: "28.395", lng: "84.124", headM: "", dischargeQ40: "", river: "", district: "", notes: "" });
      refreshMetrics([created, ...sites]);
      toast.success("Candidate site added", { description: `${created.code} · ${created.score.toFixed(1)} feasibility score` });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setCurrentUser(null);
        continueAfterLogin.current = "site";
        setLoginOpen(true);
      } else toast.error(error instanceof Error ? error.message : "Could not add site.");
    } finally {
      setSiteBusy(false);
    }
  };

  const handleSaveNotes = async (notes: string) => {
    if (!selectedSite || !beginWrite("site")) return;
    const before = selectedSite;
    const optimistic = { ...before, notes };
    setSelectedSite(optimistic);
    setSites((previous) => previous.map((site) => site.id === before.id ? optimistic : site));
    try {
      const saved = await trackRequest("PATCH", `/sites/${before.id}`, () => updateSite(before.id, { notes }));
      setSelectedSite(saved);
      setSites((previous) => previous.map((site) => site.id === saved.id ? saved : site));
      toast.success("Field notes saved");
    } catch (error) {
      setSelectedSite(before);
      setSites((previous) => previous.map((site) => site.id === before.id ? before : site));
      toast.error(error instanceof Error ? error.message : "Notes could not be saved.");
    }
  };

  const handleStatusChange = async (status: SiteStatus) => {
    if (!selectedSite || !beginWrite("site")) return;
    const before = selectedSite;
    const optimistic = { ...before, status };
    setSelectedSite(optimistic);
    setSites((previous) => previous.map((site) => site.id === before.id ? optimistic : site));
    try {
      const updated = await trackRequest("PATCH", `/sites/${before.id}`, () => updateSite(before.id, { status }));
      setSelectedSite(updated);
      setSites((previous) => previous.map((site) => site.id === updated.id ? updated : site));
      toast.success(status === "shortlisted" ? "Site added to shortlist" : "Site updated");
    } catch (error) {
      setSelectedSite(before);
      setSites((previous) => previous.map((site) => site.id === before.id ? before : site));
      toast.error(error instanceof Error ? error.message : "Site could not be updated.");
    }
  };

  const handleDeleteSite = async (site: SiteRecord) => {
    if (!beginWrite("site")) return;
    const before = sites;
    setSites((previous) => previous.filter((candidate) => candidate.id !== site.id));
    setSelectedSite(null);
    try {
      await trackRequest("DELETE", `/sites/${site.id}`, () => deleteSite(site.id));
      refreshMetrics(before.filter((candidate) => candidate.id !== site.id));
      toast.success(`${site.name} removed`, { action: { label: "Undo", onClick: () => toast.info("Recreate this site from the Add candidate form.") } });
    } catch (error) {
      setSites(before);
      toast.error(error instanceof Error ? error.message : "Site could not be removed.");
    }
  };

  const handleCancelJob = async (job: JobSnapshot) => {
    if (!beginWrite("run")) return;
    try {
      const cancelled = await trackRequest("POST", `/jobs/${job.id}/cancel`, () => cancelJob(job.id));
      applyJobSnapshot(cancelled);
      toast.info("Analysis cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel analysis.");
    }
  };

  const confirmPromote = async () => {
    if (!promoteTarget || !beginWrite("site")) return;
    const name = promoteForm.name.trim();
    const district = promoteForm.district.trim();
    if (name.length < 2 || district.length < 2) {
      toast.error("Add a site name and district (2+ characters each).");
      return;
    }
    setPromoteBusy(true);
    const job = promoteTarget;
    try {
      const created = await trackRequest("POST", `/jobs/${job.id}/promote`, () => promoteJob(job.id, name, district));
      const nextSites = [created, ...sites];
      setSites(nextSites);
      const sorted = [...nextSites].sort((a, b) => b.score - a.score);
      const promotedIndex = sorted.findIndex((site) => site.id === created.id);
      setSitePage(Math.floor(promotedIndex / 12) + 1);
      refreshMetrics(nextSites);
      setPromoteTarget(null);
      setView("sites");
      setSelectedSite(created);
      setDetailTab("overview");
      toast.success("Analysis promoted to candidate site", { description: created.code });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not promote this analysis.");
    } finally {
      setPromoteBusy(false);
    }
  };

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      const blob = await trackRequest("GET", `/sites/export?format=${format}`, () => exportSites(format));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = format === "pdf" ? "hydrosite-screening.pdf" : "hydrosite-candidates.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} export ready`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    }
  };

  const persistViews = (next: SavedView[]) => {
    setSavedViews(next);
    try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next)); } catch { /* Preferences are optional. */ }
  };

  const commitView = () => {
    const name = viewNameDraft?.trim();
    if (!name) {
      toast.error("Give the view a name first.");
      return;
    }
    const entry: SavedView = {
      name: name.slice(0, 40),
      q: siteQuery,
      province: siteProvince,
      plantType: sitePlantType,
      risk: siteRisk,
      status: siteStatus,
    };
    persistViews([entry, ...savedViews.filter((view) => view.name !== entry.name)].slice(0, 8));
    setViewNameDraft(null);
    toast.success("Filter view saved", { description: entry.name });
  };

  const openPromote = (job: JobSnapshot) => {
    if (!beginWrite("site")) return;
    setPromoteForm({
      name: job.label.replace(/screening|survey|pre-feasibility|regression/gi, "reach").trim().replace(/\s+/g, " ") || "New candidate reach",
      district: "Sankhuwasabha",
    });
    setPromoteTarget(job);
  };

  const applyView = (entry: SavedView) => {
    setSiteQuery(entry.q);
    setSiteProvince(entry.province);
    setSitePlantType(entry.plantType);
    setSiteRisk(entry.risk);
    setSiteStatus(entry.status);
    setSitePage(1);
  };

  const removeView = (name: string) => {
    persistViews(savedViews.filter((entry) => entry.name !== name));
    toast.info("Filter view removed");
  };

  const changeDensity = (next: Density) => {
    setDensity(next);
    try { localStorage.setItem(DENSITY_KEY, next); } catch { /* Preferences are optional. */ }
  };

  const readImportFile = (file: File | null | undefined) => {
    if (!file) return;
    setImportFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ""));
    reader.onerror = () => toast.error("That file could not be read.");
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!beginWrite("site")) return;
    if (!importText.trim()) {
      toast.error("Paste CSV rows or choose a file first.");
      return;
    }
    setImportBusy(true);
    try {
      const result = await trackRequest("POST", "/uploads", () => importSitesCsv(importFilename, importText));
      setImportResult(result);
      await refreshDashboard().catch(() => undefined);
      if (result.rowsImported > 0) {
        toast.success(`${result.rowsImported} site${result.rowsImported === 1 ? "" : "s"} imported`, {
          description: result.errors.length ? `${result.errors.length} row(s) skipped.` : "All rows scored with current weights.",
        });
      } else {
        toast.error("No rows could be imported.");
      }
    } catch (error) {
      const details = error instanceof ApiClientError && Array.isArray(error.details)
        ? error.details.filter((entry): entry is string => typeof entry === "string")
        : [];
      if (details.length > 0) {
        setImportResult({ filename: importFilename, rowsRequested: details.length, rowsImported: 0, errors: details, sites: [] });
        await refreshDashboard().catch(() => undefined);
      }
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  };

  const handleSaveReport = async () => {
    if (!selectedSite || !beginWrite("site")) return;
    setReportBusy(true);
    try {
      const saved = await trackRequest("POST", "/reports", () => createReport(selectedSite.id));
      setSiteReports((previous) => ({ ...previous, [selectedSite.id]: [saved, ...(previous[selectedSite.id] ?? [])] }));
      toast.success("Snapshot saved", { description: saved.content.title ? String(saved.content.title) : "Report history updated." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The snapshot could not be saved.");
    } finally {
      setReportBusy(false);
    }
  };

  const handleDeleteReport = async (id: number) => {
    if (!selectedSite || !beginWrite("site")) return;
    const siteId = selectedSite.id;
    const previous = siteReports[siteId] ?? [];
    setSiteReports((current) => ({ ...current, [siteId]: current[siteId].filter((entry) => entry.id !== id) }));
    try {
      await trackRequest("DELETE", `/reports/${id}`, () => deleteReport(id));
      toast.success("Snapshot removed");
    } catch (error) {
      setSiteReports((current) => ({ ...current, [siteId]: previous }));
      toast.error(error instanceof Error ? error.message : "The snapshot could not be removed.");
    }
  };

  const handleSaveSettings = async () => {
    if (!beginWrite("site")) return;
    setSettingsBusy(true);
    try {
      const saved = await trackRequest("PUT", "/settings", () => saveSettings({ weights, bufferKm: defaultBuffer, efficiency, theme, basemap, units }));
      if (saved.theme === "light" || saved.theme === "dark" || saved.theme === "system") setTheme(saved.theme);
      toast.success("Workspace settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleSourceToggle = async (source: DataSourceRecord) => {
    if (!beginWrite("site")) return;
    setBusySource(source.id);
    setDataSources((previous) => previous.map((item) => item.id === source.id ? { ...item, enabled: !item.enabled } : item));
    try {
      const updated = await trackRequest("PATCH", `/data-sources/${source.id}`, () => toggleDataSource(source.id, !source.enabled));
      setDataSources((previous) => previous.map((item) => item.id === source.id ? updated : item));
    } catch (error) {
      setDataSources((previous) => previous.map((item) => item.id === source.id ? source : item));
      toast.error(error instanceof Error ? error.message : "Data source setting could not be saved.");
    } finally {
      setBusySource(null);
    }
  };

  const handleSourceRefresh = async (source: DataSourceRecord) => {
    if (!beginWrite("site")) return;
    setBusySource(source.id);
    try {
      const updated = await trackRequest("POST", `/data-sources/${source.id}`, () => refreshDataSource(source.id));
      setDataSources((previous) => previous.map((item) => item.id === source.id ? updated : item));
      toast.success(`${source.name} refreshed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setBusySource(null);
    }
  };

  const onWeightChange = (key: Criterion, value: number) => {
    const next = { ...weights, [key]: value };
    const total = Object.values(next).reduce((sum, weight) => sum + weight, 0);
    setWeights(Object.fromEntries(Object.entries(next).map(([name, weight]) => [name, weight / total])) as Record<Criterion, number>);
  };

  const changeBasemap = (next: BasemapKey) => {
    setBasemap(next);
    try { localStorage.setItem("hydrosite.basemap", next); } catch { /* Optional persistence. */ }
  };

  const sortSitesBy = (key: keyof SiteRecord) => {
    if (siteSort === key) setSortAscending((value) => !value);
    else { setSiteSort(key); setSortAscending(key === "name"); }
  };

  const filteredSites = useMemo(() => {
    const query = siteQuery.trim().toLowerCase();
    return [...sites].filter((site) => {
      if (query && !`${site.name} ${site.code} ${site.river} ${site.district}`.toLowerCase().includes(query)) return false;
      if (siteProvince !== "all" && site.province !== siteProvince) return false;
      if (sitePlantType !== "all" && site.plantType !== sitePlantType) return false;
      if (siteRisk !== "all" && site.envRisk !== siteRisk) return false;
      if (siteStatus !== "all" && site.status !== siteStatus) return false;
      return true;
    }).sort((a, b) => {
      const left = a[siteSort];
      const right = b[siteSort];
      if (typeof left === "string" && typeof right === "string") return (sortAscending ? 1 : -1) * left.localeCompare(right);
      if (typeof left === "number" && typeof right === "number") return (sortAscending ? 1 : -1) * (left - right);
      return 0;
    });
  }, [sites, siteQuery, siteProvince, sitePlantType, siteRisk, siteStatus, siteSort, sortAscending]);
  const pageSize = 12;
  const pagesCount = Math.max(1, Math.ceil(filteredSites.length / pageSize));
  const currentPage = Math.min(sitePage, pagesCount);
  const shownSites = filteredSites.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeJobs = jobs.filter((job) => job.status === "running").slice(0, 2);
  const sortedTopSites = [...sites].sort((a, b) => b.score - a.score).slice(0, 5);
  const isAdmin = currentUser?.role === "admin";
  const canWrite = Boolean(currentUser && currentUser.role !== "viewer");
  const initials = currentUser ? currentUser.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() : "HS";
  const visibleSettings = SETTINGS_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const visibleSources = sourceFilter === "all" ? dataSources : dataSources.filter((source) => source.category === sourceFilter);

  const onPaletteSelectSite = (site: SiteRecord) => {
    setCommandOpen(false);
    setView("sites");
    setSelectedSite(site);
    setDetailTab("overview");
  };

  const updateSearch = (value: string) => {
    setSiteQuery(value);
    setSitePage(1);
    setCommandOpen(false);
    if (value) setView("sites");
  };

  const changeSettingsTab = (tab: SettingsTab) => setSettingsTab(tab);
  const selectedPageLabel = NAV_ITEMS.find((item) => item.key === view)?.label ?? "Overview";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand-lockup">
          <div className="brand-mark"><HydroIcon name="brand" size={27} /></div>
          <div className="brand-copy"><div className="brand-title">HYDROSITE</div><div className="brand-subtitle">FEASIBILITY INTELLIGENCE</div></div>
        </div>
        <div className="sidebar-section-label">Workspace</div>
        <nav className="nav-list">
          {NAV_ITEMS.map(({ key, label, icon, shortcut }) => <button type="button" key={key} className={`nav-item ${view === key ? "active" : ""}`} onClick={() => navigate(key)} aria-current={view === key ? "page" : undefined} aria-label={label} title={shortcut ? `${label} · ${shortcut}` : label}>
            <span className="nav-icon" aria-hidden="true"><HydroIcon name={icon} size={20} /></span><span className="nav-label">{label}</span>{shortcut ? <small className="nav-shortcut">{shortcut}</small> : null}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-section-label">Workspace usage</div>
          <div className="workspace-card"><div className="workspace-top"><span>Hydro screening</span><span>68%</span></div><div className="workspace-meter"><span /></div><div className="workspace-foot"><span>1,284 / 1,900 runs</span><span>Resets 01 Jun</span></div></div>
          <div className="side-user">
            <div className="avatar">{initials}</div>
            <div className="side-user-copy"><div className="side-user-name">{currentUser?.name ?? "Demo workspace"}</div><div className="side-user-role">{currentUser ? `${currentUser.role} · ${currentUser.organization ?? "HydroSite"}` : "Preview · read-only"}</div></div>
            <button type="button" className="side-user-action" aria-label={currentUser ? "Sign out" : "Sign in"} onClick={() => currentUser ? void handleLogout() : setLoginOpen(true)}>{currentUser ? <LogOut size={14} /> : <LogIn size={14} />}</button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        {!online ? <div className="offline-banner" role="status"><WifiOff size={14} /> You’re offline — live analysis streaming is paused until connectivity returns.</div> : null}
        <header className="topbar">
          <div className="breadcrumb"><span>HydroSite</span><ChevronRight size={12} /><strong>{selectedPageLabel}</strong></div>
          <button className="topbar-search" type="button" onClick={() => { setCommandOpen(true); setCommandQuery(""); }}><Search size={14} /><span className="topbar-search-label">Search sites, locations, or actions…</span><kbd className="keycap">⌘ K</kbd></button>
          <div className="topbar-actions">
            <div className="network-pill" title={online ? "Connected" : "Offline"}><i className={`network-dot ${online ? "" : "offline"}`} /><span>{inFlight ? `${inFlight} syncing` : online ? "All systems normal" : "Offline"}</span></div>
            <IconButton label="Keyboard shortcuts" onClick={() => setShortcutOpen(true)}><HydroIcon name="keyboard" size={19} /></IconButton>
            <IconButton label="Notifications" onClick={() => toast.info("You’re all caught up", { description: "HydroSite has no new workspace alerts." })}><HydroIcon name="notifications" size={19} /></IconButton>
            <button className="topbar-profile" type="button" onClick={() => currentUser ? void handleLogout() : setLoginOpen(true)} title={currentUser ? "Sign out" : "Sign in to HydroSite"}>
              <div className="avatar avatar-blue">{initials}</div><span>{currentUser ? currentUser.name.split(" ")[0] : "Sign in"}</span>{currentUser ? <LogOut size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          <div className="view-frame" key={view}>
          {view === "dashboard" ? (
            <>
              <div className="page-heading">
                <div><div className="eyebrow"><span className="eyebrow-dot" /> Nepal · hydropower intelligence</div><h1 className="page-title">Hydropower, mapped with confidence.</h1><p className="page-subtitle">A clearer view of Nepal’s next generation of run-of-river potential.</p></div>
                <div className="page-heading-actions"><span className="simulation-disclaimer"><HydroIcon name="simulation" size={12} /> Deterministic screening simulation</span><button className="button button-primary" type="button" onClick={() => { if (beginWrite("run")) setRunOpen(true); }}><HydroIcon name="analysis" size={17} /> New analysis</button></div>
              </div>
              <section className="metrics-grid" aria-label="National screening summary">
                <MetricCard label="Candidate sites" value={formatNumber(metrics.sites)} icon={<HydroIcon name="sites" size={22} />} caption="Across 7 provinces" delta="+6.4%" />
                <MetricCard label="Screened potential" value={metrics.totalMw.toFixed(1)} unit="MW" icon={<HydroIcon name="turbine" size={22} />} caption="Estimated installed capacity" tone="teal" delta="+12.8%" />
                <MetricCard label="Average feasibility" value={metrics.avgScore.toFixed(1)} unit="/ 100" icon={<HydroIcon name="feasibility" size={22} />} caption="Weighted MCDM score" tone="orange" delta="+2.1 pts" />
                <MetricCard label="High environmental risk" value={formatNumber(metrics.highRisk)} icon={<HydroIcon name="environment" size={22} />} caption="Requires early EIA review" tone="red" alert />
              </section>
              <div className="dashboard-grid">
                <section className="surface-card map-card" aria-label="Candidate sites map">
                  <div className="map-card-header">
                    <div className="card-title-block"><div className="map-title-row"><h2 className="card-title">Nepal opportunity atlas</h2><span className="live-tag">Live layers</span></div><p className="card-kicker">40 modelled reaches · river topology · protected areas · transmission</p></div>
                    <div className="map-header-actions">
                      <div className="basemap-switch" role="group" aria-label="Basemap selection">
                        {([ ["dark", "Dark"], ["imagery", "Satellite"], ["topo", "Terrain"], ["street", "Street"] ] as [BasemapKey, string][]).map(([key, label]) => <button type="button" key={key} className={`basemap-option ${basemap === key ? "selected" : ""}`} onClick={() => changeBasemap(key)}>{label}</button>)}
                      </div>
                      <button className={`button ${pickMode ? "button-soft" : "button-secondary"} button-small`} type="button" onClick={() => { setPickTarget("run"); setPickMode((value) => !value); }}>{pickMode ? <X size={15} /> : <HydroIcon name="locate" size={16} />}{pickMode ? "Cancel pick" : "Analyze here"}</button>
                    </div>
                  </div>
                  <div className="map-stage-wrap">
                    <MapView sites={sites} basemap={basemap} pickMode={pickMode} onPick={onMapPick} onSelectSite={onMapSelectSite} />
                    <div className="map-float-top">
                      <div className="map-glass-control"><Globe2 size={12} /><span>Nepal</span><span className="map-coordinate">26.3°–30.5° N · 80°–88.3° E</span></div>
                      <div className="map-layer-legend"><ChartLegendItem color="var(--score-excellent)" label="High potential" /><ChartLegendItem color="var(--score-moderate)" label="Moderate" /><ChartLegendItem color="var(--chart-2)" label="River network" line /><ChartLegendItem color="var(--plant-large)" label="Grid corridor" line /></div>
                    </div>
                    <div className="map-bottom-info"><HydroIcon name="layers" size={12} /><strong>{sites.length} sites</strong><span>·</span><span>River network</span><span>·</span><span>Protected areas</span></div>
                  </div>
                </section>
                <aside className="dashboard-side">
                  <section className="surface-card side-panel">
                    <div className="panel-heading"><div><h2 className="card-title">Live analysis runs</h2><p className="card-kicker">Pipeline activity across your workspace</p></div><button className="text-link" type="button" onClick={() => navigate("analysis")}>View all <ArrowRight size={11} /></button></div>
                    {activeJobs.length ? <div className="jobs-list">{activeJobs.map((job) => <JobProgressRow key={job.id} job={job} onClick={() => { setSelectedJobId(job.id); navigate("analysis"); }} />)}</div> : <div className="empty-jobs"><div className="empty-jobs-icon"><HydroIcon name="analysis" size={15} /></div><div><strong>Ready for a new screening</strong><span>Analysis runs finish in about 5–7 seconds.</span></div><button className="icon-button" type="button" aria-label="Start a new analysis" onClick={() => { if (beginWrite("run")) setRunOpen(true); }}><ArrowRight size={14} /></button></div>}
                    <div className="mini-panel-footer"><span>{jobs.filter((job) => job.status === "completed").length} completed screenings</span><span><span className="network-dot" /> Engine online</span></div>
                  </section>
                  <section className="surface-card side-panel">
                    <div className="panel-heading"><div><h2 className="card-title">Highest potential reaches</h2><p className="card-kicker">Ranked by composite feasibility</p></div><button className="text-link" type="button" onClick={() => navigate("sites")}>Explore <ArrowRight size={11} /></button></div>
                    <div className="site-list">{sortedTopSites.slice(0, 4).map((site, index) => <button className="site-list-row" type="button" key={site.id} onClick={() => onMapSelectSite(site)}>
                      <span className="rank-number">0{index + 1}</span><span className="site-list-copy"><span className="site-list-name">{site.name}</span><span className="site-list-sub">{site.province} · {formatPower(site.powerKw, true)}</span></span><span className="site-score" style={{ "--score-color": scoreToken(site.score) } as React.CSSProperties}>{site.score.toFixed(1)}</span>
                    </button>)}</div>
                  </section>
                </aside>
              </div>
              <div className="dashboard-lower">
                <section className="surface-card lower-card">
                  <div className="lower-card-header"><div><h2 className="card-title">Data foundation</h2><p className="card-kicker">Connected sources informing the national screen</p></div><button className="text-link" type="button" onClick={() => { navigate("settings"); setSettingsTab("sources"); }}>Manage sources <ArrowRight size={11} /></button></div>
                  <div className="lower-card-content">
                    {dataSources.slice(0, 3).map((source) => <div className="data-health-row" key={source.id}><div className="data-health-icon" data-category={source.category}><HydroIcon name={sourceIconFor(source.category)} size={20} /></div><div className="data-health-copy"><div className="data-health-name">{source.name}</div><div className="data-health-sub">{source.provider} · {source.resolution}</div></div><span className="data-health-value">{source.coveragePct}%</span><StatusBadge value={source.status} /></div>)}
                  </div>
                </section>
                <section className="surface-card lower-card">
                  <div className="lower-card-header"><div><h2 className="card-title">Model performance</h2><p className="card-kicker">Deterministic validation simulation</p></div><span className="status-badge status-online">Within baseline</span></div>
                  <div className="model-score-row"><div><span>Validation RMSE</span><strong>4.82 <small>m</small></strong></div><div><span>D8 agreement</span><strong>84.6<small>%</small></strong></div><div><span>River-GNN AUC</span><strong>0.96</strong></div></div>
                  <div className="model-footer"><span><HydroIcon name="analysis" size={12} /> 20 epoch validation</span><button className="text-link" type="button" onClick={() => { const candidate = sortedTopSites[0]; if (candidate) { setSelectedSite(candidate); setDetailTab("dem"); } }}>View DEM metrics <ArrowRight size={11} /></button></div>
                </section>
              </div>
            </>
          ) : null}
          {view === "sites" ? (
            <>
              <PageHeading eyebrow="Candidate portfolio · Nepal" title="Candidate sites" subtitle="Screen, compare, and prioritize potential hydropower reaches." actions={<><button className="button button-secondary" type="button" onClick={() => void handleExport("csv")}><Download size={13} /> Export CSV</button><button className="button button-primary" type="button" onClick={() => { if (beginWrite("site")) setSiteOpen(true); }}><Plus size={14} /> Add candidate</button></>} />
              <section className="metrics-grid sites-metrics"><MetricCard label="Total candidate sites" value={formatNumber(metrics.sites)} icon={<HydroIcon name="sites" size={22} />} caption="7 provinces" /><MetricCard label="Large & small class" value={formatNumber(sites.filter((site) => site.plantType === "Large" || site.plantType === "Small").length)} icon={<HydroIcon name="turbine" size={22} />} caption="Above 1 MW estimated" tone="teal" /><MetricCard label="Shortlisted" value={formatNumber(sites.filter((site) => site.status === "shortlisted").length)} icon={<HydroIcon name="shortlist" size={22} />} caption="Ready for field review" tone="orange" /><MetricCard label="High confidence" value={`${Math.round(sites.filter((site) => site.confidence >= 0.8).length / Math.max(1, sites.length) * 100)}%`} icon={<HydroIcon name="confidence" size={22} />} caption="Cross-source confidence" /></section>
              <section className="surface-card section-card">
                <div className="filter-row">
                  <label className="search-field"><Search size={13} /><input type="search" value={siteQuery} onChange={(event) => { setSiteQuery(event.target.value); setSitePage(1); }} placeholder="Search name, river, district…" aria-label="Search candidate sites" /></label>
                  <select className="field-select" value={siteProvince} onChange={(event) => { setSiteProvince(event.target.value); setSitePage(1); }} aria-label="Filter by province"><option value="all">All provinces</option>{Array.from(new Set(sites.map((site) => site.province))).sort().map((province) => <option key={province} value={province}>{province}</option>)}</select>
                  <select className="field-select" value={sitePlantType} onChange={(event) => { setSitePlantType(event.target.value); setSitePage(1); }} aria-label="Filter by plant type"><option value="all">All classes</option>{["Micro", "Mini", "Small", "Large"].map((type) => <option key={type}>{type}</option>)}</select>
                  <select className="field-select" value={siteRisk} onChange={(event) => { setSiteRisk(event.target.value); setSitePage(1); }} aria-label="Filter by environmental risk"><option value="all">All risk levels</option>{["Low", "Medium", "High"].map((risk) => <option key={risk}>{risk}</option>)}</select>
                  <button className="button button-secondary button-small" type="button" onClick={() => { setSiteQuery(""); setSiteProvince("all"); setSitePlantType("all"); setSiteRisk("all"); setSiteStatus("all"); }}><Filter size={12} /> Reset</button>
                  <button className="button button-secondary button-small" type="button" onClick={() => { if (beginWrite("site")) { setImportResult(null); setImportOpen(true); } }}><Upload size={12} /> Import CSV</button>
                  <div className="segmented" role="group" aria-label="Table density">
                    <button className={density === "comfortable" ? "selected" : ""} type="button" onClick={() => changeDensity("comfortable")}>Comfortable</button>
                    <button className={density === "compact" ? "selected" : ""} type="button" onClick={() => changeDensity("compact")}>Compact</button>
                  </div>
                </div>
                <div className="saved-views" role="group" aria-label="Saved filter views">
                  {viewNameDraft === null ? (
                    <button className="button button-quiet button-small" type="button" onClick={() => setViewNameDraft(`${siteProvince === "all" ? "All provinces" : siteProvince} · ${siteStatus === "all" ? "any status" : siteStatus}`)}><Bookmark size={12} /> Save view</button>
                  ) : (
                    <span className="inline-save-view">
                      <input
                        autoFocus
                        className="text-input"
                        value={viewNameDraft}
                        maxLength={40}
                        placeholder="View name"
                        aria-label="Filter view name"
                        onChange={(event) => setViewNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") { event.preventDefault(); commitView(); }
                          if (event.key === "Escape") { event.preventDefault(); setViewNameDraft(null); }
                        }}
                      />
                      <button className="button button-primary button-small" type="button" onClick={commitView}><Check size={12} /> Save</button>
                      <button className="button button-quiet button-small" type="button" onClick={() => setViewNameDraft(null)}>Cancel</button>
                    </span>
                  )}
                  {savedViews.map((entry) => (
                    <span className="saved-view-chip" key={entry.name}>
                      <button type="button" onClick={() => applyView(entry)} title="Apply this view">{entry.name}</button>
                      <button type="button" aria-label={`Remove ${entry.name}`} onClick={() => removeView(entry.name)}><X size={11} /></button>
                    </span>
                  ))}
                </div>
                <div className="site-status-tabs" role="group" aria-label="Filter by workflow status">{["all", "candidate", "screening", "shortlisted", "rejected"].map((status) => <button className={siteStatus === status ? "selected" : ""} key={status} type="button" onClick={() => { setSiteStatus(status); setSitePage(1); }}>{status === "all" ? "All sites" : status[0].toUpperCase() + status.slice(1)}{status === "all" ? <span>{sites.length}</span> : <span>{sites.filter((site) => site.status === status).length}</span>}</button>)}</div>
                {shownSites.length ? <>
                  <div className="table-wrap"><table className={`data-table ${density === "compact" ? "table-compact" : ""}`}><thead><tr>
                    <th><SortHeader label="Candidate" onClick={() => sortSitesBy("name")} /></th><th>Province / district</th><th>Class</th><th>Head / Q40</th><th><SortHeader label="Potential" onClick={() => sortSitesBy("powerKw")} /></th><th><SortHeader label="Feasibility" onClick={() => sortSitesBy("score")} /></th><th>Risk</th><th>Status</th><th><span className="sr-only">Actions</span></th>
                  </tr></thead><tbody>{shownSites.map((site) => <tr key={site.id} onClick={() => { setSelectedSite(site); setDetailTab("overview"); }}>
                    <td><div className="site-table-name">{site.name}</div><div className="site-table-code">{site.code} · {site.river}</div></td><td>{site.province}<div className="site-table-code">{site.district}</div></td><td><span className="plant-tag" style={{ "--plant-color": plantColor(site.plantType) } as React.CSSProperties}>{site.plantType}</span></td><td className="table-number">{site.headM} m<div className="site-table-code">{site.dischargeQ40.toFixed(1)} m³/s</div></td><td className="table-number">{formatPower(site.powerKw, true)}</td><td><span className="table-score-wrap"><strong style={{ color: scoreToken(site.score) }}>{site.score.toFixed(1)}</strong><span className="score-bar-mini"><i style={{ width: `${site.score}%`, background: scoreToken(site.score) }} /></span></span></td><td><StatusBadge value={site.envRisk} /></td><td><StatusBadge value={site.status} /></td><td><button className="icon-button row-menu" type="button" aria-label={`Open actions for ${site.name}`} onClick={(event) => { event.stopPropagation(); setSelectedSite(site); setDetailTab("overview"); }}><MoreHorizontal size={14} /></button></td>
                  </tr>)}</tbody></table></div>
                  <div className="pagination"><span>Showing {formatNumber((currentPage - 1) * pageSize + 1)}–{formatNumber(Math.min(currentPage * pageSize, filteredSites.length))} of {formatNumber(filteredSites.length)} candidate sites</span><div className="pagination-controls"><button className="pagination-page" type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setSitePage((page) => Math.max(1, page - 1))}><ChevronLeft size={13} /></button>{Array.from({ length: Math.min(5, pagesCount) }, (_, index) => <button className={`pagination-page ${currentPage === index + 1 ? "current" : ""}`} key={index} type="button" onClick={() => setSitePage(index + 1)}>{index + 1}</button>)}<button className="pagination-page" type="button" aria-label="Next page" disabled={currentPage >= pagesCount} onClick={() => setSitePage((page) => Math.min(pagesCount, page + 1))}><ChevronRight size={13} /></button></div></div>
                </> : <EmptyState icon={<Search size={18} />} title="No sites match these filters" description="Try a wider search or clear one of your filters." action={<button className="button button-secondary button-small" type="button" onClick={() => { setSiteQuery(""); setSiteProvince("all"); setSitePlantType("all"); setSiteRisk("all"); setSiteStatus("all"); }}>Clear filters</button>} />}
              </section>
            </>
          ) : null}
          {view === "analysis" ? (
            <>
              <PageHeading eyebrow="Deterministic simulation · 6-stage pipeline" title="Analysis runs" subtitle="Screen a river reach, follow every step, and promote promising sites." actions={<button className="button button-primary" type="button" onClick={() => { if (beginWrite("run")) setRunOpen(true); }}><HydroIcon name="analysis" size={17} /> Run analysis</button>} />
              <div className="analysis-summary-strip"><span><HydroIcon name="analysis" size={13} /> <strong>{jobs.filter((job) => job.status === "running").length}</strong> running</span><span><CheckCircle2 size={13} /> <strong>{jobs.filter((job) => job.status === "completed").length}</strong> completed</span><span><Timer size={13} /> Typical runtime <strong>5.6 sec</strong></span><span className="simulation-disclaimer"><HydroIcon name="simulation" size={12} /> Simulation only · no real ML/DEM processing</span></div>
              <div className="analysis-layout">
                <section className="surface-card analysis-card">
                  <div className="panel-heading"><div><h2 className="card-title">Screening history</h2><p className="card-kicker">Your most recent analysis jobs</p></div><select className="field-select compact-select" aria-label="Filter jobs" defaultValue="all"><option value="all">All jobs</option><option value="running">Running</option><option value="completed">Completed</option></select></div>
                  {jobs.length ? jobs.map((job) => <button className={`analysis-job-card ${selectedJobId === job.id ? "analysis-job-selected" : ""}`} type="button" key={job.id} onClick={() => setSelectedJobId(job.id)}>
                    <div className="analysis-job-title-row"><div><div className="analysis-job-title">{job.label}</div><div className="analysis-job-sub">{job.lat.toFixed(3)}° N, {job.lng.toFixed(3)}° E · {job.bufferKm} km radius · {formatRelative(job.startedAt)}</div></div><StatusBadge value={job.status} /></div>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${job.progress}%` }} /></div>
                    <div className="analysis-job-metrics"><span>{job.progress}% complete</span><span>Step <strong>{job.currentStep}</strong></span>{job.result ? <span><strong>{job.result.candidateCount}</strong> reaches · <strong>{job.result.potentialMw.toFixed(1)} MW</strong></span> : null}</div>
                  </button>) : <EmptyState icon={<HydroIcon name="analysis" size={18} />} title="No analysis runs yet" description="Start your first screening to explore a new river corridor." action={<button className="button button-primary button-small" type="button" onClick={() => { if (beginWrite("run")) setRunOpen(true); }}><Plus size={12} /> Start analysis</button>} />}
                </section>
                <section className="surface-card analysis-detail">
                  {selectedJob ? <>
                    <div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> Job detail</div><h2 className="analysis-detail-title">{selectedJob.label}</h2><p className="card-kicker">{selectedJob.id} · Started {formatTime(selectedJob.startedAt)}</p></div><StatusBadge value={selectedJob.status} /></div>
                    <div className="analysis-progress-large"><div className="analysis-progress-number">{selectedJob.progress}<span>%</span></div><div className="analysis-progress-copy"><strong>{selectedJob.currentStep}</strong><span>Estimated duration {selectedJob.durationMs / 1000} seconds</span><div className="progress-track"><div className="progress-fill" style={{ width: `${selectedJob.progress}%` }} /></div></div></div>
                    <div className="stepper" aria-label="Analysis pipeline steps">{selectedJob.steps.map((step) => <div className={`step-row ${step.status}`} key={step.key}><span className="step-icon">{step.status === "complete" ? <Check size={10} /> : step.status === "active" ? <LoaderCircle size={10} className="spin-icon" /> : <span />}</span><span className="step-label">{step.label}</span><span className="step-time">{step.status === "complete" ? "done" : step.status === "active" ? `${step.progress}%` : "waiting"}</span></div>)}</div>
                    {selectedJob.result ? <div className="analysis-result"><div className="analysis-result-title"><CheckCircle2 size={13} /> Screening complete · {selectedJob.result.candidateCount} reaches found</div><div className="analysis-result-stats"><div className="analysis-result-stat"><span>Best score</span><strong>{selectedJob.result.bestScore.toFixed(1)}</strong></div><div className="analysis-result-stat"><span>Potential</span><strong>{selectedJob.result.potentialMw.toFixed(1)} MW</strong></div><div className="analysis-result-stat"><span>Radius</span><strong>{selectedJob.bufferKm} km</strong></div></div><button className="button button-primary button-small" type="button" style={{ marginTop: 11 }} onClick={() => openPromote(selectedJob)}><Plus size={12} /> Promote to candidate site</button></div> : <div className="running-callout"><span className="network-dot" /> Pipeline is active. Progress updates stream live from the simulation engine.</div>}
                    <div className="analysis-log-heading"><h3>Activity log</h3><span>Timestamp · events</span></div><div className="log-box">{selectedJob.logs.slice().reverse().map((log, index) => <div className={`log-line ${log.tone === "success" ? "log-tone-success" : ""}`} key={`${log.time}-${index}`}><span className="log-time">{formatTime(log.time)}</span><span>{log.message}</span></div>)}</div>
                    {selectedJob.status === "running" ? <button className="button button-danger button-small" type="button" style={{ marginTop: 11 }} onClick={() => void handleCancelJob(selectedJob)}><X size={12} /> Cancel run</button> : null}
                  </> : <EmptyState icon={<HydroIcon name="analysis" size={18} />} title="Select an analysis job" description="Choose a screening from the history to see progress and results." />}
                </section>
              </div>
            </>
          ) : null}
          {view === "settings" ? (
            <>
              <PageHeading eyebrow="Workspace preferences" title="Settings" subtitle="Tune screening priorities, defaults, data and the way your workspace feels." actions={<button className="button button-primary" type="button" onClick={() => void handleSaveSettings()} disabled={settingsBusy}>{settingsBusy ? <LoaderCircle size={13} className="spin-icon" /> : <Save size={13} />} Save changes</button>} />
              <div className="settings-layout">
                <nav className="surface-card settings-nav" aria-label="Settings sections">
                  {visibleSettings.map(({ key, label, icon }) => <button className={settingsTab === key ? "selected" : ""} key={key} type="button" aria-pressed={settingsTab === key} onClick={() => changeSettingsTab(key)}><span className="settings-nav-icon"><HydroIcon name={icon} size={18} /></span><span>{label}</span></button>)}
                </nav>
                <div className="settings-content">
                  {settingsTab === "feasibility" ? <>
                    <section className="surface-card settings-card">
                      <div className="settings-card-header"><div><h2>AHP decision weights</h2><p>Balance the six criteria that shape candidate feasibility scores.</p></div><span className="status-badge status-online">CR 0.000 · consistent</span></div>
                      <div className="weight-list">{CRITERIA.map(({ key, label }) => <div className="weight-row" key={key}><span className="weight-label">{label}</span><input className="weight-range" type="range" min="0.02" max="0.55" step="0.01" value={weights[key]} onChange={(event) => onWeightChange(key, Number(event.target.value))} aria-label={`${label} criterion weight`} /><span className="weight-value">{Math.round(weights[key] * 100)}%</span></div>)}</div>
                      <div className="cr-summary"><span><CheckCircle2 size={13} /> Pairwise matrix is internally consistent</span><strong>CR &lt; 0.10</strong></div>
                    </section>
                    <section className="surface-card settings-card">
                      <div className="settings-card-header"><div><h2>Pairwise comparison preview</h2><p>Reciprocal Saaty scale, derived from the normalized weight vector.</p></div><span className="form-help">6 criteria</span></div>
                      <div className="matrix-wrap"><table className="ahp-matrix"><thead><tr><th></th>{CRITERIA.map((criterion) => <th key={criterion.key}>{criterion.short}</th>)}</tr></thead><tbody>{CRITERIA.map((row) => <tr key={row.key}><th>{row.short}</th>{CRITERIA.map((column) => <td key={column.key}>{saatyValue(weights[row.key] / weights[column.key])}</td>)}</tr>)}</tbody></table></div>
                      <p className="settings-footnote">Saaty comparison display: 1/9 · 1/7 · 1/5 · 1/3 · 1 · 3 · 5 · 7 · 9</p>
                    </section>
                  </> : null}
                  {settingsTab === "analysis" ? <section className="surface-card settings-card">
                    <div className="settings-card-header"><div><h2>Analysis defaults</h2><p>Starting values for a new screening run.</p></div><HydroIcon name="analysis" size={23} color="var(--brand)" /></div>
                    <div className="setting-line"><div className="setting-copy"><div className="setting-name">Default catchment buffer</div><div className="setting-description">Radius around the selected analysis location</div></div><label className="setting-control"><input type="range" min="1" max="25" value={defaultBuffer} onChange={(event) => setDefaultBuffer(Number(event.target.value))} aria-label="Default buffer in kilometers" /><strong>{defaultBuffer} km</strong></label></div>
                    <div className="setting-line"><div className="setting-copy"><div className="setting-name">Turbine efficiency assumption</div><div className="setting-description">Used in preliminary hydropower capacity estimates</div></div><label className="setting-control"><input type="range" min="0.5" max="0.95" step="0.01" value={efficiency} onChange={(event) => setEfficiency(Number(event.target.value))} aria-label="Default turbine efficiency" /><strong>{Math.round(efficiency * 100)}%</strong></label></div>
                    <div className="setting-line"><div className="setting-copy"><div className="setting-name">Measurement units</div><div className="setting-description">Distance, flow and power display conventions</div></div><div className="segmented"><button className={units === "metric" ? "selected" : ""} type="button" onClick={() => setUnits("metric")}>Metric</button><button className={units === "imperial" ? "selected" : ""} type="button" onClick={() => setUnits("imperial")}>Imperial</button></div></div>
                    <div className="setting-line"><div className="setting-copy"><div className="setting-name">Export format</div><div className="setting-description">Default report delivery</div></div><div className="segmented"><button className="selected" type="button" onClick={() => toast.info("PDF selected for reports")}>PDF</button><button type="button" onClick={() => toast.info("CSV selected for reports")}>CSV</button></div></div>
                  </section> : null}
                  {settingsTab === "appearance" ? <section className="surface-card settings-card">
                    <div className="settings-card-header"><div><h2>Appearance & map</h2><p>Comfortable choices for every field and office environment.</p></div><HydroIcon name="appearance" size={23} color="var(--brand)" /></div>
                    <div className="setting-line"><div className="setting-copy"><div className="setting-name">Color theme</div><div className="setting-description">Light, dark, or follow your device preference</div></div><div className="segmented" role="radiogroup" aria-label="Theme selection">{[{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Laptop }].map(({ value, label, icon: Icon }) => <button className={theme === value ? "selected" : ""} key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => setTheme(value as "light" | "dark" | "system")}><Icon size={11} /> {label}</button>)}</div></div>
                    <div className="setting-line"><div className="setting-copy"><div className="setting-name">Default basemap</div><div className="setting-description">Raster map background for the opportunity atlas</div></div><select className="field-select" value={basemap} onChange={(event) => changeBasemap(event.target.value as BasemapKey)}><option value="dark">CARTO Dark Matter</option><option value="imagery">Esri satellite</option><option value="topo">OpenTopoMap</option><option value="street">OpenStreetMap</option></select></div>
                    <div className="setting-line"><div className="setting-copy"><div className="setting-name">Reduced motion</div><div className="setting-description">Honor the device accessibility preference</div></div><span className="status-badge status-online">System preference</span></div>
                  </section> : null}
                  {settingsTab === "sources" ? <section className="surface-card settings-card">
                    <div className="settings-card-header"><div><h2>Data source registry</h2><p>Trusted terrain, hydrology, climate, land-cover and infrastructure inputs.</p></div><button className="button button-secondary button-small" type="button" onClick={() => void refreshDashboard()}><RefreshCw size={12} /> Sync status</button></div>
                    <div className="source-summary"><div><strong>{dataSources.length}</strong><span>total sources</span></div><div><strong>{dataSources.filter((source) => source.status === "online").length}</strong><span>online</span></div><div><strong>{Math.round(dataSources.reduce((sum, source) => sum + source.coveragePct, 0) / Math.max(1, dataSources.length))}%</strong><span>avg coverage</span></div><div><strong>{dataSources.filter((source) => source.status === "degraded" || source.status === "offline").length}</strong><span>need attention</span></div></div>
                    <div className="source-filter-row"><label className="filter-label"><Filter size={12} /><span>Category</span></label><select className="field-select" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All categories</option>{Array.from(new Set(dataSources.map((source) => source.category))).sort().map((category) => <option key={category}>{category}</option>)}</select><span className="filter-count">{visibleSources.length} sources</span></div>
                    <div className="source-grid">{visibleSources.map((source) => <article className="source-card" key={source.id}><div className="source-card-top"><div className="data-health-icon" data-category={source.category}><HydroIcon name={sourceIconFor(source.category)} size={20} /></div><div className="source-card-copy"><div className="source-name">{source.name}</div><div className="source-provider">{source.provider}</div></div><StatusBadge value={source.status} /></div><p className="source-description">{source.description}</p><div className="source-stats"><span>Coverage <strong>{source.coveragePct}%</strong></span><span><strong>{formatNumber(source.records)}</strong> records</span><span><strong>{source.latencyMs || "—"}</strong> ms</span></div><div className="coverage-line"><span style={{ width: `${source.coveragePct}%` }} /></div><div className="source-card-actions"><button className="button button-quiet button-small" type="button" onClick={() => void handleSourceRefresh(source)} disabled={busySource === source.id}><RefreshCw size={11} className={busySource === source.id ? "spin-icon" : ""} /> Refresh</button><button className={`switch ${source.enabled ? "" : "switch-off"}`} type="button" role="switch" aria-checked={source.enabled} aria-label={`${source.enabled ? "Disable" : "Enable"} ${source.name}`} onClick={() => void handleSourceToggle(source)} disabled={busySource === source.id} /></div></article>)}</div>
                  </section> : null}
                  {settingsTab === "users" && isAdmin ? <section className="surface-card settings-card">
                    <div className="settings-card-header"><div><h2>Team &amp; access</h2><p>Workspace accounts and their write permissions.</p></div><StatusBadge value="rbac enforced" /></div>
                    <div className="table-wrap"><table className="data-table table-compact"><thead><tr><th>Member</th><th>Organization</th><th>Role</th><th>Joined</th></tr></thead><tbody>
                      {workspaceUsers.map((member) => <tr key={member.id} style={{ cursor: "default" }}>
                        <td><div className="site-table-name">{member.name}</div><div className="site-table-code">{member.email}</div></td>
                        <td>{member.organization || "—"}</td>
                        <td><StatusBadge value={member.role} /></td>
                        <td className="table-muted">{new Date(member.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      </tr>)}
                    </tbody></table></div>
                    <p className="settings-footnote">Admins manage everyone’s data; planners can write sites and run analyses; viewers are read-only.</p>
                    <div className="drawer-section" style={{ marginBottom: 0 }}>
                      <div className="panel-heading"><h3>Import history</h3><span className="form-help">{uploads.length} files</span></div>
                      {uploads.length ? uploads.map((upload) => (
                        <div className="nearby-row" key={upload.id}>
                          <span>{upload.filename}<div className="site-table-code">{formatNumber(upload.size)} bytes · {upload.kind}</div></span>
                          <span className="table-muted"><StatusBadge value={upload.status} /> {upload.rowsImported} rows</span>
                        </div>
                      )) : <div className="snapshot-empty">No files imported yet.</div>}
                    </div>
                  </section> : null}
                  {settingsTab === "users" && !isAdmin ? <section className="surface-card settings-card">
                    <div className="settings-card-header"><div><h2>Team &amp; access</h2><p>Restricted area.</p></div><ShieldAlert size={17} color="var(--warn)" /></div>
                    <div className="risk-note">Only administrators can list workspace accounts. Sign in with the admin demo role to view this section.</div>
                  </section> : null}
                  <div className="settings-role-note"><ShieldAlert size={14} /><span>All screening outputs are deterministic simulations. They are not engineering design or investment advice.</span><span className="role-indicator">{currentUser ? `${currentUser.role} access` : "Sign in to save"}</span></div>
                </div>
              </div>
            </>
          ) : null}
          </div>
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{NAV_ITEMS.map(({ key, label, mobileLabel, icon }) => <button className={view === key ? "active" : ""} key={key} type="button" onClick={() => navigate(key)} aria-current={view === key ? "page" : undefined} aria-label={label}><span className="mobile-nav-icon"><HydroIcon name={icon} size={21} /></span><span>{mobileLabel}</span></button>)}</nav>
      <Toaster position="bottom-right" richColors closeButton theme={theme} toastOptions={{ className: "toast-region" }} />

      {selectedSite ? <DetailsDrawer key={selectedSite.id} site={selectedSite} allSites={sites} tab={detailTab} onTabChange={setDetailTab} onClose={() => setSelectedSite(null)} onSaveNotes={(notes) => void handleSaveNotes(notes)} onStatusChange={(status) => void handleStatusChange(status)} onExport={(format) => void handleExport(format)} canWrite={canWrite} reports={selectedSite ? siteReports[selectedSite.id] ?? [] : []} reportBusy={reportBusy} onSaveReport={() => void handleSaveReport()} onDeleteReport={(id) => void handleDeleteReport(id)} /> : null}

      {runOpen ? <ModalFrame title="Run a feasibility analysis" description="Define a corridor, then follow a live six-stage screening." onClose={() => setRunOpen(false)} wide>
        <form onSubmit={(event) => void handleRunJob(event)}>
          <div className="form-grid">
            <label className="form-field full"><span className="form-label">Analysis label</span><input className="text-input" value={runForm.label} onChange={(event) => setRunForm((previous) => ({ ...previous, label: event.target.value }))} placeholder="e.g. Arun corridor screening" required maxLength={120} /></label>
            <label className="form-field"><span className="form-label">Latitude</span><div className="input-with-suffix"><input className="text-input" value={runForm.lat} onChange={(event) => setRunForm((previous) => ({ ...previous, lat: event.target.value }))} inputMode="decimal" required /><span className="input-suffix">° N</span></div></label>
            <label className="form-field"><span className="form-label">Longitude</span><div className="input-with-suffix"><input className="text-input" value={runForm.lng} onChange={(event) => setRunForm((previous) => ({ ...previous, lng: event.target.value }))} inputMode="decimal" required /><span className="input-suffix">° E</span></div></label>
            <label className="form-field"><span className="form-label">Catchment buffer</span><div className="input-with-suffix"><input className="text-input" type="number" min="1" max="25" value={runForm.bufferKm} onChange={(event) => setRunForm((previous) => ({ ...previous, bufferKm: event.target.value }))} required /><span className="input-suffix">km</span></div></label>
            <label className="form-field"><span className="form-label">Turbine efficiency</span><div className="input-with-suffix"><input className="text-input" type="number" min="0.5" max="0.95" step="0.01" value={runForm.efficiency} onChange={(event) => setRunForm((previous) => ({ ...previous, efficiency: event.target.value }))} required /><span className="input-suffix">η</span></div></label>
            <div className="form-field full"><button className="button button-secondary button-small" type="button" onClick={() => startPick("run")}><HydroIcon name="locate" size={16} /> Pick location on map</button><span className="form-help">Nepal bounds: 26.3°–30.5° N, 80°–88.3° E.</span></div>
          </div>
          <div className="run-toggles"><div className="form-switch-row"><div className="form-switch-copy"><strong>12.5 m terrain super-resolution</strong><span>Include enhanced elevation features in the deterministic simulation.</span></div><button className={`switch ${runForm.superResolution ? "" : "switch-off"}`} type="button" role="switch" aria-checked={runForm.superResolution} aria-label="Toggle terrain super-resolution" onClick={() => setRunForm((previous) => ({ ...previous, superResolution: !previous.superResolution }))} /></div><div className="form-switch-row"><div className="form-switch-copy"><strong>Environmental screening</strong><span>Include protected-area proximity and ecological sensitivity proxies.</span></div><button className={`switch ${runForm.environmental ? "" : "switch-off"}`} type="button" role="switch" aria-checked={runForm.environmental} aria-label="Toggle environmental screening" onClick={() => setRunForm((previous) => ({ ...previous, environmental: !previous.environmental }))} /></div></div>
          <div className="simulation-callout"><HydroIcon name="simulation" size={14} /><span>Simulation only. No external DEM processing or real ML/GNN inference occurs in this demo.</span></div>
          <div className="form-footer"><span className="form-footer-note">Estimated runtime {runForm.superResolution ? "6.4" : "4.6"} sec · outputs are reproducible for the same input.</span><div className="page-heading-actions"><button className="button button-secondary" type="button" onClick={() => setRunOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={runBusy}>{runBusy ? <LoaderCircle size={13} className="spin-icon" /> : <HydroIcon name="analysis" size={16} />} Start screening</button></div></div>
        </form>
      </ModalFrame> : null}

      {promoteTarget ? <ModalFrame title="Promote analysis to a candidate" description="Turns this screening result into a scored site record and links it back to the job." onClose={() => setPromoteTarget(null)}>
        <div className="promote-summary">
          <div><span>Source analysis</span><strong>{promoteTarget.label}</strong></div>
          <div><span>Location</span><strong>{promoteTarget.lat.toFixed(3)}° N, {promoteTarget.lng.toFixed(3)}° E</strong></div>
          <div><span>Best score</span><strong>{promoteTarget.result?.bestScore.toFixed(1) ?? "—"}</strong></div>
          <div><span>Potential</span><strong>{promoteTarget.result ? `${promoteTarget.result.potentialMw.toFixed(1)} MW` : "—"}</strong></div>
        </div>
        <div className="form-grid" style={{ marginTop: 13 }}>
          <label className="form-field full"><span className="form-label">Candidate name</span><input autoFocus className="text-input" value={promoteForm.name} maxLength={120} onChange={(event) => setPromoteForm((previous) => ({ ...previous, name: event.target.value }))} /></label>
          <label className="form-field full"><span className="form-label">District</span><input className="text-input" value={promoteForm.district} maxLength={100} onChange={(event) => setPromoteForm((previous) => ({ ...previous, district: event.target.value }))} /></label>
        </div>
        <div className="form-footer"><span className="form-footer-note">Metrics are computed deterministically from the job point and your saved weights.</span><div className="page-heading-actions"><button className="button button-secondary" type="button" onClick={() => setPromoteTarget(null)}>Cancel</button><button className="button button-primary" type="button" onClick={() => void confirmPromote()} disabled={promoteBusy}>{promoteBusy ? <LoaderCircle size={13} className="spin-icon" /> : <Check size={13} />} Create candidate</button></div></div>
      </ModalFrame> : null}

      {importOpen ? <ModalFrame title="Import candidate sites" description="Paste CSV rows or choose a file. Columns: name,river,district,lat,lng,headM,dischargeQ40." onClose={() => setImportOpen(false)} wide>
        <div className="import-grid">
          <label className="form-field"><span className="form-label">CSV content</span>
            <textarea className="text-input form-textarea import-textarea" value={importText} onChange={(event) => { setImportText(event.target.value); setImportResult(null); }} placeholder={IMPORT_TEMPLATE} spellCheck={false} aria-label="Candidate sites CSV content" />
          </label>
          <div className="form-field"><span className="form-label">Or choose a file</span>
            <label className="file-dropzone">
              <input type="file" accept=".csv,text/csv" onChange={(event) => readImportFile(event.target.files?.[0])} aria-label="Choose CSV file" />
              <Upload size={16} />
              <span>{importFilename}</span>
              <small>Header row optional · max 250 KB</small>
            </label>
            <button className="button button-quiet button-small" type="button" onClick={() => { setImportText(IMPORT_TEMPLATE); setImportFilename("sample-candidates.csv"); setImportResult(null); }}><Plus size={12} /> Insert sample rows</button>
          </div>
        </div>
        {importResult ? (
          <div className={`import-result ${importResult.rowsImported > 0 ? "ok" : "bad"}`}>
            <strong>{importResult.rowsImported} row{importResult.rowsImported === 1 ? "" : "s"} imported</strong>
            {importResult.sites.length ? <span>Created {importResult.sites.slice(0, 4).map((entry) => entry.code).join(", ")}{importResult.sites.length > 4 ? ` +${importResult.sites.length - 4} more` : ""}</span> : null}
            {importResult.errors.length ? <ul>{importResult.errors.slice(0, 5).map((error) => <li key={error}>{error}</li>)}</ul> : <span>Every row passed validation.</span>}
          </div>
        ) : null}
        <div className="form-footer"><span className="form-footer-note">Rows are scored with the deterministic engine using your current AHP weights.</span><div className="page-heading-actions"><button className="button button-secondary" type="button" onClick={() => setImportOpen(false)}>{importResult ? "Close" : "Cancel"}</button><button className="button button-primary" type="button" onClick={() => void handleImport()} disabled={importBusy || !importText.trim()}>{importBusy ? <LoaderCircle size={13} className="spin-icon" /> : <Upload size={13} />} Import sites</button></div></div>
      </ModalFrame> : null}

      {siteOpen ? <ModalFrame title="Add a candidate site" description="Create a scored site record from known coordinates and optional field measurements." onClose={() => setSiteOpen(false)} wide>
        <form onSubmit={(event) => void handleCreateSite(event)}>
          <div className="form-grid">
            <label className="form-field full"><span className="form-label">Candidate name</span><input className="text-input" value={siteForm.name} onChange={(event) => setSiteForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. Upper Arun reach 04" required maxLength={120} /></label>
            <label className="form-field"><span className="form-label">Latitude</span><input className="text-input" value={siteForm.lat} onChange={(event) => setSiteForm((previous) => ({ ...previous, lat: event.target.value }))} required inputMode="decimal" /></label>
            <label className="form-field"><span className="form-label">Longitude</span><input className="text-input" value={siteForm.lng} onChange={(event) => setSiteForm((previous) => ({ ...previous, lng: event.target.value }))} required inputMode="decimal" /></label>
            <label className="form-field"><span className="form-label">Net head (optional)</span><div className="input-with-suffix"><input className="text-input" value={siteForm.headM} onChange={(event) => setSiteForm((previous) => ({ ...previous, headM: event.target.value }))} type="number" min="1" placeholder="Auto-estimate" /><span className="input-suffix">m</span></div></label>
            <label className="form-field"><span className="form-label">Q40 discharge (optional)</span><div className="input-with-suffix"><input className="text-input" value={siteForm.dischargeQ40} onChange={(event) => setSiteForm((previous) => ({ ...previous, dischargeQ40: event.target.value }))} type="number" min="0.1" step="0.1" placeholder="Auto-estimate" /><span className="input-suffix">m³/s</span></div></label>
            <label className="form-field"><span className="form-label">River / reach</span><input className="text-input" value={siteForm.river} onChange={(event) => setSiteForm((previous) => ({ ...previous, river: event.target.value }))} placeholder="Optional" /></label>
            <label className="form-field"><span className="form-label">District</span><input className="text-input" value={siteForm.district} onChange={(event) => setSiteForm((previous) => ({ ...previous, district: event.target.value }))} placeholder="Optional" /></label>
            <label className="form-field full"><span className="form-label">Notes</span><textarea className="text-input form-textarea" value={siteForm.notes} onChange={(event) => setSiteForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Field context or follow-up tasks" /></label>
            <div className="form-field full"><button className="button button-secondary button-small" type="button" onClick={() => startPick("site")}><HydroIcon name="locate" size={16} /> Pick location on map</button></div>
          </div>
          <div className="form-footer"><span className="form-footer-note">Power estimate: ρ · g · Q40 · H · η · scored with current model defaults.</span><div className="page-heading-actions"><button className="button button-secondary" type="button" onClick={() => setSiteOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={siteBusy}>{siteBusy ? <LoaderCircle size={13} className="spin-icon" /> : <Plus size={13} />} Add candidate</button></div></div>
        </form>
      </ModalFrame> : null}

      {loginOpen ? (
        <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setLoginOpen(false); setLoginError(""); } }}>
          <section className="auth-card" role="dialog" aria-modal="true" aria-label="Sign in to HydroSite" onKeyDown={(event) => { if (event.key === "Escape") { setLoginOpen(false); setLoginError(""); } }}>
            <button className="icon-button auth-close" type="button" aria-label="Close sign in" onClick={() => { setLoginOpen(false); setLoginError(""); }}><X size={16} /></button>
            <div className="auth-story">
              <div className="login-brand"><div className="brand-mark"><HydroIcon name="brand" size={27} /></div><span>HYDROSITE 2.0</span></div>
              <h2>Nepal’s hydropower pipeline, screened in seconds.</h2>
              <p>A deterministic, multimodal screening workspace that fuses terrain, river-network and grid context into one comparable feasibility score for every candidate reach.</p>
              <div className="auth-points">
                <div className="auth-point"><span className="auth-point-icon"><HydroIcon name="terrain" size={13} /></span><span>30 m → 12.5 m terrain super-resolution with validation metrics.</span></div>
                <div className="auth-point"><span className="auth-point-icon"><HydroIcon name="river" size={13} /></span><span>River-GNN reach graphs with typed nodes and embeddings.</span></div>
                <div className="auth-point"><span className="auth-point-icon"><HydroIcon name="sliders" size={13} /></span><span>AHP / MCDM weighting you control, with consistency checking.</span></div>
              </div>
            </div>
            <div className="auth-form-col">
              <div className="login-brand"><HydroIcon name="shield" size={18} /><span>SIGN IN</span></div>
              <h2 className="auth-title">Welcome back</h2>
              <p className="auth-subtitle">Choose a demo role, or sign in with your workspace credentials.</p>
              <form onSubmit={(event) => void handleLogin(event)}>
                <label className="form-field"><span className="form-label">Email address</span><input className="text-input" type="email" value={loginEmail} onChange={(event) => { setLoginEmail(event.target.value); setLoginError(""); }} required autoComplete="username" placeholder="planner@hydrosite.np" /></label>
                <label className="form-field"><span className="form-label">Password</span>
                  <div className="password-wrap">
                    <input className="text-input" type={passwordVisible ? "text" : "password"} value={loginPassword} onChange={(event) => { setLoginPassword(event.target.value); setLoginError(""); }} required autoComplete="current-password" placeholder="••••••••" />
                    <button className="password-reveal" type="button" aria-label={passwordVisible ? "Hide password" : "Show password"} onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  </div>
                </label>
                {loginError ? <div className="form-error" role="alert">{loginError}</div> : null}
                <button className="button button-primary button-large" type="submit" disabled={loginBusy}>{loginBusy ? <LoaderCircle size={14} className="spin-icon" /> : <LogIn size={14} />}{loginBusy ? "Signing in…" : "Continue to workspace"}</button>
              </form>
              <div className="demo-divider"><span /><small>DEMO ROLES</small><span /></div>
              <div className="demo-logins">
                {DEMO_ACCOUNTS.map((account) => (
                  <button className="demo-role-button" key={account.role} type="button" aria-pressed={loginEmail === account.email} onClick={() => { setLoginEmail(account.email); setLoginPassword(account.password); setLoginError(""); }}>
                    <span className="demo-role-heading"><HydroIcon name={account.icon} size={18} /><strong>{account.role}</strong>{loginEmail === account.email ? <Check className="demo-role-check" size={12} /> : null}</span><span>{account.label}</span>
                  </button>
                ))}
              </div>
              <p className="login-footnote">Demo passwords are shown for this local deterministic environment. Every write is still authorised server-side by role.</p>
            </div>
          </section>
        </div>
      ) : null}

      {commandOpen ? <ModalFrame title="Command palette" description="Navigate, search candidates, or jump into a new screening." onClose={() => setCommandOpen(false)} wide>
        <div className="command-search"><Command size={15} /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Type a command or search sites…" aria-label="Command search" /></div>
        <div className="command-results"><div className="palette-section-title">Navigate</div>{NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(commandQuery.toLowerCase())).map(({ key, label, icon }) => <button className="palette-option" type="button" key={key} onClick={() => { navigate(key); setCommandOpen(false); }}><span className="palette-icon"><HydroIcon name={icon} size={18} /></span><span>{label}</span><ArrowRight size={12} /></button>)}{commandQuery ? <><div className="palette-section-title">Candidate sites</div>{sites.filter((site) => `${site.name} ${site.river} ${site.code}`.toLowerCase().includes(commandQuery.toLowerCase())).slice(0, 5).map((site) => <button className="palette-option" type="button" key={site.id} onClick={() => onPaletteSelectSite(site)}><HydroIcon name="sites" size={14} /><span>{site.name} <small>{site.code} · {site.province}</small></span><ArrowRight size={12} /></button>)}</> : <><div className="palette-section-title">Quick actions</div><button className="palette-option" type="button" onClick={() => { setCommandOpen(false); if (beginWrite("run")) setRunOpen(true); }}><HydroIcon name="analysis" size={18} /><span>Run a new feasibility analysis</span><kbd className="keycap">↵</kbd></button><button className="palette-option" type="button" onClick={() => { setCommandOpen(false); if (beginWrite("site")) setSiteOpen(true); }}><Plus size={14} /><span>Add a candidate site</span></button></>}</div>
        <div className="palette-footer"><span><kbd className="keycap">↑↓</kbd> to navigate</span><span><kbd className="keycap">↵</kbd> to select</span><span><kbd className="keycap">esc</kbd> to close</span></div>
      </ModalFrame> : null}

      {shortcutOpen ? <ModalFrame title="Keyboard shortcuts" description="Move through HydroSite without leaving the keyboard." onClose={() => setShortcutOpen(false)}>
        <div className="shortcut-list"><div><span>Open command palette</span><kbd className="keycap">⌘ K</kbd></div><div><span>Show keyboard shortcuts</span><kbd className="keycap">?</kbd></div><div><span>Dashboard</span><kbd className="keycap">G D</kbd></div><div><span>Candidate sites</span><kbd className="keycap">G S</kbd></div><div><span>Analysis runs</span><kbd className="keycap">G A</kbd></div><div><span>Request inspector</span><kbd className="keycap">Ctrl ⇧ L</kbd></div><div><span>Close modal / drawer</span><kbd className="keycap">Esc</kbd></div></div>
      </ModalFrame> : null}

      {inspectorOpen ? <aside className="request-inspector" aria-label="Request inspector"><div className="request-inspector-header"><strong><HydroIcon name="analysis" size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Request inspector</strong><IconButton label="Close inspector" onClick={() => setInspectorOpen(false)}><X size={13} /></IconButton></div>{requestLogs.length ? <table><thead><tr><th align="left">Method</th><th align="left">Route</th><th align="left">Status</th><th align="left">Duration</th><th align="left">Time</th></tr></thead><tbody>{requestLogs.slice(0, 8).map((log) => <tr key={log.id}><td>{log.method}</td><td>{log.target}</td><td>{log.status || "NET"}</td><td>{log.duration} ms</td><td>{formatTime(log.at)}</td></tr>)}</tbody></table> : <div className="empty-inspector">Requests from the typed API client appear here as you work.</div>}</aside> : null}
    </div>
  );
}

function MetricCard({ label, value, unit, icon, caption, tone = "", delta, alert = false }: { label: string; value: string; unit?: string; icon: ReactNode; caption: string; tone?: string; delta?: string; alert?: boolean }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value-row"><span className="metric-value">{value}{unit ? <span className="metric-unit">{unit}</span> : null}</span>{delta && !alert ? <span className="metric-delta"><ArrowUpRight size={11} /> {delta}</span> : alert ? <span className="metric-delta risk-delta"><AlertTriangle size={10} /> Review</span> : null}</div><div className="metric-caption">{caption}</div></article>;
}

function PageHeading({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{actions ? <div className="page-heading-actions">{actions}</div> : null}</div>;
}

function JobProgressRow({ job, onClick }: { job: JobSnapshot; onClick: () => void }) {
  return <button className="job-row job-row-button" type="button" onClick={onClick}><div className="job-row-top"><div><div className="job-name">{job.label}</div><div className="job-meta">{job.lat.toFixed(2)}° N, {job.lng.toFixed(2)}° E · {job.bufferKm} km</div></div><span className="job-progress-label">{job.progress}%</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${job.progress}%` }} /></div><div className="job-row-bottom"><span>{job.currentStep}</span><span>{formatRelative(job.startedAt)}</span></div></button>;
}

function SortHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="sort-button" type="button" onClick={(event) => { event.stopPropagation(); onClick(); }}>{label}<ArrowUpDown size={10} /></button>;
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div><div className="empty-state-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div></div>;
}

function saatyValue(ratio: number): string {
  const scale = [1 / 9, 1 / 7, 1 / 5, 1 / 3, 1, 3, 5, 7, 9];
  const labels = ["1/9", "1/7", "1/5", "1/3", "1", "3", "5", "7", "9"];
  let nearest = 4;
  let difference = Number.POSITIVE_INFINITY;
  scale.forEach((value, index) => {
    const next = Math.abs(Math.log(Math.max(ratio, 0.0001)) - Math.log(value));
    if (next < difference) { difference = next; nearest = index; }
  });
  return labels[nearest];
}
