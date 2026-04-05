/**
 * Microsoft Graph API (OneDrive) client for document filing.
 * All operations use an access token obtained from the account's credentials.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0/me/drive";

export interface OneDriveFolder {
  id: string;
  name: string;
  path?: string;
}

export interface OneDriveFile {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
}

/** List child folders under a given item ID (or root if parentId is omitted). */
export async function listOneDriveFolders(
  accessToken: string,
  parentId?: string,
): Promise<OneDriveFolder[]> {
  const base = parentId
    ? `${GRAPH_BASE}/items/${parentId}/children`
    : `${GRAPH_BASE}/root/children`;

  const params = new URLSearchParams({
    $filter: "folder ne null",
    $select: "id,name,folder,parentReference",
    $top: "100",
    $orderby: "name asc",
  });

  const res = await fetch(`${base}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`OneDrive listFolders failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    value?: Array<{ id: string; name: string; folder?: unknown; parentReference?: { path?: string } }>;
  };

  return (json.value ?? [])
    .filter((item) => item.folder != null)
    .map((item) => ({
      id: item.id,
      name: item.name,
      path: item.parentReference?.path,
    }));
}

/** Create a new folder under parentId (or root). */
export async function createOneDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<OneDriveFolder> {
  const base = parentId
    ? `${GRAPH_BASE}/items/${parentId}/children`
    : `${GRAPH_BASE}/root/children`;

  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });

  if (!res.ok) {
    throw new Error(`OneDrive createFolder failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { id: string; name: string };
  return { id: json.id, name: json.name };
}

/**
 * Upload a file to OneDrive using the simple upload endpoint (up to 4 MB).
 * For larger files a resumable upload session would be needed — this covers
 * most email attachments.
 */
export async function uploadToOneDrive(
  accessToken: string,
  filename: string,
  mimeType: string,
  content: Buffer,
  parentId?: string,
): Promise<OneDriveFile> {
  // Encode filename for URL — Graph API uses the filename in the path
  const encoded = encodeURIComponent(filename);
  const base = parentId
    ? `${GRAPH_BASE}/items/${parentId}:/${encoded}:/content`
    : `${GRAPH_BASE}/root:/${encoded}:/content`;

  const params = new URLSearchParams({ "@microsoft.graph.conflictBehavior": "rename" });

  const res = await fetch(`${base}?${params}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": mimeType,
    },
    body: content as unknown as BodyInit,
  });

  if (!res.ok) {
    throw new Error(`OneDrive upload failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    id: string;
    name: string;
    webUrl: string;
    size?: number;
  };

  return {
    id: json.id,
    name: json.name,
    webUrl: json.webUrl,
    size: json.size,
  };
}

/** Ensure a folder exists by name under parentId, creating it if absent. */
export async function ensureOneDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<OneDriveFolder> {
  const existing = await listOneDriveFolders(accessToken, parentId);
  const found = existing.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  return createOneDriveFolder(accessToken, name, parentId);
}
