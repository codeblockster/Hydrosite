import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { loginSchema } from "@/api/schemas";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createAccessToken, createRefreshToken } from "@/lib/server/auth";
import { ensureBootstrap } from "@/lib/server/bootstrap";
import { ApiError, readJson, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();
let dummyPasswordHash: Promise<string> | null = null;

function timingOnlyPasswordHash(): Promise<string> {
  if (!dummyPasswordHash) dummyPasswordHash = hash("hydrosite-invalid-user-timing-only", 10);
  return dummyPasswordHash;
}

function pruneAttempts(now: number): void {
  for (const [address, state] of attempts) {
    if (state.resetAt <= now) attempts.delete(address);
  }
  if (attempts.size > 10_000) attempts.clear();
}

export function POST(request: Request): Promise<Response> {
  return route(request, async () => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const now = Date.now();
    pruneAttempts(now);
    const previous = attempts.get(ip);
    const limit = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + 60_000 };
    if (limit.count >= 10) throw new ApiError(429, "RATE_LIMITED", "Too many sign-in attempts. Wait a minute and try again.");
    limit.count += 1;
    attempts.set(ip, limit);

    const input = await readJson(request, loginSchema);
    await ensureBootstrap();
    const [user] = await db.select().from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
    const passwordHash = user?.passwordHash ?? await timingOnlyPasswordHash();
    const passwordMatches = await compare(input.password, passwordHash);
    if (!user || !passwordMatches) {
      throw new ApiError(401, "UNAUTHENTICATED", "That email and password combination was not recognized.");
    }
    const claims = {
      userId: user.id,
      role: user.role as "admin" | "planner" | "viewer",
      email: user.email,
      name: user.name,
      sessionVersion: user.sessionVersion,
    };
    const accessToken = await createAccessToken(claims);
    const refreshToken = await createRefreshToken(claims);
    attempts.delete(ip);
    return Response.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, organization: user.organization },
    });
  });
}
