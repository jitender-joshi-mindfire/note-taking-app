const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

export function buildShareUrl(token: string): string {
  return `${APP_BASE_URL}/api/share/${token}`;
}
