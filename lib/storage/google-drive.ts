/**
 * Google Drive API v3 client for document filing.
 * All operations use an access token obtained from the account's credentials.
 */

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export interface DriveFolder {
  id: string;
  name: string;
  path?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  size?: string;
}

/** List folders under a given parent (or root if parentId is omitted). */
export async function listDriveFolders(
  accessToken: string,
  parentId?: string,
): Promise<DriveFolder[]> {
  const q = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");

  const params = new URLSearchParams({
    q,
    fields: "files(id,name)",
    pageSize: "100",
    orderBy: "name",
  });

  const res = await fetch(`${DRIVE_BASE}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Drive listFolders failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { files?: Array<{ id: string; name: string }> };
  return (json.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}

/** Create a new folder under parentId (or root if omitted). Returns the new folder. */
export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<DriveFolder> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const res = await fetch(`${DRIVE_BASE}/files?fields=id,name`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    throw new Error(`Drive createFolder failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { id: string; name: string };
  return { id: json.id, name: json.name };
}

/**
 * Upload a file to Google Drive using multipart upload.
 * Returns the created file's ID and webViewLink.
 */
export async function uploadToDrive(
  accessToken: string,
  filename: string,
  mimeType: string,
  content: Buffer,
  parentId?: string,
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name: filename };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const boundary = "-------omni_filing_boundary";
  const metaPart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n`;
  const dataPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const metaBuf = Buffer.from(metaPart, "utf8");
  const dataPreamble = Buffer.from(dataPart, "utf8");
  const closingBuf = Buffer.from(closing, "utf8");

  const body = Buffer.concat([metaBuf, dataPreamble, content, closingBuf]);

  const params = new URLSearchParams({ uploadType: "multipart", fields: "id,name,webViewLink,size" });
  const res = await fetch(`${DRIVE_UPLOAD}/files?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    id: string;
    name: string;
    webViewLink: string;
    size?: string;
  };

  return {
    id: json.id,
    name: json.name,
    webViewLink: json.webViewLink,
    size: json.size,
  };
}

/** Ensure a folder exists by name under parentId, creating it if absent. */
export async function ensureDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<DriveFolder> {
  const existing = await listDriveFolders(accessToken, parentId);
  const found = existing.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  return createDriveFolder(accessToken, name, parentId);
}
