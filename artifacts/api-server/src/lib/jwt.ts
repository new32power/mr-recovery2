import jwt from "jsonwebtoken";

function getSecret(): string {
  const s = process.env["JWT_SECRET"];
  if (!s) throw new Error("JWT_SECRET env var is not set");
  return s;
}

export interface MasterPayload {
  role: "master";
  sessionId: string;
  iat?: number;
  exp?: number;
}

export function signMasterToken(sessionId: string, expiresIn = "8h"): string {
  return jwt.sign(
    { role: "master", sessionId } as MasterPayload,
    getSecret(),
    { expiresIn } as jwt.SignOptions
  );
}

export function verifyMasterToken(token: string): MasterPayload {
  return jwt.verify(token, getSecret()) as MasterPayload;
}
