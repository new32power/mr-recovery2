import { Router, type IRouter } from "express";
import { DEFAULT_APP_ID, localDb } from "../lib/local-db";
import { verifyPin } from "../lib/hash";
import { requireJwt } from "../middlewares/requireJwt";

const router: IRouter = Router();
const VALIDITY_DAYS = 30;

function stripPin<T extends { pin?: unknown; deleteProtectionPin?: unknown }>(obj: T): Omit<T, "pin" | "deleteProtectionPin"> {
  const { pin: _pin, deleteProtectionPin: _dp, ...rest } = obj;
  return rest as Omit<T, "pin" | "deleteProtectionPin">;
}

function isExpired(createdAt: string | Date): boolean {
  const created = new Date(createdAt).getTime();
  const expiry = created + VALIDITY_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() > expiry;
}

async function autoDisableIfExpired(appId: string): Promise<void> {
  const app = await localDb.getApp(appId);
  if (app?.appId === DEFAULT_APP_ID) {
    await localDb.updateApp(appId, { status: "active" });
    return;
  }
  if (app && app.status === "active" && isExpired(app.createdAt)) {
    await localDb.updateApp(appId, { status: "disabled" });
  }
}

/* ── JWT protected — admin only ── */
router.get("/apps", requireJwt, async (_req, res) => {
  const rows = await localDb.listApps();
  for (const app of rows) {
    if (app.appId === DEFAULT_APP_ID) {
      await localDb.updateApp(app.appId, { status: "active" });
    } else if (app.status === "active" && isExpired(app.createdAt)) {
      await localDb.updateApp(app.appId, { status: "disabled" });
    }
  }
  res.json((await localDb.listApps()).map(stripPin));
});

/* ── OPEN — Android app checks its own appId ── */
router.get("/apps/:appId", async (req, res) => {
  await autoDisableIfExpired(req.params.appId);
  const app = await localDb.getApp(req.params.appId);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  res.json(stripPin(app));
});

router.post("/apps", requireJwt, async (req, res) => {
  const { appId, name, pin, status } = req.body as { appId?: string; name?: string; pin?: string; status?: string };
  if (!appId || !name) { res.status(400).json({ error: "appId and name are required" }); return; }
  if (!["MR ROBOT", "ZERO TRACE"].includes(name.trim())) { res.status(400).json({ error: "App name must be 'MR ROBOT' or 'ZERO TRACE'" }); return; }
  try {
    const row = await localDb.createApp({ appId, name: name.trim(), pin, status });
    res.status(201).json(stripPin(row));
  } catch (err) {
    if ((err as Error).message === "APP_EXISTS") { res.status(409).json({ error: "App ID already exists" }); return; }
    throw err;
  }
});

router.patch("/apps/:appId", requireJwt, async (req, res) => {
  const { name, pin, status } = req.body as { name?: string; pin?: string; status?: string };
  const updates: { name?: string; pin?: string; status?: string } = {};
  if (name !== undefined) updates.name = name;
  if (pin !== undefined) updates.pin = pin;
  if (status !== undefined) updates.status = status;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const row = await localDb.updateApp(req.params.appId, updates);
  if (!row) { res.status(404).json({ error: "App not found" }); return; }
  res.json(stripPin(row));
});

router.delete("/apps/:appId", requireJwt, async (req, res) => {
  const row = await localDb.deleteApp(req.params.appId);
  if (!row) { res.status(404).json({ error: "App not found" }); return; }
  res.json({ ok: true });
});

/* ── OPEN — Android app verifies its PIN ── */
router.post("/apps/:appId/verify-pin", async (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin) { res.status(400).json({ error: "PIN required" }); return; }
  await autoDisableIfExpired(req.params.appId);
  const app = await localDb.getApp(req.params.appId);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  if (app.status !== "active") { res.status(403).json({ error: "App is disabled" }); return; }
  const verified = await localDb.verifyAppPin(req.params.appId, pin);
  if (!verified) { res.status(401).json({ error: "Wrong PIN" }); return; }
  res.json({ ok: true, appId: verified.appId, name: verified.name });
});

/* ── Delete Protection — JWT required ── */
router.get("/apps/:appId/delete-protection", requireJwt, async (req, res) => {
  const app = await localDb.getApp(req.params.appId);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  res.json({ enabled: app.deleteProtectionEnabled, hasPin: !!app.deleteProtectionPin });
});

router.post("/apps/:appId/delete-protection/set-pin", requireJwt, async (req, res) => {
  const { pin, currentPin } = req.body as { pin?: string; currentPin?: string };
  if (!pin || pin.length < 4) { res.status(400).json({ error: "pin required (min 4 chars)" }); return; }
  const app = await localDb.getApp(req.params.appId);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  if (app.deleteProtectionPin) {
    if (!currentPin) { res.status(403).json({ error: "currentPin required to change" }); return; }
    if (!verifyPin(currentPin, app.deleteProtectionPin)) { res.status(401).json({ error: "Wrong current pin" }); return; }
  }
  await localDb.updateApp(req.params.appId, { deleteProtectionPin: pin });
  res.json({ ok: true });
});

router.post("/apps/:appId/delete-protection/toggle", requireJwt, async (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin) { res.status(400).json({ error: "pin required" }); return; }
  const app = await localDb.getApp(req.params.appId);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  if (!app.deleteProtectionPin) { res.status(403).json({ error: "Set a delete protection pin first" }); return; }
  if (!verifyPin(pin, app.deleteProtectionPin)) { res.status(401).json({ error: "Wrong pin" }); return; }
  const newEnabled = !app.deleteProtectionEnabled;
  await localDb.updateApp(req.params.appId, { deleteProtectionEnabled: newEnabled });
  res.json({ ok: true, enabled: newEnabled });
});

router.post("/apps/:appId/regenerate-token", requireJwt, async (req, res) => {
  const appId = String(req.params.appId ?? "");
  const app = await localDb.getApp(appId);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  const { randomUUID } = await import("node:crypto");
  const newToken = randomUUID();
  await localDb.updateApp(appId, { panelToken: newToken });
  res.json({ ok: true, panelToken: newToken });
});

export default router;
