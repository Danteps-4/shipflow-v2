import { SignJWT, jwtVerify } from "jose";

const secret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ?? "fallback-dev-secret-change-in-production"
  );

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "sf_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 días
