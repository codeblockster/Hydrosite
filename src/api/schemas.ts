import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(200),
});

export const siteCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  lat: z.number().min(26.3).max(30.5),
  lng: z.number().min(80).max(88.3),
  headM: z.number().positive().max(1000).optional(),
  dischargeQ40: z.number().positive().max(2000).optional(),
  river: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const sitePatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["candidate", "screening", "shortlisted", "rejected"]).optional(),
  notes: z.string().max(2000).optional(),
});

export const jobCreateSchema = z.object({
  label: z.string().trim().min(2).max(120),
  lat: z.number().min(26.3).max(30.5),
  lng: z.number().min(80).max(88.3),
  bufferKm: z.number().min(1).max(25).default(5),
  efficiency: z.number().min(0.5).max(0.95).default(0.85),
  superResolution: z.boolean().default(true),
  environmental: z.boolean().default(true),
});

export const ahpWeightsSchema = z.object({
  matrix: z.array(z.array(z.number().positive().finite())).min(2).max(10),
  save: z.boolean().default(false),
}).strict();

export const reportCreateSchema = z.object({
  siteId: z.number().int().positive(),
}).strict();

export const uploadCreateSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(250_000),
}).strict();

export const settingsSchema = z.object({
  weights: z.object({
    hydrology: z.number().min(0).max(1),
    topography: z.number().min(0).max(1),
    accessibility: z.number().min(0).max(1),
    environment: z.number().min(0).max(1),
    socioEconomic: z.number().min(0).max(1),
    grid: z.number().min(0).max(1),
  }).optional(),
  bufferKm: z.number().min(1).max(25).optional(),
  efficiency: z.number().min(0.5).max(0.95).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  basemap: z.enum(["dark", "imagery", "topo", "street"]).optional(),
  units: z.enum(["metric", "imperial"]).optional(),
}).strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
