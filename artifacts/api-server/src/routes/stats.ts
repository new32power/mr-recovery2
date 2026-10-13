import { Router, type IRouter } from "express";
import { localDb } from "../lib/local-db";

const router: IRouter = Router();

router.get("/stats", async (req, res) => {
  res.json(await localDb.stats(req.query.appId ? String(req.query.appId) : undefined));
});

export default router;
