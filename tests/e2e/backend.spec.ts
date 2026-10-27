import { expect, test, type APIRequestContext } from "@playwright/test";

const api = "/api/v2";
const credentials = {
  admin: { email: "admin@hydrosite.np", password: "admin123" },
  planner: { email: "planner@hydrosite.np", password: "planner123" },
  viewer: { email: "investor@hydrosite.np", password: "investor123" },
} as const;

async function signIn(request: APIRequestContext, account: keyof typeof credentials) {
  const response = await request.post(`${api}/auth/login`, { data: credentials[account] });
  expect(response.ok(), `login failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: number; role: string };
  }>;
}

test("refresh tokens rotate once and logout revokes prior access immediately", async ({ request }) => {
  const session = await signIn(request, "admin");
  const accessPayload = JSON.parse(Buffer.from(session.accessToken.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
  const refreshPayload = JSON.parse(Buffer.from(session.refreshToken.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
  expect(accessPayload.tokenType).toBe("access");
  expect(refreshPayload.tokenType).toBe("refresh");

  const refreshAsAccess = await request.get(`${api}/auth/me`, {
    headers: { Authorization: `Bearer ${session.refreshToken}` },
  });
  expect(refreshAsAccess.status()).toBe(401);
  expect((await refreshAsAccess.json()).error.code).toBe("TOKEN_INVALID");

  const accessAsRefresh = await request.post(`${api}/auth/refresh`, { data: { refreshToken: session.accessToken } });
  expect(accessAsRefresh.status()).toBe(401);
  expect((await accessAsRefresh.json()).error.code).toBe("REFRESH_INVALID");

  const rotatedResponse = await request.post(`${api}/auth/refresh`, { data: { refreshToken: session.refreshToken } });
  expect(rotatedResponse.ok()).toBeTruthy();
  const rotated = await rotatedResponse.json() as { accessToken: string; refreshToken: string };
  const rotatedPayload = JSON.parse(Buffer.from(rotated.accessToken.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
  expect(Number(rotatedPayload.sessionVersion)).toBe(Number(accessPayload.sessionVersion) + 1);

  const replay = await request.post(`${api}/auth/refresh`, { data: { refreshToken: session.refreshToken } });
  expect(replay.status()).toBe(401);
  expect((await replay.json()).error.code).toBe("REFRESH_INVALID");

  const revokedAccess = await request.get(`${api}/auth/me`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  expect(revokedAccess.status()).toBe(401);

  const validSession = await request.get(`${api}/auth/me`, {
    headers: { Authorization: `Bearer ${rotated.accessToken}` },
  });
  expect(validSession.ok()).toBeTruthy();

  const logout = await request.post(`${api}/auth/logout`, {
    headers: { Authorization: `Bearer ${rotated.accessToken}` },
  });
  expect(logout.ok()).toBeTruthy();

  const afterLogout = await request.get(`${api}/auth/me`, {
    headers: { Authorization: `Bearer ${rotated.accessToken}` },
  });
  expect(afterLogout.status()).toBe(401);

  const afterLogoutRefresh = await request.post(`${api}/auth/refresh`, { data: { refreshToken: rotated.refreshToken } });
  expect(afterLogoutRefresh.status()).toBe(401);
});

test("site search and pagination run against PostgreSQL and concurrent creates allocate unique codes", async ({ request }) => {
  const planner = await signIn(request, "planner");
  const admin = await signIn(request, "admin");
  const viewer = await signIn(request, "viewer");

  const firstPageResponse = await request.get(`${api}/sites?page=1&pageSize=12&sort=score&order=desc`);
  expect(firstPageResponse.ok()).toBeTruthy();
  const firstPage = await firstPageResponse.json() as { items: Array<{ id: number; score: number }>; total: number; page: number; pageSize: number; totalPages: number };
  expect(firstPage.total).toBeGreaterThanOrEqual(40);
  expect(firstPage.page).toBe(1);
  expect(firstPage.pageSize).toBe(12);
  expect(firstPage.items).toHaveLength(12);
  expect(firstPage.items[0].score).toBeGreaterThanOrEqual(firstPage.items[1].score);

  const secondPageResponse = await request.get(`${api}/sites?page=2&pageSize=12&sort=score&order=desc`);
  expect(secondPageResponse.ok()).toBeTruthy();
  const secondPage = await secondPageResponse.json() as { items: Array<{ id: number }>; total: number; page: number };
  expect(secondPage.total).toBe(firstPage.total);
  expect(secondPage.page).toBe(2);
  expect(firstPage.items.every((site) => !secondPage.items.some((other) => other.id === site.id))).toBeTruthy();

  const matching = await request.get(`${api}/sites?q=Upper%20Tamor&pageSize=12`);
  const matchData = await matching.json() as { total: number; items: Array<{ name: string }> };
  expect(matchData.total).toBe(1);
  expect(matchData.items[0].name).toBe("Upper Tamor");

  const wildcardQuery = await request.get(`${api}/sites?q=%25&pageSize=12`);
  expect((await wildcardQuery.json()).total).toBe(0);
  const invalidPageSize = await request.get(`${api}/sites?pageSize=201`);
  expect(invalidPageSize.status()).toBe(400);
  const invalidSort = await request.get(`${api}/sites?sort=drop%20table`);
  expect(invalidSort.status()).toBe(400);

  const viewerCreate = await request.post(`${api}/sites`, {
    headers: { Authorization: `Bearer ${viewer.accessToken}` },
    data: { name: "Viewer attempt", lat: 27.6, lng: 87.3 },
  });
  expect(viewerCreate.status()).toBe(403);
  const invalidCreate = await request.post(`${api}/sites`, {
    headers: { Authorization: `Bearer ${planner.accessToken}` },
    data: { name: "Outside Nepal", lat: 32, lng: 87 },
  });
  expect(invalidCreate.status()).toBe(422);
  expect((await invalidCreate.json()).error.code).toBe("VALIDATION_ERROR");

  const payloadFor = (name: string) => ({
    name,
    lat: 27.61,
    lng: 87.31,
    headM: 105,
    dischargeQ40: 8.2,
    river: "Atomic create test",
    district: "Taplejung",
  });
  const [plannerCreate, adminCreate] = await Promise.all([
    request.post(`${api}/sites`, { headers: { Authorization: `Bearer ${planner.accessToken}` }, data: payloadFor("Concurrent planner reach") }),
    request.post(`${api}/sites`, { headers: { Authorization: `Bearer ${admin.accessToken}` }, data: payloadFor("Concurrent admin reach") }),
  ]);
  expect(plannerCreate.status()).toBe(201);
  expect(adminCreate.status()).toBe(201);
  const [plannerSite, adminSite] = await Promise.all([plannerCreate.json(), adminCreate.json()]) as Array<{ id: number; code: string; name: string; score: number }>;
  expect(plannerSite.code).not.toBe(adminSite.code);
  expect(plannerSite.score).toBeGreaterThanOrEqual(0);
  expect(plannerSite.score).toBeLessThanOrEqual(100);

  try {
    const detail = await request.get(`${api}/sites/${plannerSite.id}`);
    expect(detail.ok()).toBeTruthy();
    expect((await detail.json()).code).toBe(plannerSite.code);
  } finally {
    await Promise.all([
      request.delete(`${api}/sites/${plannerSite.id}`, { headers: { Authorization: `Bearer ${planner.accessToken}` } }),
      request.delete(`${api}/sites/${adminSite.id}`, { headers: { Authorization: `Bearer ${admin.accessToken}` } }),
    ]);
  }
});

test("analysis lifecycle streams completion, promotes atomically, cancels, and exports real bytes", async ({ request }) => {
  const planner = await signIn(request, "planner");
  const authorization = { Authorization: `Bearer ${planner.accessToken}` };
  const createdResponse = await request.post(`${api}/jobs`, {
    headers: authorization,
    data: {
      label: "SSE lifecycle regression",
      lat: 28.12,
      lng: 85.42,
      bufferKm: 4,
      efficiency: 0.82,
      superResolution: false,
      environmental: true,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json() as { id: string; status: string; currentStep: string };
  expect(created.status).toBe("running");
  expect(created.currentStep).toContain("Fetch");

  const streamResponse = await request.get(`${api}/jobs/${created.id}/stream?token=${encodeURIComponent(planner.accessToken)}`, {
    timeout: 20_000,
  });
  expect(streamResponse.ok()).toBeTruthy();
  expect(streamResponse.headers()["content-type"]).toContain("text/event-stream");
  const eventStream = await streamResponse.text();
  expect(eventStream).toContain("event: job:started");
  expect(eventStream).toContain("event: job:progress");
  expect(eventStream).toContain("event: job:completed");

  const completed = await request.get(`${api}/jobs/${created.id}`, { headers: authorization });
  expect(completed.ok()).toBeTruthy();
  expect((await completed.json()).status).toBe("completed");

  const promotion = await request.post(`${api}/jobs/${created.id}/promote`, {
    headers: authorization,
    data: { name: "Atomic promoted reach", district: "Rasuwa" },
  });
  expect(promotion.status()).toBe(201);
  const promoted = await promotion.json() as { id: number; code: string; notes: string };
  expect(promoted.notes).toContain(created.id);

  const pdfResponse = await request.get(`${api}/sites/export?format=pdf`);
  expect(pdfResponse.ok()).toBeTruthy();
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  expect((await pdfResponse.body()).byteLength).toBeGreaterThan(100);
  const csvResponse = await request.get(`${api}/sites/export?format=csv`);
  expect(csvResponse.ok()).toBeTruthy();
  expect(csvResponse.headers()["content-type"]).toContain("text/csv");
  expect(await csvResponse.text()).toContain(promoted.code);

  const cancelCreate = await request.post(`${api}/jobs`, {
    headers: authorization,
    data: {
      label: "Cancellation regression",
      lat: 28.5,
      lng: 83.5,
      bufferKm: 5,
      efficiency: 0.85,
      superResolution: true,
      environmental: true,
    },
  });
  expect(cancelCreate.status()).toBe(201);
  const cancellable = await cancelCreate.json() as { id: string };
  const cancelledResponse = await request.post(`${api}/jobs/${cancellable.id}/cancel`, { headers: authorization });
  expect(cancelledResponse.ok()).toBeTruthy();
  expect((await cancelledResponse.json()).status).toBe("cancelled");

  const deletePromoted = await request.delete(`${api}/sites/${promoted.id}`, { headers: authorization });
  expect(deletePromoted.ok()).toBeTruthy();
});

test("analysis settings, sources, and health endpoints enforce valid inputs and role boundaries", async ({ request }) => {
  const planner = await signIn(request, "planner");
  const viewer = await signIn(request, "viewer");
  const plannerHeaders = { Authorization: `Bearer ${planner.accessToken}` };
  const viewerHeaders = { Authorization: `Bearer ${viewer.accessToken}` };

  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).ok).toBeTruthy();
  const dashboard = await request.get(`${api}/dashboard`);
  expect(dashboard.ok()).toBeTruthy();
  expect((await dashboard.json()).jobs).toEqual([]);

  const settings = await request.put(`${api}/settings`, {
    headers: plannerHeaders,
    data: { theme: "dark", efficiency: 0.88, weights: { hydrology: 0.24, topography: 0.176, accessibility: 0.096, environment: 0.128, socioEconomic: 0.064, grid: 0.096 } },
  });
  expect(settings.ok()).toBeTruthy();
  const saved = await settings.json() as { theme: string; weights: Record<string, number> };
  expect(saved.theme).toBe("dark");
  expect(Object.values(saved.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);

  const viewerSettings = await request.get(`${api}/settings`, { headers: viewerHeaders });
  expect(viewerSettings.ok()).toBeTruthy();
  const viewerWrite = await request.put(`${api}/settings`, { headers: viewerHeaders, data: { theme: "light" } });
  expect(viewerWrite.status()).toBe(403);
  const invalidWeight = await request.put(`${api}/settings`, { headers: plannerHeaders, data: { weights: { hydrology: 0, topography: 0, accessibility: 0, environment: 0, socioEconomic: 0, grid: 0 } } });
  expect(invalidWeight.status()).toBe(422);

  const sourcesResponse = await request.get(`${api}/data-sources`);
  expect(sourcesResponse.ok()).toBeTruthy();
  const sources = await sourcesResponse.json() as Array<{ id: string; enabled: boolean }>;
  expect(sources).toHaveLength(12);
  const source = sources.find((entry) => entry.id === "copernicus-dem");
  expect(source).toBeTruthy();
  const originalEnabled = source!.enabled;
  try {
    const forbiddenToggle = await request.patch(`${api}/data-sources/${source!.id}`, { headers: viewerHeaders, data: { enabled: !originalEnabled } });
    expect(forbiddenToggle.status()).toBe(403);
    const toggled = await request.patch(`${api}/data-sources/${source!.id}`, { headers: plannerHeaders, data: { enabled: !originalEnabled } });
    expect(toggled.ok()).toBeTruthy();
    expect((await toggled.json()).enabled).toBe(!originalEnabled);
  } finally {
    await request.patch(`${api}/data-sources/${source!.id}`, { headers: plannerHeaders, data: { enabled: originalEnabled } });
  }

  const unauthSettings = await request.get(`${api}/settings`);
  expect(unauthSettings.status()).toBe(401);
});

test("logout closes an already-open job stream on the next session check", async ({ request, page }) => {
  const planner = await signIn(request, "planner");
  const createdResponse = await request.post(`${api}/jobs`, {
    headers: { Authorization: `Bearer ${planner.accessToken}` },
    data: {
      label: "Active stream revocation regression",
      lat: 27.6,
      lng: 87.3,
      bufferKm: 5,
      efficiency: 0.85,
      superResolution: true,
      environmental: true,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const { id } = await createdResponse.json() as { id: string };

  await page.addInitScript((tokens: { accessToken: string; refreshToken: string }) => {
    sessionStorage.setItem("hydrosite.access-token", tokens.accessToken);
    sessionStorage.setItem("hydrosite.refresh-token", tokens.refreshToken);
  }, { accessToken: planner.accessToken, refreshToken: planner.refreshToken });
  await page.goto("/");
  await page.evaluate((jobId: string) => {
    const source = new EventSource(`/api/v2/jobs/${jobId}/stream?token=${encodeURIComponent(sessionStorage.getItem("hydrosite.access-token") ?? "")}`);
    source.addEventListener("end", (event) => {
      const message = event as MessageEvent<string>;
      document.documentElement.dataset.jobStreamRevoked = JSON.parse(message.data).code;
      source.close();
    });
    source.addEventListener("job:progress", () => {
      document.documentElement.dataset.jobStreamStarted = "true";
    });
  }, id);
  await page.waitForFunction(() => document.documentElement.dataset.jobStreamStarted === "true", undefined, { timeout: 5000 });

  const logout = await request.post(`${api}/auth/logout`, {
    headers: { Authorization: `Bearer ${planner.accessToken}` },
  });
  expect(logout.ok()).toBeTruthy();
  await page.waitForFunction(() => document.documentElement.dataset.jobStreamRevoked === "TOKEN_INVALID", undefined, { timeout: 5000 });
});

test("report snapshots, CSV import, and admin-only user directory behave correctly", async ({ request }) => {
  const planner = await signIn(request, "planner");
  const admin = await signIn(request, "admin");
  const viewer = await signIn(request, "viewer");
  const plannerHeaders = { Authorization: `Bearer ${planner.accessToken}` };
  const adminHeaders = { Authorization: `Bearer ${admin.accessToken}` };

  const list = await request.get(`${api}/sites?pageSize=1&sort=score&order=desc`);
  expect(list.ok()).toBeTruthy();
  const site = (await list.json()).items[0] as { id: number; code: string };

  const createdReport = await request.post(`${api}/reports`, { headers: plannerHeaders, data: { siteId: site.id } });
  expect(createdReport.status()).toBe(201);
  const report = await createdReport.json() as { id: number; content: Record<string, unknown>; siteId: number };
  expect(report.siteId).toBe(site.id);
  expect(typeof report.content.title).toBe("string");
  expect(Array.isArray(report.content.recommendations)).toBeTruthy();
  expect(Array.isArray(report.content.risks)).toBeTruthy();
  expect(typeof report.content.consistencyRatio).toBe("number");
  expect(Number(report.content.consistencyRatio)).toBeLessThan(0.1);

  const viewerReport = await request.post(`${api}/reports`, { headers: { Authorization: `Bearer ${viewer.accessToken}` }, data: { siteId: site.id } });
  expect(viewerReport.status()).toBe(403);

  const reportsForSite = await request.get(`${api}/reports?siteId=${site.id}`, { headers: plannerHeaders });
  expect(reportsForSite.ok()).toBeTruthy();
  expect((await reportsForSite.json()).some((entry: { id: number }) => entry.id === report.id)).toBeTruthy();

  const deleted = await request.delete(`${api}/reports/${report.id}`, { headers: plannerHeaders });
  expect(deleted.ok()).toBeTruthy();
  const deletedTwice = await request.delete(`${api}/reports/${report.id}`, { headers: plannerHeaders });
  expect(deletedTwice.status()).toBe(404);
  const anonymousReports = await request.get(`${api}/reports`);
  expect(anonymousReports.status()).toBe(401);

  const csv = [
    "name,river,district,lat,lng,headM,dischargeQ40",
    "Imported Alpha,Karnali,Jumla,29.28,82.17,120,9",
    "Imported Beta,Seti,Doti,29.2,80.95,88,7.5",
    "Broken Row,Something,Nowhere,99.0,10.0,50,5",
  ].join("\n");
  const imported = await request.post(`${api}/uploads`, { headers: plannerHeaders, data: { filename: "regression.csv", content: csv } });
  expect(imported.status()).toBe(201);
  const result = await imported.json() as { rowsImported: number; errors: string[]; sites: Array<{ id: number; code: string }> };
  expect(result.rowsImported).toBe(2);
  expect(result.errors).toHaveLength(1);
  expect(result.sites.every((entry) => /^HS-\d+$/.test(entry.code))).toBeTruthy();
  try {
    const detail = await request.get(`${api}/sites/${result.sites[0].id}`);
    expect((await detail.json()).notes).toContain("regression.csv");
  } finally {
    await Promise.all(result.sites.map((entry) => request.delete(`${api}/sites/${entry.id}`, { headers: plannerHeaders })));
  }

  const invalidImport = await request.post(`${api}/uploads`, { headers: plannerHeaders, data: { filename: "bad.csv", content: "name,river\nOnly name,Karnali\n" } });
  expect(invalidImport.status()).toBe(422);
  const importFailure = await invalidImport.json() as { error: { code: string; message: string; details: string[] } };
  expect(importFailure.error.code).toBe("VALIDATION_ERROR");
  expect(Array.isArray(importFailure.error.details)).toBeTruthy();
  expect(importFailure.error.details.length).toBeGreaterThan(0);

  const viewerImport = await request.post(`${api}/uploads`, { headers: { Authorization: `Bearer ${viewer.accessToken}` }, data: { filename: "nope.csv", content: csv } });
  expect(viewerImport.status()).toBe(403);

  const uploadHistory = await request.get(`${api}/uploads`, { headers: plannerHeaders });
  expect(uploadHistory.ok()).toBeTruthy();
  expect((await uploadHistory.json()).some((entry: { filename: string }) => entry.filename === "regression.csv")).toBeTruthy();

  const adminUsers = await request.get(`${api}/users`, { headers: adminHeaders });
  expect(adminUsers.ok()).toBeTruthy();
  const members = await adminUsers.json() as Array<Record<string, unknown>>;
  expect(members.length).toBeGreaterThanOrEqual(3);
  expect(members.every((member) => !("passwordHash" in member) && !("password" in member))).toBeTruthy();
  const plannerUsers = await request.get(`${api}/users`, { headers: plannerHeaders });
  expect(plannerUsers.status()).toBe(403);
  const anonymousUsers = await request.get(`${api}/users`);
  expect(anonymousUsers.status()).toBe(401);
});

test("job history and live job data are private to the owner; viewers remain read-only", async ({ request }) => {
  const planner = await signIn(request, "planner");
  const viewer = await signIn(request, "viewer");

  const created = await request.post(`${api}/jobs`, {
    headers: { Authorization: `Bearer ${planner.accessToken}` },
    data: {
      label: "Private session ownership regression",
      lat: 27.6,
      lng: 87.3,
      bufferKm: 5,
      efficiency: 0.85,
      superResolution: false,
      environmental: true,
    },
  });
  expect(created.status()).toBe(201);
  const job = await created.json() as { id: string; status: string };
  expect(job.id).toMatch(/^job_[a-f0-9]{16}$/);
  expect(job.status).toBe("running");

  const plannerHistory = await request.get(`${api}/jobs`, {
    headers: { Authorization: `Bearer ${planner.accessToken}` },
  });
  expect(plannerHistory.ok()).toBeTruthy();
  expect((await plannerHistory.json() as Array<{ id: string }>).some((entry) => entry.id === job.id)).toBeTruthy();

  const viewerHistory = await request.get(`${api}/jobs`, {
    headers: { Authorization: `Bearer ${viewer.accessToken}` },
  });
  expect(viewerHistory.ok()).toBeTruthy();
  expect((await viewerHistory.json()).some((entry: { id: string }) => entry.id === job.id)).toBeFalsy();

  const viewerDetail = await request.get(`${api}/jobs/${job.id}`, {
    headers: { Authorization: `Bearer ${viewer.accessToken}` },
  });
  expect(viewerDetail.status()).toBe(404);
  expect((await viewerDetail.json()).error.code).toBe("JOB_NOT_FOUND");

  const viewerStream = await request.get(`${api}/jobs/${job.id}/stream?token=${encodeURIComponent(viewer.accessToken)}`);
  expect(viewerStream.status()).toBe(404);

  const viewerCancel = await request.post(`${api}/jobs/${job.id}/cancel`, {
    headers: { Authorization: `Bearer ${viewer.accessToken}` },
  });
  expect(viewerCancel.status()).toBe(403);

  const anonymousHistory = await request.get(`${api}/jobs`);
  expect(anonymousHistory.status()).toBe(401);
});
