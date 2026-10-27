export const DEFAULT_WEIGHTS = {
  hydrology: 0.3,
  topography: 0.22,
  accessibility: 0.12,
  environment: 0.16,
  socioEconomic: 0.08,
  grid: 0.12,
} as const;

export type Criterion = keyof typeof DEFAULT_WEIGHTS;
export type Subscores = Record<Criterion, number>;
export type PlantType = "Micro" | "Mini" | "Small" | "Large";
export type SiteStatus = "candidate" | "screening" | "shortlisted" | "rejected";
export type EnvRisk = "Low" | "Medium" | "High";

export interface SiteMetrics {
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
  plantType: PlantType;
  score: number;
  envRisk: EnvRisk;
  confidence: number;
  status: SiteStatus;
  subscores: Subscores;
}

export interface SiteRecord extends SiteMetrics {
  id: number;
  code: string;
  notes: string;
  createdAt: string;
}

export const CRITERIA: { key: Criterion; label: string; short: string }[] = [
  { key: "hydrology", label: "Hydrology", short: "HYD" },
  { key: "topography", label: "Topography", short: "TOP" },
  { key: "accessibility", label: "Accessibility", short: "ACC" },
  { key: "environment", label: "Environment", short: "ENV" },
  { key: "socioEconomic", label: "Socio-economic", short: "SOC" },
  { key: "grid", label: "Grid access", short: "GRID" },
];

export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function powerFromHeadFlow(headM: number, dischargeQ40: number, efficiency = 0.85): number {
  return (1000 * 9.81 * dischargeQ40 * headM * efficiency) / 1000;
}

export function plantTypeFor(powerKw: number): PlantType {
  if (powerKw <= 100) return "Micro";
  if (powerKw <= 1000) return "Mini";
  if (powerKw <= 10000) return "Small";
  return "Large";
}

export function envRiskFor(environmentScore: number): EnvRisk {
  if (environmentScore >= 65) return "Low";
  if (environmentScore >= 40) return "Medium";
  return "High";
}

export function weightedScore(subscores: Subscores, weights: Record<Criterion, number> = DEFAULT_WEIGHTS): number {
  const totalWeight = Object.values(weights).reduce((total, weight) => total + weight, 0);
  if (totalWeight <= 0) return 0;
  const total = CRITERIA.reduce((sum, { key }) => sum + subscores[key] * weights[key], 0);
  return Math.round((total / totalWeight) * 10) / 10;
}

export function computeSiteMetrics(input: {
  lat: number;
  lng: number;
  headM?: number;
  dischargeQ40?: number;
  weights?: Record<Criterion, number>;
  seed?: string;
  status?: SiteStatus;
  name?: string;
  river?: string;
  basin?: string;
  province?: string;
  district?: string;
}): SiteMetrics {
  const random = mulberry32(hashString(input.seed ?? `${input.lat.toFixed(4)}:${input.lng.toFixed(4)}`));
  const northness = clamp((input.lat - 26.3) / 4.2, 0, 1);
  const headM = input.headM ?? Math.round(55 + random() * 255);
  const dischargeQ40 = input.dischargeQ40 ?? Number((2.5 + random() * 34).toFixed(1));
  const slopePct = Number((5 + northness * 12 + random() * 13).toFixed(1));
  const catchmentKm2 = Math.round(22 + dischargeQ40 * 14 + random() * 180);
  const subscores: Subscores = {
    hydrology: Math.round(clamp(45 + dischargeQ40 * 0.9 + random() * 25, 5, 98)),
    topography: Math.round(clamp(52 + headM * 0.08 + random() * 24, 5, 98)),
    accessibility: Math.round(clamp(72 - northness * 18 + random() * 30, 5, 98)),
    environment: Math.round(clamp(14 + random() * 80, 5, 98)),
    socioEconomic: Math.round(clamp(48 + random() * 40, 5, 98)),
    grid: Math.round(clamp(45 + random() * 48, 5, 98)),
  };
  const powerKw = Math.round(powerFromHeadFlow(headM, dischargeQ40));
  return {
    name: input.name ?? "Unnamed reach",
    river: input.river ?? "Himalayan tributary",
    basin: input.basin ?? "Koshi",
    province: input.province ?? "Koshi Province",
    district: input.district ?? "Sankhuwasabha",
    lat: input.lat,
    lng: input.lng,
    headM,
    dischargeQ40,
    slopePct,
    catchmentKm2,
    powerKw,
    plantType: plantTypeFor(powerKw),
    score: weightedScore(subscores, input.weights),
    envRisk: envRiskFor(subscores.environment),
    confidence: Number((0.72 + random() * 0.24).toFixed(2)),
    status: input.status ?? "candidate",
    subscores,
  };
}

