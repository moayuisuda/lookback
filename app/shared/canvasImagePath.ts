export const normalizeImagePath = (value: string) => value.replace(/\\/g, "/");

export const isRemoteImagePath = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://");
};

export const isAssetImagePath = (value: string) => {
  const normalized = normalizeImagePath(value).replace(/^\/+/, "");
  return normalized.startsWith("assets/");
};

export const resolveCanvasImageUrl = (
  imagePath: string,
  canvasName: string,
  apiBaseUrl: string,
) => {
  const normalized = normalizeImagePath(imagePath).replace(/^\/+/, "");
  if (normalized.startsWith("assets/")) {
    const filename = normalized.split("/").pop() || normalized;
    return `${apiBaseUrl}/api/assets/${encodeURIComponent(
      canvasName,
    )}/${encodeURIComponent(filename)}`;
  }
  if (isRemoteImagePath(normalized)) return normalized;
  return `${apiBaseUrl}/${normalized}`;
};

export const sanitizeCanvasNameForPath = (value: string) => {
  const safe = value.replace(/[/\\:*?"<>|]/g, "_").trim();
  return safe || "Default";
};

export const resolveLocalImagePathFromStorage = (
  rawPath: string,
  canvasName: string,
  storageDir: string,
) => {
  if (!isAssetImagePath(rawPath)) return rawPath;

  const normalized = normalizeImagePath(rawPath).replace(/^\/+/, "");
  const filename = normalized.split("/").pop() || "";
  if (!filename) return "";

  const safeStorageDir = storageDir.replace(/[\\/]$/, "");
  const safeCanvasName = sanitizeCanvasNameForPath(canvasName);
  return `${safeStorageDir}/canvases/${safeCanvasName}/assets/${filename}`;
};

export const getImagePathDirname = (value: string) => {
  const normalized = normalizeImagePath(value);
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return normalized;
  return normalized.slice(0, index);
};
