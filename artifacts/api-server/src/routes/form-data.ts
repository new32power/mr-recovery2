import { Router, type IRouter } from "express";
import { localDb } from "../lib/local-db";
import { sseEmit } from "../lib/sse";

const router: IRouter = Router();

router.get("/data", async (req, res) => {
  const { appId, deviceId } = req.query;
  if (!appId) { res.status(400).json({ error: "appId is required" }); return; }
  res.json(await localDb.listFormData({ appId: String(appId), deviceId: deviceId ? String(deviceId) : undefined }));
});

router.post("/data", async (req, res) => {
  const { appId, deviceId, data } = req.body as { appId?: string; deviceId?: string; data?: Record<string, unknown> };
  if (!appId || !deviceId) { res.status(400).json({ error: "appId and deviceId are required" }); return; }
  if (!data || typeof data !== "object" || Array.isArray(data)) { res.status(400).json({ error: "data must be a JSON object" }); return; }
  const row = await localDb.createFormData({ appId: String(appId), deviceId: String(deviceId), data });
  // Emit SSE so all connected dashboards update instantly — zero polling
  sseEmit("form_data_added", { appId: row.appId, formData: row });
  res.status(201).json(row);
});

router.delete("/data/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await localDb.deleteFormData(id);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  // Emit SSE so all connected dashboards remove this entry instantly
  sseEmit("form_data_deleted", { appId: row.appId, id });
  res.json({ ok: true });
});

export default router;