const REFERENCE_LOCATIONS = [
  ["Upper Tamor", "Tamor", "Koshi", "Koshi Province", "Taplejung", 27.352, 87.668, 182, 42],
  ["Lower Arun", "Arun", "Koshi", "Koshi Province", "Sankhuwasabha", 27.483, 87.217, 128, 66],
  ["Barun Khola", "Barun", "Koshi", "Koshi Province", "Sankhuwasabha", 27.783, 87.083, 220, 16],
  ["Likhu Cascade", "Likhu", "Koshi", "Koshi Province", "Solukhumbu", 27.667, 86.533, 164, 13],
  ["Melamchi Reach", "Melamchi", "Bagmati", "Bagmati Province", "Sindhupalchok", 27.833, 85.617, 96, 12],
  ["Upper Trishuli", "Trishuli", "Gandaki", "Bagmati Province", "Rasuwa", 28.183, 85.333, 145, 32],
  ["Langtang Tributary", "Langtang", "Gandaki", "Bagmati Province", "Rasuwa", 28.12, 85.42, 174, 9.8],
  ["Marsyangdi Bend", "Marsyangdi", "Gandaki", "Gandaki Province", "Manang", 28.55, 84.25, 190, 23],
  ["Myagdi Corridor", "Myagdi", "Gandaki", "Gandaki Province", "Myagdi", 28.5, 83.5, 138, 14],
  ["Kali Gandaki North", "Kali Gandaki", "Gandaki", "Gandaki Province", "Mustang", 29.05, 83.85, 215, 27],
  ["Budhi Gandaki", "Budhi Gandaki", "Gandaki", "Gandaki Province", "Gorkha", 28.45, 84.9, 118, 18],
  ["Seti Gandaki Gorge", "Seti Gandaki", "Gandaki", "Gandaki Province", "Kaski", 28.32, 83.93, 96, 21],
  ["Modi Khola", "Modi", "Gandaki", "Gandaki Province", "Parbat", 28.28, 83.72, 88, 17],
  ["Karnali Upper", "Karnali", "Karnali", "Karnali Province", "Humla", 29.95, 81.8, 205, 38],
  ["Humla Karnali", "Humla Karnali", "Karnali", "Karnali Province", "Humla", 29.85, 81.75, 148, 25],
  ["Bheri Confluence", "Bheri", "Karnali", "Karnali Province", "Surkhet", 28.6, 81.63, 82, 54],
  ["West Seti Gorge", "West Seti", "Karnali", "Sudurpashchim Province", "Bajhang", 29.48, 81.12, 164, 28],
  ["Jhimruk Khola", "Jhimruk", "Rapti", "Lumbini Province", "Pyuthan", 28.1, 82.62, 205, 4.2],
  ["Sunkoshi East", "Sun Koshi", "Koshi", "Bagmati Province", "Dolakha", 27.9, 86.15, 122, 39],
  ["Dudh Koshi Reach", "Dudh Koshi", "Koshi", "Koshi Province", "Solukhumbu", 27.82, 86.72, 155, 36],
  ["Rawa Khola", "Rawa", "Koshi", "Koshi Province", "Khotang", 27.25, 86.8, 84, 10],
  ["Mewa Khola", "Mewa", "Koshi", "Koshi Province", "Taplejung", 27.42, 87.72, 102, 13],
  ["Tamakoshi Lower", "Tamakoshi", "Koshi", "Bagmati Province", "Dolakha", 27.83, 86.1, 188, 34],
  ["Narayani Headwaters", "Narayani", "Gandaki", "Gandaki Province", "Gorkha", 28.35, 84.65, 110, 46],
  ["Bagmati Ridge", "Bagmati", "Bagmati", "Bagmati Province", "Makwanpur", 27.58, 85.12, 74, 11],
  ["Rapti Valley", "West Rapti", "Rapti", "Lumbini Province", "Rolpa", 28.25, 82.6, 96, 15],
  ["Mahakali North", "Mahakali", "Mahakali", "Sudurpashchim Province", "Darchula", 29.85, 80.98, 170, 21],
  ["Rara Outlet", "Mugu Karnali", "Karnali", "Karnali Province", "Mugu", 29.52, 82.1, 95, 12],
  ["Tila Cascade", "Tila", "Karnali", "Karnali Province", "Jumla", 29.28, 82.17, 116, 9],
  ["Seti West Reach", "Seti", "Mahakali", "Sudurpashchim Province", "Doti", 29.2, 80.95, 89, 24],
  ["Bhote Koshi Upper", "Bhote Koshi", "Koshi", "Bagmati Province", "Sindhupalchok", 27.95, 85.95, 142, 18],
  ["Indrawati Gorge", "Indrawati", "Koshi", "Bagmati Province", "Sindhupalchok", 27.78, 85.78, 92, 20],
  ["Panchthar Tributary", "Hewa", "Koshi", "Koshi Province", "Panchthar", 27.12, 87.77, 105, 8.4],
  ["Kabeli North", "Kabeli", "Koshi", "Koshi Province", "Taplejung", 27.35, 87.82, 155, 11],
  ["Madi Khola", "Madi", "Gandaki", "Gandaki Province", "Kaski", 28.35, 84.02, 79, 7.2],
  ["Aadhi Khola", "Aadhi", "Gandaki", "Gandaki Province", "Syangja", 28.08, 83.82, 82, 5.5],
  ["Thuli Bheri", "Bheri", "Karnali", "Karnali Province", "Dolpa", 29.0, 82.9, 164, 17],
  ["Kali Gandaki South", "Kali Gandaki", "Gandaki", "Gandaki Province", "Baglung", 28.22, 83.58, 132, 45],
  ["Kankai Upper", "Kankai", "Koshi", "Koshi Province", "Ilam", 26.95, 87.92, 66, 8.8],
  ["Trishuli Lower", "Trishuli", "Gandaki", "Bagmati Province", "Nuwakot", 27.92, 85.05, 105, 31],
] as const;

