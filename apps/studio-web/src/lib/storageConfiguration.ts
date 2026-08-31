const LOOPBACK_OR_PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/i;

export function objectStorageEndpointUsable(endpoint: string | undefined, production: boolean): boolean {
  if (!endpoint) return true; // AWS S3 can use the SDK's regional endpoint.
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!production) return true;
    return url.protocol === "https:" && !LOOPBACK_OR_PRIVATE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}
