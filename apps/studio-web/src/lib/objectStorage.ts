import "server-only";

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  AFRIHOST_UPLOAD_CHUNK_BYTES,
  afrihostStorageConfiguration,
  completeAfrihostObject,
  createAfrihostDownload,
  headAfrihostObject,
  putAfrihostObject,
  putAfrihostObjectPart,
} from "./afrihostStorage";
import { objectStorageEndpointUsable } from "./storageConfiguration";

type StorageConfiguration = {
  endpoint?: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type ReplicaObjectInput = {
  organisationId: string;
  profileId: string;
  captureSessionId: string;
  segmentId: string;
  extension: string;
};

type PrivateStorageConfiguration =
  | { provider: "s3"; value: StorageConfiguration }
  | { provider: "afrihost"; value: NonNullable<ReturnType<typeof afrihostStorageConfiguration>> };

function s3Configuration(): StorageConfiguration | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY?.trim();
  const secretAccessKey = process.env.S3_SECRET_KEY?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  if (!bucket || !accessKeyId || !secretAccessKey || !objectStorageEndpointUsable(endpoint, process.env.NODE_ENV === "production")) return null;
  return {
    endpoint,
    bucket,
    region: process.env.S3_REGION?.trim() || "af-south-1",
    accessKeyId,
    secretAccessKey,
  };
}

function configuration(): PrivateStorageConfiguration | null {
  const provider = process.env.PRIVATE_STORAGE_PROVIDER?.trim().toLowerCase() || "s3";
  if (provider === "afrihost") {
    const value = afrihostStorageConfiguration();
    return value ? { provider, value } : null;
  }
  if (provider !== "s3") return null;
  const value = s3Configuration();
  return value ? { provider, value } : null;
}

function client(config: StorageConfiguration) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export function privateObjectStorageConfigured(): boolean {
  return configuration() !== null;
}

export const PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES = AFRIHOST_UPLOAD_CHUNK_BYTES;

export function privateObjectStorageProvider(): "s3" | "afrihost" | null {
  return configuration()?.provider ?? null;
}

export function privateReplicaObjectKey(input: ReplicaObjectInput): string {
  return [
    "organisations", input.organisationId, "replicas", input.profileId,
    "captures", input.captureSessionId, `${input.segmentId}.${input.extension}`,
  ].join("/");
}

export async function createPrivateReplicaUpload(input: {
  organisationId: string;
  profileId: string;
  captureSessionId: string;
  segmentId: string;
  extension: string;
  contentType: string;
  sha256: string;
}) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  if (config.provider !== "s3") throw new Error("Afrihost private storage uses authenticated same-origin uploads.");
  const objectKey = privateReplicaObjectKey(input);
  const command = new PutObjectCommand({
    Bucket: config.value.bucket,
    Key: objectKey,
    ContentType: input.contentType,
    Metadata: { sha256: input.sha256, classification: "biometric-capture" },
  });
  return {
    objectKey,
    uploadUrl: await getSignedUrl(client(config.value), command, { expiresIn: 15 * 60 }),
    requiredHeaders: {
      "content-type": input.contentType,
      "x-amz-meta-sha256": input.sha256,
      "x-amz-meta-classification": "biometric-capture",
    },
    expiresInSeconds: 15 * 60,
  };
}

export async function storePrivateReplicaCapture(input: {
  objectKey: string;
  contentType: string;
  sha256: string;
  body: Uint8Array;
}) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  if (config.provider === "afrihost") {
    await putAfrihostObject({ ...input, classification: "biometric-capture" });
    return;
  }
  await client(config.value).send(new PutObjectCommand({
    Bucket: config.value.bucket,
    Key: input.objectKey,
    Body: input.body,
    ContentLength: input.body.byteLength,
    ContentType: input.contentType,
    Metadata: { sha256: input.sha256, classification: "biometric-capture" },
  }));
}

export async function storePrivateReplicaCapturePart(input: {
  objectKey: string;
  contentType: string;
  partNumber: number;
  totalParts: number;
  partSha256: string;
  body: Uint8Array;
}) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  if (config.provider !== "afrihost") throw new Error("Chunked uploads are only used by Afrihost private storage.");
  await putAfrihostObjectPart({ ...input, classification: "biometric-capture" });
}

export async function completePrivateReplicaCapture(input: {
  objectKey: string;
  contentType: string;
  totalParts: number;
  byteSize: number;
  sha256: string;
}) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  if (config.provider !== "afrihost") return;
  await completeAfrihostObject({ ...input, classification: "biometric-capture" });
}

export async function verifyPrivateReplicaObject(objectKey: string, expectedBytes: number, expectedSha256: string) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  if (config.provider === "afrihost") {
    const result = await headAfrihostObject(objectKey);
    return {
      byteSizeMatches: result.byte_size === expectedBytes,
      sha256Matches: result.sha256 === expectedSha256,
      contentType: result.content_type,
    };
  }
  const result = await client(config.value).send(new HeadObjectCommand({ Bucket: config.value.bucket, Key: objectKey }));
  return {
    byteSizeMatches: result.ContentLength === expectedBytes,
    sha256Matches: result.Metadata?.sha256 === expectedSha256,
    contentType: result.ContentType ?? null,
  };
}

export async function createPrivateReplicaDownload(objectKey: string) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  if (config.provider === "afrihost") return createAfrihostDownload(objectKey);
  return getSignedUrl(client(config.value), new GetObjectCommand({ Bucket: config.value.bucket, Key: objectKey }), { expiresIn: 15 * 60 });
}

export async function storePrivateReplicaManifest(input: {
  organisationId: string;
  profileId: string;
  version: number;
  manifest: Record<string, unknown>;
  sha256: string;
}) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  const objectKey = `organisations/${input.organisationId}/replicas/${input.profileId}/versions/${input.version}/manifest.json`;
  const body = new TextEncoder().encode(JSON.stringify(input.manifest));
  if (config.provider === "afrihost") {
    await putAfrihostObject({ objectKey, body, contentType: "application/json", sha256: input.sha256, classification: "biometric-derived" });
    return objectKey;
  }
  await client(config.value).send(new PutObjectCommand({
    Bucket: config.value.bucket,
    Key: objectKey,
    Body: body,
    ContentType: "application/json",
    Metadata: { sha256: input.sha256, classification: "biometric-derived" },
  }));
  return objectKey;
}
