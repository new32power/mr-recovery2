/**
 * EventBus Durable Object Worker
 *
 * This Worker exists only to host the EventBus Durable Object class so the
 * Pages project can bind to it (Cloudflare Pages cannot host DO classes
 * directly — they must live inside a regular Worker).
 *
 * The Worker itself has no public routes. All interaction happens through
 * the Durable Object binding from the Pages project.
 */

export interface Env {
  EVENT_BUS: DurableObjectNamespace;
}

export class EventBus {
  state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for live clients
    if (url.pathname === "/ws") {
      const upgrade = request.headers.get("Upgrade");
      if (upgrade !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.state.acceptWebSocket(server);
      try {
        server.send(JSON.stringify({ event: "ping", data: { t: Date.now() } }));
      } catch {}
      return new Response(null, { status: 101, webSocket: client });
    }

    // Broadcast event to all connected sockets
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const body = (await request.json()) as { event: string; data: unknown };
      const payload = JSON.stringify(body);
      const sockets = this.state.getWebSockets();
      for (const ws of sockets) {
        try {
          ws.send(payload);
        } catch {
          try {
            ws.close(1011, "send error");
          } catch {}
        }
      }
      return new Response(
        JSON.stringify({ ok: true, clients: sockets.length }),
        { headers: { "content-type": "application/json" } },
      );
    }

    return new Response("Not found", { status: 404 });
  }

  // Hibernation API callbacks — required so DO can sleep and reload sockets
  async webSocketMessage(
    _ws: WebSocket,
    _msg: string | ArrayBuffer,
  ): Promise<void> {
    // No inbound messages expected from clients
  }
  async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    try {
      ws.close(code, "closed");
    } catch {}
  }
  async webSocketError(ws: WebSocket, _err: unknown): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {}
  }
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response("EventBus Worker — internal only", { status: 404 });
  },
};