export function referenceSites(): SiteMetrics[] {
  return REFERENCE_LOCATIONS.map((site, index) => {
    const [name, river, basin, province, district, lat, lng, headM, dischargeQ40] = site;
    return computeSiteMetrics({
      name,
      river,
      basin,
      province,
      district,
      lat,
      lng,
      headM,
      dischargeQ40,
      seed: `hydrosite-reference-${index}`,
      status: (["candidate", "screening", "shortlisted", "candidate"] as const)[index % 4],
    });
  });
}

export interface AHPResult {
  weights: number[];
  lambdaMax: number;
  consistencyIndex: number;
  consistencyRatio: number;
  consistent: boolean;
}

const SAATY_RANDOM_INDEX = [0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49] as const;

export function matrixFromWeights(weights: number[]): number[][] {
  return weights.map((weight) => weights.map((other) => weight / other));
}

export function calculateAHP(matrix: number[][]): AHPResult {
  const size = matrix.length;
  if (size < 2 || size > 10 || matrix.some((row) => row.length !== size)) throw new Error("AHP matrix must be square with 2–10 criteria.");
  for (let row = 0; row < size; row += 1) {
    if (matrix[row][row] <= 0 || !Number.isFinite(matrix[row][row])) throw new Error("AHP diagonal values must be positive.");
    for (let column = 0; column < size; column += 1) {
      const value = matrix[row][column];
      if (value <= 0 || !Number.isFinite(value) || Math.abs(value * matrix[column][row] - 1) > 0.02) throw new Error("AHP values must be positive and reciprocal.");
    }
  }
  const geometric = matrix.map((row) => Math.pow(row.reduce((product, value) => product * value, 1), 1 / size));
  const total = geometric.reduce((sum, value) => sum + value, 0);
  const weights = geometric.map((value) => value / total);
  const weightedSums = matrix.map((row) => row.reduce((sum, value, index) => sum + value * weights[index], 0));
  const lambdaMax = weightedSums.reduce((sum, value, index) => sum + value / weights[index], 0) / size;
  const consistencyIndex = size > 1 ? Math.max(0, (lambdaMax - size) / (size - 1)) : 0;
  const randomIndex = SAATY_RANDOM_INDEX[size] ?? 1.49;
  const consistencyRatio = randomIndex === 0 ? 0 : consistencyIndex / randomIndex;
  return { weights, lambdaMax, consistencyIndex, consistencyRatio, consistent: consistencyRatio < 0.1 };
}

export function scoreBand(score: number): "low" | "moderate" | "high" | "excellent" {
  if (score < 45) return "low";
  if (score < 60) return "moderate";
  if (score < 75) return "high";
  return "excellent";
}
