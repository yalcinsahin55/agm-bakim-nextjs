export const PRIVATE_BLOB_PILOT_PREFIX = "private-pilot";

export type PrivateBlobPilotFolder = "report-attachments" | "oil-analyses";

type Environment = Record<string, string | undefined>;

export function isPrivateBlobPilotEnabled(environment: Environment = process.env): boolean {
  return environment.PRIVATE_BLOB_PILOT_ENABLED === "true" && environment.VERCEL_ENV === "preview";
}

export function isPrivateBlobPilotFolder(folder: string): folder is PrivateBlobPilotFolder {
  return folder === "report-attachments" || folder === "oil-analyses";
}

export function shouldUsePrivateBlobPilot(folder: string, environment: Environment = process.env): folder is PrivateBlobPilotFolder {
  return isPrivateBlobPilotEnabled(environment) && isPrivateBlobPilotFolder(folder);
}

export function buildPrivateBlobPilotPath(folder: PrivateBlobPilotFolder, filename: string): string {
  return `${PRIVATE_BLOB_PILOT_PREFIX}/${folder}/${filename}`;
}

export function getPrivateBlobPilotStoreId(environment: Environment = process.env): string | undefined {
  const configured = environment.PRIVATE_BLOB_STORE_ID || environment.MEDIA_STORE_ID;
  return configured?.trim() || undefined;
}

export function isPrivateBlobUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase().endsWith(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}
