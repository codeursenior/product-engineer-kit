import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export function localRequest(req: IncomingMessage, host: string): boolean {
  return (
    req.headers.host === host &&
    (!req.headers.origin || req.headers.origin === `http://${host}`)
  );
}
export function authenticated(req: IncomingMessage, token: string): boolean {
  const provided = Buffer.from(
    req.headers.authorization?.replace(/^Bearer /, "") || "",
  );
  const expected = Buffer.from(token);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
export function securityHeaders(res: ServerResponse, nonce: string): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  );
}
