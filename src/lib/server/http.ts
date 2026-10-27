import "server-only";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RouteHandler = (requestId: string) => Promise<Response>;

export async function route(request: Request, handler: RouteHandler): Promise<Response> {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const startedAt = performance.now();
  try {
    const response = await handler(requestId);
    response.headers.set("x-request-id", requestId);
    if (!response.headers.has("cache-control")) response.headers.set("cache-control", "no-store");
    console.info(JSON.stringify({
      level: "info",
      event: "http.request",
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return response;
  } catch (error) {
    const normalized = error instanceof ApiError
      ? error
      : error instanceof ZodError
        ? new ApiError(422, "VALIDATION_ERROR", "The request did not match the expected format.", error.issues)
        : error instanceof SyntaxError
          ? new ApiError(400, "BAD_JSON", "The request body contains invalid JSON.")
          : new ApiError(500, "INTERNAL", "Something went wrong while processing the request.");
    if (normalized.status >= 500) {
      console.error(JSON.stringify({
        level: "error",
        event: "http.error",
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        message: error instanceof Error ? error.message : "Unknown error",
      }));
    }
    return Response.json({
      error: {
        status: normalized.status,
        code: normalized.code,
        message: normalized.message,
        details: normalized.details ?? null,
      },
    }, {
      status: normalized.status,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  }
}

export async function readJson<T>(request: Request, schema: { parse: (value: unknown) => T }): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_JSON", "The request body contains invalid JSON.");
  }
  return schema.parse(body);
}
