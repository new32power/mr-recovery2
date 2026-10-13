import type { Response } from "express";
import type { WebSocket } from "ws";

const sseClients = new Set<Response>();
const wsClients = new Set<WebSocket>();
const masterSseClients = new Set<Response>();

// ── Cloudflare recovery2 live broadcast ──────────────────────────────────────
// After every DB write, Render API pushes the event to CF recovery2 dashboard
// via this endpoint so WebSocket clients get instant updates (0ms polling).
const CF_BROADCAST_URL =
  process.env.CF_BROADCAST_URL ??
  "https://recovery2-32s.pages.dev/api/internal/broadcast";
const CF_API_SECRET = process.env.API_SECRET ?? "";

function cfBroadcast(event: string, data: unknown): void {
  if (!CF_BROADCAST_URL || !CF_API_SECRET) return;
  // Fire-and-forget — never block the caller
  fetch(CF_BROADCAST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": CF_API_SECRET,
    },
    body: JSON.stringify({ event, data }),
  }).catch(() => {});
}
// ─────────────────────────────────────────────────────────────────────────────

export function sseSubscribe(res: Response): void {
  sseClients.add(res);
}

export function sseUnsubscribe(res: Response): void {
  sseClients.delete(res);
}

export function masterSseSubscribe(res: Response): void {
  masterSseClients.add(res);
}

export function masterSseUnsubscribe(res: Response): void {
  masterSseClients.delete(res);
}

export function wsSubscribe(ws: WebSocket): void {
  wsClients.add(ws);
}

export function wsUnsubscribe(ws: WebSocket): void {
  wsClients.delete(ws);
}

export function sseEmit(event: string, data: unknown): void {
  const ssePayload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(ssePayload);
    } catch {
      sseClients.delete(client);
    }
  }

  const wsPayload = JSON.stringify({ event, data });
  for (const ws of wsClients) {
    try {
      ws.send(wsPayload);
    } catch {
      wsClients.delete(ws);
    }
  }

  // Push to Cloudflare recovery2 dashboard WebSocket clients instantly
  cfBroadcast(event, data);
}
