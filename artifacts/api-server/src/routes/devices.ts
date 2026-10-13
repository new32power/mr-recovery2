import { Router, type IRouter } from "express";
import { localDb, type DeviceRow } from "../lib/local-db";
import { sseEmit } from "../lib/sse";

const router: IRouter = Router();

router.get("/devices", async (req, res) => {
  const { userId, appId } = req.query;
  const rows = await localDb.listDevices({
    appId: appId ? String(appId) : undefined,
    userId: !appId && userId ? String(userId) : undefined,
  });
  res.json(rows);
});

router.get("/devices/:deviceId", async (req, res) => {
  const device = await localDb.getDevice(req.params.deviceId);
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(device);
});

router.patch("/devices/:deviceId", async (req, res) => {
  const { status, lastOnline, fcmToken, forwardEnabled, forwardSlot } = req.body as Record<string, unknown>;
  const updates: Partial<DeviceRow> = {};
  if (status !== undefined) updates.status = String(status);
  if (lastOnline !== undefined) updates.lastOnline = String(lastOnline);
  if (fcmToken !== undefined) updates.fcmToken = String(fcmToken);
  if (forwardEnabled !== undefined) updates.forwardEnabled = Boolean(forwardEnabled);
  if (forwardSlot !== undefined) updates.forwardSlot = forwardSlot === null ? null : Number(forwardSlot);
  const updated = await localDb.updateDevice(req.params.deviceId, updates);
  if (!updated) { res.status(404).json({ error: "Device not found" }); return; }
  // SSE — dashboard ko live update bhejo
  sseEmit("device_updated", { ...updated });
  res.json(updated);
});

router.delete("/devices/:deviceId", async (req, res) => {
  const row = await localDb.deleteDevice(req.params.deviceId);
  if (!row) { res.status(404).json({ error: "Device not found" }); return; }
  // Emit SSE so all connected dashboards remove this device instantly
  sseEmit("device_deleted", { appId: row.appId, deviceId: row.deviceId });
  res.json({ ok: true });
});

export default router;
