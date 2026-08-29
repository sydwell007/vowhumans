import "server-only";

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type StorageConfiguration = {
  endpoint?: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function configuration(): StorageConfiguration | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY?.trim();
  const secretAccessKey = process.env.S3_SECRET_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    bucket,
    region: process.env.S3_REGION?.trim() || "af-south-1",
    accessKeyId,
    secretAccessKey,
  };
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
  const objectKey = [
    "organisations", input.organisationId, "replicas", input.profileId,
    "captures", input.captureSessionId, `${input.segmentId}.${input.extension}`,
  ].join("/");
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: input.contentType,
    Metadata: { sha256: input.sha256, classification: "biometric-capture" },
  });
  return {
    objectKey,
    uploadUrl: await getSignedUrl(client(config), command, { expiresIn: 15 * 60 }),
    requiredHeaders: {
      "content-type": input.contentType,
      "x-amz-meta-sha256": input.sha256,
      "x-amz-meta-classification": "biometric-capture",
    },
    expiresInSeconds: 15 * 60,
  };
}

export async function verifyPrivateReplicaObject(objectKey: string, expectedBytes: number, expectedSha256: string) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  const result = await client(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  return {
    byteSizeMatches: result.ContentLength === expectedBytes,
    sha256Matches: result.Metadata?.sha256 === expectedSha256,
    contentType: result.ContentType ?? null,
  };
}

export async function createPrivateReplicaDownload(objectKey: string) {
  const config = configuration();
  if (!config) throw new Error("Private object storage is not configured.");
  return getSignedUrl(client(config), new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }), { expiresIn: 15 * 60 });
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
  await client(config).send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    Body: JSON.stringify(input.manifest),
    ContentType: "application/json",
    Metadata: { sha256: input.sha256, classification: "biometric-derived" },
  }));
  return objectKey;
}
