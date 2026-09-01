import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { objectStorageEndpointUsable } from "./storageConfiguration";

export const AFRIHOST_UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

export type AfrihostStorageConfiguration = {
  endpoint: string;
  secret: string;
};

type AfrihostResponse<T> = {
  success: boolean;
  data?: T;
  code?: string;
  message?: string;
};

export function afrihostStorageConfiguration(): AfrihostStorageConfiguration | null {
  const endpoint = process.env.AFRIHOST_PRIVATE_STORAGE_URL?.trim().replace(/\/$/, "");
  const secret = process.env.AFRIHOST_PRIVATE_STORAGE_SECRET?.trim();
  if (!endpoint || !secret || secret.length < 32) return null;
  if (!objectStorageEndpointUsable(endpoint, process.env.NODE_ENV === "production")) return null;
  return { endpoint, secret };
}

export function afrihostStorageCanonicalRequest(input: {
  method: string;
  action: string;
  timestamp: string;
  nonce: string;
  objectKey: string;
  bodySha256: string;
}) {
  return [input.method.toUpperCase(), input.action, input.timestamp, input.nonce, input.objectKey, input.bodySha256].join("\n");
}

function bodyHash(body?: Uint8Array) {
  return createHash("sha256").update(body ?? new Uint8Array()).digest("hex");
}

async function request<T>(input: {
  action: string;
  objectKey: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Uint8Array;
  headers?: Record<string, string>;
}): Promise<T> {
  const config = afrihostStorageConfiguration();
  if (!config) throw new Error("Afrihost private storage is not configured.");
  const method = input.method ?? "POST";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const bodySha256 = bodyHash(input.body);
  const signature = createHmac("sha256", config.secret).update(afrihostStorageCanonicalRequest({
    method,
    action: input.action,
    timestamp,
    nonce,
    objectKey: input.objectKey,
    bodySha256,
  })).digest("hex");
  const url = new URL(config.endpoint);
  url.searchParams.set("action", input.action);
  url.searchParams.set("object_key", input.objectKey);
  const response = await fetch(url, {
    method,
    headers: {
      "x-vowhumans-storage-timestamp": timestamp,
      "x-vowhumans-storage-nonce": nonce,
      "x-vowhumans-storage-body-sha256": bodySha256,
      "x-vowhumans-storage-signature": signature,
      ...input.headers,
    },
    ...(input.body ? { body: Buffer.from(input.body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => null) as AfrihostResponse<T> | null;
  if (!response.ok || !payload?.success || payload.data === undefined) {
    const code = payload?.code && /^[A-Z0-9_]{3,64}$/.test(payload.code) ? payload.code : `HTTP_${response.status}`;
    throw new Error(`Afrihost private storage rejected the request (${code}).`);
  }
  return payload.data;
}

export async function putAfrihostObject(input: {
  objectKey: string;
  contentType: string;
  classification: "biometric-capture" | "biometric-derived";
  sha256: string;
  body: Uint8Array;
}) {
  await request<{ stored: true }>({
    action: "put",
    objectKey: input.objectKey,
    method: "PUT",
    body: input.body,
    headers: {
      "content-type": input.contentType,
      "x-vowhumans-object-sha256": input.sha256,
      "x-vowhumans-object-bytes": input.body.byteLength.toString(),
      "x-vowhumans-classification": input.classification,
    },
  });
}

export async function putAfrihostObjectPart(input: {
  objectKey: string;
  contentType: string;
  classification: "biometric-capture";
  partNumber: number;
  totalParts: number;
  partSha256: string;
  body: Uint8Array;
}) {
  await request<{ stored: true }>({
    action: "put-part",
    objectKey: input.objectKey,
    method: "PUT",
    body: input.body,
    headers: {
      "content-type": input.contentType,
      "x-vowhumans-part-number": input.partNumber.toString(),
      "x-vowhumans-total-parts": input.totalParts.toString(),
      "x-vowhumans-part-sha256": input.partSha256,
      "x-vowhumans-classification": input.classification,
    },
  });
}

export async function completeAfrihostObject(input: {
  objectKey: string;
  contentType: string;
  classification: "biometric-capture";
  totalParts: number;
  byteSize: number;
  sha256: string;
}) {
  await request<{ completed: true }>({
    action: "complete",
    objectKey: input.objectKey,
    headers: {
      "x-vowhumans-total-parts": input.totalParts.toString(),
      "x-vowhumans-object-bytes": input.byteSize.toString(),
      "x-vowhumans-object-sha256": input.sha256,
      "x-vowhumans-content-type": input.contentType,
      "x-vowhumans-classification": input.classification,
    },
  });
}

export async function headAfrihostObject(objectKey: string) {
  return request<{ byte_size: number; sha256: string; content_type: string }>({ action: "head", objectKey });
}

export async function createAfrihostDownload(objectKey: string) {
  const config = afrihostStorageConfiguration();
  if (!config) throw new Error("Afrihost private storage is not configured.");
  const result = await request<{ url: string }>({ action: "download-token", objectKey });
  const downloadUrl = new URL(result.url);
  const endpointUrl = new URL(config.endpoint);
  if (downloadUrl.protocol !== "https:" || downloadUrl.origin !== endpointUrl.origin) {
    throw new Error("Afrihost private storage returned an invalid download URL.");
  }
  return downloadUrl.toString();
}
