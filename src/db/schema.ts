import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("planner"),
    sessionVersion: integer("session_version").notNull().default(0),
    organization: text("organization").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sites = pgTable(
  "sites",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    river: text("river").notNull(),
    basin: text("basin").notNull(),
    province: text("province").notNull(),
    district: text("district").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    headM: real("head_m").notNull(),
    dischargeQ40: real("discharge_q40").notNull(),
    slopePct: real("slope_pct").notNull().default(0),
    catchmentKm2: real("catchment_km2").notNull().default(0),
    powerKw: real("power_kw").notNull(),
    plantType: text("plant_type").notNull(),
    score: real("score").notNull(),
    envRisk: text("env_risk").notNull(),
    confidence: real("confidence").notNull().default(0.8),
    status: text("status").notNull().default("candidate"),
    subscores: jsonb("subscores").$type<Record<string, number>>().notNull(),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sites_code_unique").on(table.code)],
);

export const analysisJobs = pgTable("analysis_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: integer("user_id").references(() => users.id),
  label: text("label").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  bufferKm: real("buffer_km").notNull().default(5),
  options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("running"),
  durationMs: integer("duration_ms").notNull().default(5600),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  siteId: text("site_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dataSources = pgTable("data_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  resolution: text("resolution").notNull(),
  status: text("status").notNull().default("online"),
  enabled: boolean("enabled").notNull().default(true),
  coveragePct: real("coverage_pct").notNull().default(0),
  records: integer("records").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  lastSync: timestamp("last_sync", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => sites.id),
  userId: integer("user_id").references(() => users.id),
  status: text("status").notNull().default("ready"),
  content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploads = pgTable("uploads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  filename: text("filename").notNull(),
  size: integer("size").notNull().default(0),
  mime: text("mime").notNull().default("text/csv"),
  kind: text("kind").notNull().default("sites"),
  status: text("status").notNull().default("processed"),
  rowsImported: integer("rows_imported").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: integer("user_id").primaryKey().references(() => users.id),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
