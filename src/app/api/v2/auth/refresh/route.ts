import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createAccessToken, createRefreshToken, readRefreshToken } from "@/lib/server/auth";
import { ensureBootstrap } from "@/lib/server/bootstrap";
import { ApiError, readJson, route } from "@/lib/server/http";

const refreshSchema = z.object({ refreshToken: z.string().min(20) }).strict();

export function POST(request: Request): Promise<Response> {
  return route(request, async () => {
    const { refreshToken } = await readJson(request, refreshSchema);
    const claims = await readRefreshToken(refreshToken);
    await ensureBootstrap();

    const [rotatedUser] = await db.update(users)
      .set({ sessionVersion: claims.sessionVersion + 1 })
      .where(and(
        eq(users.id, claims.userId),
        eq(users.email, claims.email),
        eq(users.sessionVersion, claims.sessionVersion),
      ))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        sessionVersion: users.sessionVersion,
      });

    if (!rotatedUser || (rotatedUser.role !== "admin" && rotatedUser.role !== "planner" && rotatedUser.role !== "viewer")) {
      throw new ApiError(401, "REFRESH_INVALID", "This refresh token has already been used or revoked. Sign in again.");
    }

    const currentClaims = {
      userId: rotatedUser.id,
      role: rotatedUser.role,
      email: rotatedUser.email,
      name: rotatedUser.name,
      sessionVersion: rotatedUser.sessionVersion,
    } as const;
    return Response.json({
      accessToken: await createAccessToken(currentClaims),
      refreshToken: await createRefreshToken(currentClaims),
    });
  });
}
