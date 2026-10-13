import type { Request, Response, NextFunction } from "express";
import { verifyMasterToken } from "../lib/jwt";
import { pool } from "../lib/db";

export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization header missing or invalid" });
    return;
  }
  const token = auth.slice(7);

  let payload: ReturnType<typeof verifyMasterToken>;
  try {
    payload = verifyMasterToken(token);
    if (payload.role !== "master") {
      res.status(403).json({ error: "Forbidden: insufficient role" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Session DB mein exist karti hai ya nahi — agar logout ho chuka hai toh reject
  const sessionId = payload.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Token missing session — please login again" });
    return;
  }

  pool.query<{ id: string }>(
    `SELECT id FROM master_sessions WHERE id = $1`,
    [sessionId]
  ).then(result => {
    if (result.rows.length === 0) {
      res.status(401).json({ error: "Session revoked — please login again" });
      return;
    }
    (req as Request & { masterSessionId?: string }).masterSessionId = sessionId;
    next();
  }).catch(() => {
    // DB error pe allow karo — session check fail hone pe block mat karo
    next();
  });
}
