const MIN_SPACING_MS = 30 * 60 * 1000;
const MAX_MANUAL_RERUNS = 3;

interface LockState {
  lockUntil: number;
  manualRunTimestamps: number[];
}

export class IngestLock {
  constructor(private readonly state: DurableObjectState) {}

  private async readState(): Promise<LockState> {
    const stored = await this.state.storage.get<LockState>("state");
    return stored ?? { lockUntil: 0, manualRunTimestamps: [] };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (url.pathname === "/acquire") {
      const now = Date.now();
      const body = (await request.json().catch(() => ({}))) as { trigger_type?: string };
      const triggerType = body.trigger_type ?? "scheduled";
      const current = await this.readState();

      if (current.lockUntil > now) {
        return Response.json({ ok: false, reason: "locked" }, { status: 409 });
      }

      let manualRunTimestamps = current.manualRunTimestamps.filter((ts) => now - ts < 24 * 60 * 60 * 1000);
      if (triggerType === "manual") {
        if (manualRunTimestamps.length >= MAX_MANUAL_RERUNS) {
          return Response.json({ ok: false, reason: "manual_rerun_limit" }, { status: 429 });
        }
        const latest = manualRunTimestamps[manualRunTimestamps.length - 1] ?? 0;
        if (latest && now - latest < MIN_SPACING_MS) {
          return Response.json({ ok: false, reason: "manual_rerun_spacing" }, { status: 429 });
        }
        manualRunTimestamps.push(now);
      }

      const next: LockState = {
        lockUntil: now + 10 * 60 * 1000,
        manualRunTimestamps,
      };
      await this.state.storage.put("state", next);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/release") {
      const current = await this.readState();
      await this.state.storage.put("state", { ...current, lockUntil: 0 });
      return Response.json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }
}
