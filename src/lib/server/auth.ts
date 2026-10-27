import "server-only";
import { and, eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getJwtSecret } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http";

export type UserRole = "admin" | "planner" | "viewer";

export interface AuthClaims {
  userId: number;
  role: UserRole;
  email: string;
  name: string;
  sessionVersion: number;
}

function secretBytes(): Uint8Array {
  // getJwtSecret() reads JWT_SECRET, or provisions a persisted random key.
  return new TextEncoder().encode(getJwtSecret());
}

function validRole(role: unknown): role is UserRole {
  return role === "admin" || role === "planner" || role === "viewer";
}

export async function createAccessToken(claims: AuthClaims): Promise<string> {
  return new SignJWT({
    userId: claims.userId,
    role: claims.role,
    email: claims.email,
    name: claims.name,
    sessionVersion: claims.sessionVersion,
    tokenType: "access",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secretBytes());
}

export async function createRefreshToken(claims: AuthClaims): Promise<string> {
  return new SignJWT({
    userId: claims.userId,
    role: claims.role,
    email: claims.email,
    name: claims.name,
    sessionVersion: claims.sessionVersion,
    tokenType: "refresh",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretBytes());
}

async function verifyToken(token: string, tokenType: "access" | "refresh"): Promise<AuthClaims> {
  try {
    const { payload } = await jwtVerify(token, secretBytes(), { algorithms: ["HS256"] });
    if (
      payload.tokenType !== tokenType ||
      typeof payload.userId !== "number" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.sessionVersion !== "number" ||
      !Number.isSafeInteger(payload.sessionVersion) ||
      !validRole(payload.role)
    ) {
      throw new Error("Token claims are invalid");
    }
    return {
      userId: payload.userId,
      role: payload.role,
      email: payload.email,
      name: payload.name,
      sessionVersion: payload.sessionVersion,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      401,
      tokenType === "access" ? "TOKEN_INVALID" : "REFRESH_INVALID",
      tokenType === "access"
        ? "Your session has expired. Please sign in again."
        : "Your refresh session has expired. Please sign in again.",
    );
  }
}

export function readAccessToken(token: string): Promise<AuthClaims> {
  return verifyToken(token, "access");
}

export function readRefreshToken(token: string): Promise<AuthClaims> {
  return verifyToken(token, "refresh");
}

async function validateSession(claims: AuthClaims, allowed: readonly UserRole[]): Promise<AuthClaims> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, claims.userId))
    .limit(1);

  if (
    !user ||
    user.email !== claims.email ||
    user.sessionVersion !== claims.sessionVersion ||
    !validRole(user.role)
  ) {
    throw new ApiError(401, "TOKEN_INVALID", "This session is no longer active. Please sign in again.");
  }

  const currentClaims: AuthClaims = {
    userId: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    sessionVersion: user.sessionVersion,
  };
  if (!allowed.includes(currentClaims.role)) {
    throw new ApiError(403, "FORBIDDEN", "Your account does not have permission to perform this action.");
  }
  return currentClaims;
}

export async function requireTokenRole(token: string, allowed: readonly UserRole[]): Promise<AuthClaims> {
  return validateSession(await readAccessToken(token), allowed);
}

export async function requireRole(request: Request, allowed: readonly UserRole[]): Promise<AuthClaims> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return requireTokenRole(token, allowed);
}
