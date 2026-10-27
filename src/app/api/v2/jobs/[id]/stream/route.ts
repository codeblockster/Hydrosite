import { getJobById } from "@/lib/server/data";
import { requireTokenRole } from "@/lib/server/auth";
import { ApiError, route } from "@/lib/server/http";

const encoder = new TextEncoder();
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return route(request, async () => {
    const { id } = await context.params;
    if (!/^job_[a-f0-9]{16}$/i.test(id)) throw new ApiError(400, "BAD_PARAM", "The analysis id is invalid.");
    const token = new URL(request.url).searchParams.get("token");
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "A valid stream token is required.");
    const claims = await requireTokenRole(token, ["admin", "planner", "viewer"]);
    const initial = await getJobById(id, claims);
    if (!initial) throw new ApiError(404, "JOB_NOT_FOUND", "That analysis job could not be found.");

    let stopStream: () => void = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let closed = false;
        let previousStep = "";
        let previousLogCount = -1;
        const send = (event: string, value: unknown) => {
          if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
        };
        const close = () => {
          if (closed) return;
          closed = true;
          if (timer) clearTimeout(timer);
          controller.close();
        };
        send("job:started", initial);

        const tick = async () => {
          if (closed) return;
          try {
            const activeClaims = await requireTokenRole(token, ["admin", "planner", "viewer"]);
            const snapshot = await getJobById(id, activeClaims);
            if (!snapshot) {
              send("job:failed", { id, message: "Job not found" });
              close();
              return;
            }
            if (snapshot.currentStep !== previousStep) {
              previousStep = snapshot.currentStep;
              send("job:step", { id, step: snapshot.currentStep, steps: snapshot.steps });
            }
            if (snapshot.logs.length !== previousLogCount) {
              previousLogCount = snapshot.logs.length;
              send("job:log", { id, logs: snapshot.logs });
            }
            send("job:progress", snapshot);
            if (snapshot.status === "completed") {
              send("job:completed", snapshot);
              close();
              return;
            }
            if (snapshot.status === "failed" || snapshot.status === "cancelled") {
              send(snapshot.status === "failed" ? "job:failed" : "job:cancelled", snapshot);
              close();
              return;
            }
            timer = setTimeout(() => void tick(), 700);
          } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
              send("end", { id, code: error.code, message: "This session is no longer active." });
              close();
              return;
            }
            send("transport:fallback", { id, message: "Live updates paused; reconnecting." });
            timer = setTimeout(() => void tick(), 1600);
          }
        };
        timer = setTimeout(() => void tick(), 700);
        stopStream = () => {
          closed = true;
          if (timer) clearTimeout(timer);
        };
      },
      cancel() {
        stopStream();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
