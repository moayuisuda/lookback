// This file is intended to be dynamically loaded.
// Imports are not allowed. Dependencies are passed via context.

const SQLITE_MAGIC = new Uint8Array([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
  0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
]);

const DIRECT_WRITE_CHUNK_SIZE = 12000;
const DEBUG_PREFIX = "[importPureRef]";

const debugLog = (...args) => console.log(DEBUG_PREFIX, ...args);
const debugError = (...args) => console.error(DEBUG_PREFIX, ...args);

export const config = {
  id: "importPureRef",
  i18n: {
    en: {
      "command.importPureRef.title": "Import PureRef",
      "command.importPureRef.description": "Extract a .pur scene and add its images to the current canvas",
      "command.importPureRef.select": "Select .pur File",
      "command.importPureRef.dropTitle": "Import images from PureRef",
      "command.importPureRef.dropSubtitle": "Images are copied into current canvas assets and placed as a centered group.",
      "command.importPureRef.status.ready": "Choose a PureRef .pur file",
      "command.importPureRef.status.extracting": "Reading PureRef scene...",
      "command.importPureRef.status.uploading": "Importing {{current}}/{{total}} images...",
      "command.importPureRef.status.imported": "Imported {{count}} images",
      "toast.command.importPureRef.noImages": "No images were found in this PureRef file",
      "toast.command.importPureRef.failed": "PureRef import failed: {{error}}",
      "toast.command.importPureRef.success": "Imported {{count}} PureRef images",
    },
    zh: {
      "command.importPureRef.title": "导入 PureRef",
      "command.importPureRef.description": "读取 .pur 文件并把图片导入当前画布",
      "command.importPureRef.select": "选择 .pur 文件",
      "command.importPureRef.dropTitle": "从 PureRef 导入图片",
      "command.importPureRef.dropSubtitle": "图片会复制到当前画布 assets，并按原布局整体居中放置。",
      "command.importPureRef.status.ready": "请选择 PureRef .pur 文件",
      "command.importPureRef.status.extracting": "正在读取 PureRef 场景...",
      "command.importPureRef.status.uploading": "正在导入 {{current}}/{{total}} 张图片...",
      "command.importPureRef.status.imported": "已导入 {{count}} 张图片",
      "toast.command.importPureRef.noImages": "这个 PureRef 文件里没有找到图片",
      "toast.command.importPureRef.failed": "PureRef 导入失败：{{error}}",
      "toast.command.importPureRef.success": "已导入 {{count}} 张 PureRef 图片",
    },
  },
  titleKey: "command.importPureRef.title",
  title: "Import PureRef",
  descriptionKey: "command.importPureRef.description",
  description: "Extract a .pur scene and add its images to the current canvas",
  keywords: ["pureref", "pur", "import", "canvas", "素材", "导入"],
};

const findSubarray = (bytes, needle) => {
  outer: for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
};

const reassemblePureRefSqlite = (raw) => {
  const offset = findSubarray(raw, SQLITE_MAGIC);
  if (offset < 0) {
    throw new Error("SQLite header not found; this does not look like a PureRef 2.x scene.");
  }
  const shift = raw.length - offset;
  const rebuilt = new Uint8Array(raw.length - shift);
  rebuilt.set(raw.slice(offset), 0);
  rebuilt.set(raw.slice(shift, offset), raw.length - offset);
  return rebuilt;
};

class SQLiteReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.decoder = new TextDecoder("utf-8");
    const pageSize = this.u16(16);
    this.pageSize = pageSize === 1 ? 65536 : pageSize;
    this.reserved = this.bytes[20] || 0;
    this.usableSize = this.pageSize - this.reserved;
    this.schema = this.readSchema();
  }

  u16(offset) {
    return (this.bytes[offset] << 8) | this.bytes[offset + 1];
  }

  u32(offset) {
    return (
      this.bytes[offset] * 0x1000000 +
      ((this.bytes[offset + 1] << 16) |
        (this.bytes[offset + 2] << 8) |
        this.bytes[offset + 3])
    ) >>> 0;
  }

  i64ToNumber(bytes) {
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    const bits = BigInt(bytes.length * 8);
    const sign = 1n << (bits - 1n);
    if (value & sign) value -= 1n << bits;
    return Number(value);
  }

  readVarint(offset) {
    let value = 0n;
    for (let i = 0; i < 8; i += 1) {
      const byte = this.bytes[offset + i];
      value = (value << 7n) | BigInt(byte & 0x7f);
      if ((byte & 0x80) === 0) {
        return { value: Number(value), length: i + 1 };
      }
    }
    value = (value << 8n) | BigInt(this.bytes[offset + 8]);
    return { value: Number(value), length: 9 };
  }

  pageStart(pageNo) {
    return (pageNo - 1) * this.pageSize;
  }

  pageHeader(pageNo) {
    return this.pageStart(pageNo) + (pageNo === 1 ? 100 : 0);
  }

  localPayloadSize(payloadSize) {
    const maxLocal = this.usableSize - 35;
    if (payloadSize <= maxLocal) return payloadSize;
    const minLocal = Math.floor(((this.usableSize - 12) * 32) / 255) - 23;
    let local = minLocal + ((payloadSize - minLocal) % (this.usableSize - 4));
    if (local > maxLocal) local = minLocal;
    return local;
  }

  readOverflow(firstPageNo, needed) {
    const chunks = [];
    let pageNo = firstPageNo;
    let remaining = needed;
    while (pageNo && remaining > 0) {
      const start = this.pageStart(pageNo);
      const nextPage = this.u32(start);
      const take = Math.min(remaining, this.usableSize - 4);
      chunks.push(this.bytes.slice(start + 4, start + 4 + take));
      remaining -= take;
      pageNo = nextPage;
    }

    const out = new Uint8Array(needed - remaining);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  readTablePayload(cellOffset) {
    let cursor = cellOffset;
    const payloadVar = this.readVarint(cursor);
    cursor += payloadVar.length;
    const rowidVar = this.readVarint(cursor);
    cursor += rowidVar.length;

    const payloadSize = payloadVar.value;
    const localSize = this.localPayloadSize(payloadSize);
    const local = this.bytes.slice(cursor, cursor + localSize);
    if (localSize >= payloadSize) {
      return { rowid: rowidVar.value, payload: local };
    }

    const overflowPage = this.u32(cursor + localSize);
    const overflow = this.readOverflow(overflowPage, payloadSize - localSize);
    const payload = new Uint8Array(payloadSize);
    payload.set(local, 0);
    payload.set(overflow, localSize);
    return { rowid: rowidVar.value, payload };
  }

  readRecord(payload) {
    const originalBytes = this.bytes;
    this.bytes = payload;
    try {
      let cursor = 0;
      const headerVar = this.readVarint(cursor);
      cursor += headerVar.length;
      const headerEnd = headerVar.value;
      const serials = [];
      while (cursor < headerEnd) {
        const serial = this.readVarint(cursor);
        serials.push(serial.value);
        cursor += serial.length;
      }

      let body = headerEnd;
      return serials.map((serial) => {
        const readBytes = (length) => {
          const data = payload.slice(body, body + length);
          body += length;
          return data;
        };

        if (serial === 0) return { value: null, bytes: new Uint8Array(), type: "null" };
        if (serial >= 1 && serial <= 6) {
          const lengths = [0, 1, 2, 3, 4, 6, 8];
          const data = readBytes(lengths[serial]);
          return { value: this.i64ToNumber(data), bytes: data, type: "int" };
        }
        if (serial === 7) {
          const data = readBytes(8);
          const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
          return { value: view.getFloat64(0, false), bytes: data, type: "real" };
        }
        if (serial === 8) return { value: 0, bytes: new Uint8Array(), type: "int" };
        if (serial === 9) return { value: 1, bytes: new Uint8Array(), type: "int" };
        if (serial >= 12) {
          const isBlob = serial % 2 === 0;
          const length = isBlob ? (serial - 12) / 2 : (serial - 13) / 2;
          const data = readBytes(length);
          return {
            value: isBlob ? data : this.decoder.decode(data),
            bytes: data,
            type: isBlob ? "blob" : "text",
          };
        }
        return { value: null, bytes: new Uint8Array(), type: "null" };
      });
    } finally {
      this.bytes = originalBytes;
    }
  }

  collectTableCells(pageNo, cells = []) {
    const header = this.pageHeader(pageNo);
    const type = this.bytes[header];
    const count = this.u16(header + 3);
    const pointerStart = header + (type === 0x05 ? 12 : 8);

    if (type === 0x0d) {
      for (let i = 0; i < count; i += 1) {
        cells.push(this.pageStart(pageNo) + this.u16(pointerStart + i * 2));
      }
      return cells;
    }

    if (type === 0x05) {
      for (let i = 0; i < count; i += 1) {
        const cell = this.pageStart(pageNo) + this.u16(pointerStart + i * 2);
        this.collectTableCells(this.u32(cell), cells);
      }
      this.collectTableCells(this.u32(header + 8), cells);
      return cells;
    }

    throw new Error(`Unsupported SQLite page type ${type} on page ${pageNo}`);
  }

  readTableByColumns(rootPage, columns) {
    return this.collectTableCells(rootPage).map((cell) => {
      const { rowid, payload } = this.readTablePayload(cell);
      const values = this.readRecord(payload);
      const row = { _rowid: rowid };
      columns.forEach((name, index) => {
        row[name] = values[index] || {
          value: null,
          bytes: new Uint8Array(),
          type: "null",
        };
      });
      return row;
    });
  }

  parseColumns(sql) {
    const match = /\(([\s\S]*)\)/.exec(sql || "");
    if (!match) return [];
    return match[1]
      .split(/,(?![^()]*\))/)
      .map((part) => part.trim().split(/\s+/)[0].replace(/^["'`\[]|["'`\]]$/g, ""))
      .filter((name) => name && !/^CONSTRAINT$/i.test(name));
  }

  readSchema() {
    const schemaRows = this.readTableByColumns(1, [
      "type",
      "name",
      "tbl_name",
      "rootpage",
      "sql",
    ]);
    const schema = {};
    for (const row of schemaRows) {
      if (row.type.value !== "table") continue;
      schema[row.name.value] = {
        rootPage: row.rootpage.value,
        sql: row.sql.value,
        columns: this.parseColumns(row.sql.value),
      };
    }
    return schema;
  }

  readTable(name) {
    const entry = this.schema[name];
    if (!entry) throw new Error(`Missing SQLite table: ${name}`);
    return this.readTableByColumns(entry.rootPage, entry.columns);
  }
}

const valueOf = (cell) => (cell ? cell.value : null);

const bytesOf = (cell) => {
  if (!cell) return new Uint8Array();
  if (cell.type === "text" && typeof cell.value === "string") {
    return Uint8Array.from(cell.value, (char) => char.charCodeAt(0) & 0xff);
  }
  return cell.bytes || new Uint8Array();
};

const parseQtTransform = (cell) => {
  const data = bytesOf(cell);
  if (data.length < 77) return null;
  let payload = data.slice(4);
  if (payload.length >= 73) {
    payload = payload.slice(1, 73);
  } else if (payload.length >= 72) {
    payload = payload.slice(0, 72);
  } else {
    return null;
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const values = [];
  for (let i = 0; i < 9; i += 1) values.push(view.getFloat64(i * 8, false));
  return {
    m11: values[0],
    m12: values[1],
    m13: values[2],
    m21: values[3],
    m22: values[4],
    m23: values[5],
    dx: values[6],
    dy: values[7],
    m33: values[8],
  };
};

const qtransformMap = (transform, x, y) => [
  transform.m11 * x + transform.m21 * y + transform.dx,
  transform.m12 * x + transform.m22 * y + transform.dy,
];

const identityTransform = () => ({
  m11: 1,
  m12: 0,
  m13: 0,
  m21: 0,
  m22: 1,
  m23: 0,
  dx: 0,
  dy: 0,
  m33: 1,
});

const multiplyTransforms = (outer, inner) => ({
  m11: outer.m11 * inner.m11 + outer.m21 * inner.m12,
  m12: outer.m12 * inner.m11 + outer.m22 * inner.m12,
  m13: 0,
  m21: outer.m11 * inner.m21 + outer.m21 * inner.m22,
  m22: outer.m12 * inner.m21 + outer.m22 * inner.m22,
  m23: 0,
  dx: outer.m11 * inner.dx + outer.m21 * inner.dy + outer.dx,
  dy: outer.m12 * inner.dx + outer.m22 * inner.dy + outer.dy,
  m33: 1,
});

const buildWorldTransformResolver = (items) => {
  const cache = new Map();
  const resolving = new Set();

  const resolve = (itemId) => {
    if (cache.has(itemId)) return cache.get(itemId);
    if (resolving.has(itemId)) return identityTransform();
    resolving.add(itemId);

    const row = items.get(itemId);
    if (!row) {
      resolving.delete(itemId);
      return identityTransform();
    }

    const local = parseQtTransform(row.transform) || identityTransform();
    const parentId = Number(valueOf(row.parent));
    const world =
      Number.isFinite(parentId) && parentId >= 0 && items.has(parentId)
        ? multiplyTransforms(resolve(parentId), local)
        : local;

    cache.set(itemId, world);
    resolving.delete(itemId);
    return world;
  };

  return resolve;
};

const sanitizeFileName = (value) => {
  const safe = String(value || "pureref")
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
    .trim()
    .slice(0, 80);
  return safe || "pureref";
};

const sanitizeAssetFileName = (value) => {
  const safe = String(value || "pureref")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return safe || "pureref";
};

const getNameWithoutExtension = (value) => {
  const name = String(value || "PureRef").replace(/\\/g, "/").split("/").pop() || "PureRef";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};

const normalizePath = (value) => String(value || "").replace(/\\/g, "/");

const trimTrailingSeparators = (value) => value.replace(/[\\/]+$/, "");

const sanitizeCanvasNameForPath = (value) => {
  const safe = String(value || "").replace(/[/\\:*?"<>|]/g, "_").trim();
  return safe || "Default";
};

const detectPlatform = () => {
  const raw = String(navigator.platform || "").toLowerCase();
  if (raw.includes("win")) return "win";
  if (raw.includes("mac")) return "mac";
  if (raw.includes("linux")) return "linux";
  return "unknown";
};

const toWindowsPath = (value) => normalizePath(value).replace(/\//g, "\\");

const joinPlatformPath = (base, child, platform) => {
  const root = trimTrailingSeparators(base);
  if (platform === "win") return `${root}\\${child}`;
  return `${root}/${child}`;
};

const buildCanvasAssetPath = (storageDir, canvasName, filename, platform) => {
  const base =
    platform === "win"
      ? trimTrailingSeparators(toWindowsPath(storageDir))
      : trimTrailingSeparators(normalizePath(storageDir));
  const canvasDir = joinPlatformPath(
    joinPlatformPath(base, "canvases", platform),
    sanitizeCanvasNameForPath(canvasName),
    platform,
  );
  const assetsDir = joinPlatformPath(canvasDir, "assets", platform);
  return {
    assetsDir,
    assetPath: joinPlatformPath(assetsDir, filename, platform),
    relativePath: `assets/${filename}`,
  };
};

const escapePowerShellSingleQuoted = (value) => String(value).replace(/'/g, "''");

const normalizeExtension = (format) => {
  const ext = String(format || "png").toLowerCase();
  if (ext === "jpeg") return "jpg";
  if (["png", "jpg", "webp", "gif", "bmp"].includes(ext)) return ext;
  return "png";
};

const mimeFromExtension = (ext) => {
  if (ext === "jpg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  return "image/png";
};

const readPureRefFile = async (file) => {
  const raw = new Uint8Array(await file.arrayBuffer());
  const db = new SQLiteReader(reassemblePureRefSqlite(raw));
  const images = new Map(db.readTable("images").map((row) => [row._rowid, row]));
  const itemRows = db.readTable("items");
  const items = new Map(itemRows.map((row) => [row._rowid, row]));
  const imageItems = db.readTable("items_images");
  const groupRows = (() => {
    try {
      return db.readTable("items_groups");
    } catch {
      return [];
    }
  })();
  const groups = new Map(groupRows.map((row) => [row._rowid, row]));
  const resolveWorldTransform = buildWorldTransformResolver(items);
  const prefix = `pureref_${sanitizeAssetFileName(getNameWithoutExtension(file.name))}_${Date.now()}`;

  return imageItems
    .map((row) => {
      const image = images.get(valueOf(row.image));
      const item = items.get(row._rowid);
      if (!image || !item) return null;

      const data = bytesOf(image.data);
      if (!data.length) return null;

      const itemTransform = resolveWorldTransform(row._rowid);
      const imageTransform = parseQtTransform(row.image_transform);
      const originalWidth = Number(valueOf(image.width) || 0);
      const originalHeight = Number(valueOf(image.height) || 0);
      const localLeft = imageTransform ? imageTransform.dx : -originalWidth / 2;
      const localTop = imageTransform ? imageTransform.dy : -originalHeight / 2;
      const localRight = localLeft + originalWidth;
      const localBottom = localTop + originalHeight;

      let sceneX = null;
      let sceneY = null;
      let sceneWidth = originalWidth;
      let sceneHeight = originalHeight;
      let centerX = null;
      let centerY = null;
      let rotation = 0;

      if (itemTransform) {
        const corners = [
          qtransformMap(itemTransform, localLeft, localTop),
          qtransformMap(itemTransform, localRight, localTop),
          qtransformMap(itemTransform, localRight, localBottom),
          qtransformMap(itemTransform, localLeft, localBottom),
        ];
        const xs = corners.map((point) => point[0]);
        const ys = corners.map((point) => point[1]);
        sceneX = Math.min(...xs);
        sceneY = Math.min(...ys);
        sceneWidth = Math.max(...xs) - sceneX;
        sceneHeight = Math.max(...ys) - sceneY;
        centerX = sceneX + sceneWidth / 2;
        centerY = sceneY + sceneHeight / 2;
        if (itemTransform.m11 || itemTransform.m12) {
          rotation = Math.atan2(itemTransform.m12, itemTransform.m11) * (180 / Math.PI);
        }
      }

      const ext = normalizeExtension(valueOf(image.format));
      const displayName = String(valueOf(item.name) || `item_${row._rowid}`);
      const filename = `${prefix}_${String(row._rowid).padStart(3, "0")}.${ext}`;
      const parentId = Number(valueOf(item.parent));
      const groupId = groups.has(parentId) ? parentId : null;
      const groupItem = groupId !== null ? items.get(groupId) : null;

      return {
        itemId: row._rowid,
        imageId: valueOf(row.image),
        group_id: groupId,
        group_name: groupItem ? valueOf(groupItem.name) : null,
        name: displayName,
        filename,
        mime: mimeFromExtension(ext),
        data,
        source: valueOf(image.source) || valueOf(image.origin) || null,
        checksum: valueOf(image.checksum) || null,
        original_width: originalWidth,
        original_height: originalHeight,
        scene_x: sceneX,
        scene_y: sceneY,
        scene_width: sceneWidth,
        scene_height: sceneHeight,
        center_x: centerX,
        center_y: centerY,
        rotation,
        z: valueOf(item.z) || 0,
        opacity: valueOf(item.opacity) ?? 1,
        locked: Boolean(valueOf(item.locked)),
      };
    })
    .filter(Boolean);
};

const bytesToDataUrl = (bytes, mime) =>
  new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mime });
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });

const bytesToBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += DIRECT_WRITE_CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + DIRECT_WRITE_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const loadImageFromBytes = async (bytes, mime) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Extracted image could not be decoded"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const drawImageToCanvas = (image, maxEdge = Infinity, fill = null) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const bytesToCanvasDataUrl = async (bytes, mime) => {
  const image = await loadImageFromBytes(bytes, mime);
  const maxUploadLength = 900000;
  const pngCanvas = drawImageToCanvas(image);
  const pngDataUrl = pngCanvas.toDataURL("image/png");
  if (pngDataUrl.length <= maxUploadLength) return pngDataUrl;

  for (const quality of [0.92, 0.82, 0.72, 0.62]) {
    const dataUrl = drawImageToCanvas(image, Infinity, "#ffffff").toDataURL(
      "image/jpeg",
      quality,
    );
    if (dataUrl.length <= maxUploadLength) return dataUrl;
  }

  for (const maxEdge of [2400, 1800, 1400]) {
    const dataUrl = drawImageToCanvas(image, maxEdge, "#ffffff").toDataURL(
      "image/jpeg",
      0.82,
    );
    if (dataUrl.length <= maxUploadLength) return dataUrl;
  }

  return drawImageToCanvas(image, 1200, "#ffffff").toDataURL("image/jpeg", 0.72);
};

const runShell = async (shell, payload) =>
  shell({
    timeoutMs: 180000,
    ...payload,
  });

const writeAssetViaPowerShell = async (item, shell, storageDir, canvasName) => {
  const platform = detectPlatform();
  if (platform !== "win") {
    throw new Error("Direct asset write fallback is only implemented on Windows.");
  }

  const paths = buildCanvasAssetPath(storageDir, canvasName, item.filename, platform);
  const tempPath = `${paths.assetPath}.b64tmp`;
  const safeAssetsDir = escapePowerShellSingleQuoted(paths.assetsDir);
  const safeAssetPath = escapePowerShellSingleQuoted(paths.assetPath);
  const safeTempPath = escapePowerShellSingleQuoted(tempPath);
  const base64 = bytesToBase64(item.data);

  const init = await runShell(shell, {
    command: "powershell.exe",
    args: [
      "-NoProfile",
      "-Command",
      [
        "$ErrorActionPreference='Stop'",
        `$assetsDir='${safeAssetsDir}'`,
        `$temp='${safeTempPath}'`,
        "if (!(Test-Path -LiteralPath $assetsDir -PathType Container)) { New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null }",
        "Set-Content -LiteralPath $temp -Value '' -NoNewline -Encoding ascii",
      ].join("; "),
    ],
  });
  if (!init.success) throw new Error(init.error || init.stderr || "Failed to prepare asset file");

  for (let i = 0; i < base64.length; i += DIRECT_WRITE_CHUNK_SIZE) {
    const chunk = escapePowerShellSingleQuoted(base64.slice(i, i + DIRECT_WRITE_CHUNK_SIZE));
    const result = await runShell(shell, {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-Command",
        [
          "$ErrorActionPreference='Stop'",
          `$temp='${safeTempPath}'`,
          `$chunk='${chunk}'`,
          "Add-Content -LiteralPath $temp -Value $chunk -NoNewline -Encoding ascii",
        ].join("; "),
      ],
    });
    if (!result.success) {
      throw new Error(result.error || result.stderr || "Failed to write asset chunk");
    }
  }

  const finalize = await runShell(shell, {
    command: "powershell.exe",
    args: [
      "-NoProfile",
      "-Command",
      [
        "$ErrorActionPreference='Stop'",
        `$temp='${safeTempPath}'`,
        `$target='${safeAssetPath}'`,
        "$bytes=[Convert]::FromBase64String([IO.File]::ReadAllText($temp))",
        "[IO.File]::WriteAllBytes($target, $bytes)",
        "Remove-Item -LiteralPath $temp -Force",
      ].join("; "),
    ],
  });
  if (!finalize.success) {
    throw new Error(finalize.error || finalize.stderr || "Failed to finalize asset file");
  }

  return {
    ...item,
    data: null,
    imagePath: paths.relativePath,
    uploadedWidth: item.original_width,
    uploadedHeight: item.original_height,
    dominantColor: null,
    tone: null,
  };
};

const uploadExtractedImage = async (
  item,
  canvasName,
  apiBaseUrl,
  shell,
  storageDir,
) => {
  void shell;
  void storageDir;

  const params = new URLSearchParams();
  params.set("filename", item.filename);
  params.set("canvasName", canvasName || "");
  const endpoint = `${apiBaseUrl}/api/upload-temp?${params.toString()}`;
  const blob = new Blob([item.data], {
    type: item.mime || "application/octet-stream",
  });

  debugLog("upload start", {
    name: item.name,
    filename: item.filename,
    mime: item.mime,
    bytes: item.data?.length,
    blobSize: blob.size,
    endpoint,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: item.mime ? { "Content-Type": item.mime } : undefined,
    body: blob,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    debugError("upload failed", {
      status: response.status,
      detail,
      name: item.name,
      filename: item.filename,
      bytes: item.data?.length,
      blobSize: blob.size,
    });
    throw new Error(
      `Upload failed: ${response.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`,
    );
  }

  const uploaded = await response.json();
  debugLog("upload response", uploaded);
  if (!uploaded?.path) {
    throw new Error(uploaded?.error || "Upload succeeded without asset path");
  }
  return {
    ...item,
    data: null,
    imagePath: uploaded.path,
    uploadedWidth: uploaded.width,
    uploadedHeight: uploaded.height,
    dominantColor: uploaded.dominantColor ?? null,
    tone: uploaded.tone ?? null,
  };
};

const getCanvasCenter = (canvasSnap) => {
  const viewport = canvasSnap.canvasViewport || {};
  const dimensions = canvasSnap.dimensions || {};
  const scale = viewport.scale || 1;
  return {
    x: ((dimensions.width || 0) / 2 - (viewport.x || 0)) / scale,
    y: ((dimensions.height || 0) / 2 - (viewport.y || 0)) / scale,
  };
};

const computePlacement = (items, canvasSnap) => {
  const placed = items.filter(
    (item) =>
      Number.isFinite(Number(item.center_x)) &&
      Number.isFinite(Number(item.center_y)) &&
      Number(item.scene_width) > 0 &&
      Number(item.scene_height) > 0,
  );

  if (placed.length > 0) {
    const bounds = placed.reduce(
      (acc, item) => {
        const left = Number(item.center_x) - Number(item.scene_width) / 2;
        const top = Number(item.center_y) - Number(item.scene_height) / 2;
        const right = Number(item.center_x) + Number(item.scene_width) / 2;
        const bottom = Number(item.center_y) + Number(item.scene_height) / 2;
        return {
          left: Math.min(acc.left, left),
          top: Math.min(acc.top, top),
          right: Math.max(acc.right, right),
          bottom: Math.max(acc.bottom, bottom),
        };
      },
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const center = getCanvasCenter(canvasSnap);
    return {
      mode: "layout",
      offsetX: center.x - (bounds.left + bounds.right) / 2,
      offsetY: center.y - (bounds.top + bounds.bottom) / 2,
    };
  }

  return {
    mode: "grid",
    center: getCanvasCenter(canvasSnap),
  };
};

const createImageMeta = (item) => ({
  id: `temp_pureref_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  filename: getNameWithoutExtension(item.name || item.filename),
  imagePath: item.imagePath,
  pageUrl: item.source || null,
  tags: ["PureRef"],
  createdAt: Date.now(),
  dominantColor: item.dominantColor,
  tone: item.tone,
  hasVector: false,
  width: Math.max(1, Math.round(Number(item.scene_width || item.uploadedWidth || item.original_width || 1))),
  height: Math.max(1, Math.round(Number(item.scene_height || item.uploadedHeight || item.original_height || 1))),
  grayscale: false,
  flipX: false,
  flipY: false,
  rotation: Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0,
  opacity: Number.isFinite(Number(item.opacity)) ? Number(item.opacity) : 1,
  locked: item.locked === true,
});

const addItemsToCanvas = (items, canvasSnap, actions) => {
  const placement = computePlacement(items, canvasSnap);
  const sorted = [...items].sort((a, b) => Number(a.z || 0) - Number(b.z || 0));
  const groupItemIds = new Map();

  sorted.forEach((item, index) => {
    const meta = createImageMeta(item);
    let x;
    let y;
    if (
      placement.mode === "layout" &&
      Number.isFinite(Number(item.center_x)) &&
      Number.isFinite(Number(item.center_y))
    ) {
      x = Number(item.center_x) + placement.offsetX;
      y = Number(item.center_y) + placement.offsetY;
    } else {
      const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
      const col = index % columns;
      const row = Math.floor(index / columns);
      x = placement.center.x + (col - (columns - 1) / 2) * 240;
      y = placement.center.y + row * 240;
    }
    const createdItemId = actions.canvasActions.addToCanvas(meta, x, y);
    if (item.group_id !== null && item.group_id !== undefined && createdItemId) {
      const key = String(item.group_id);
      if (!groupItemIds.has(key)) groupItemIds.set(key, []);
      groupItemIds.get(key).push(createdItemId);
    }
  });

  let createdGroupCount = 0;
  groupItemIds.forEach((ids, groupId) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length < 2) return;
    actions.canvasActions.clearSelectionState?.();
    uniqueIds.forEach((id) => {
      actions.canvasActions.updateCanvasImageSilent?.(id, { isSelected: true });
    });
    const ok = actions.canvasActions.groupSelectedItems?.();
    debugLog("group restore", { groupId, ids: uniqueIds, ok });
    if (ok) createdGroupCount += 1;
  });
  actions.canvasActions.clearSelectionState?.();
  if (createdGroupCount > 0) {
    debugLog("group positions use world transforms with parent transforms applied");
  }
  debugLog("group restore complete", { createdGroupCount });
};

export const ui = ({ context }) => {
  const { React, hooks, actions, config: appConfig, shell } = context;
  const { useRef, useState } = React;
  const { useEnvState, useT } = hooks;
  const { t } = useT();
  const { canvas: canvasSnap } = useEnvState();
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState({ key: "command.importPureRef.status.ready" });
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || loading) return;

    try {
      setLoading(true);
      setStatus({ key: "command.importPureRef.status.extracting" });
      debugLog("import start", {
        fileName: file.name,
        fileSize: file.size,
        canvasName: canvasSnap.currentCanvasName || "Default",
        apiBaseUrl: appConfig.API_BASE_URL,
      });

      const extracted = await readPureRefFile(file);
      debugLog(
        "parsed items",
        extracted.map((item) => ({
          name: item.name,
          groupId: item.group_id,
          groupName: item.group_name,
          filename: item.filename,
          mime: item.mime,
          bytes: item.data?.length,
          center: [item.center_x, item.center_y],
          size: [item.scene_width, item.scene_height],
        })),
      );
      if (extracted.length === 0) {
        actions.globalActions.pushToast(
          { key: "toast.command.importPureRef.noImages" },
          "warning",
        );
        setStatus({ key: "command.importPureRef.status.ready" });
        return;
      }

      const canvasName = canvasSnap.currentCanvasName || "Default";
      const storageDir = await window.electron?.getStorageDir?.();
      const imported = [];
      for (let index = 0; index < extracted.length; index += 1) {
        setStatus({
          key: "command.importPureRef.status.uploading",
          params: { current: index + 1, total: extracted.length },
        });
        imported.push(
          await uploadExtractedImage(
            extracted[index],
            canvasName,
            appConfig.API_BASE_URL,
            shell,
            storageDir,
          ),
        );
      }

      addItemsToCanvas(imported, canvasSnap, actions);
      debugLog("canvas add complete", {
        count: imported.length,
        paths: imported.map((item) => item.imagePath),
      });
      setStatus({
        key: "command.importPureRef.status.imported",
        params: { count: imported.length },
      });
      actions.globalActions.pushToast(
        {
          key: "toast.command.importPureRef.success",
          params: { count: imported.length },
        },
        "success",
      );
      actions.commandActions.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugError("import failed", error);
      setStatus({
        key: "toast.command.importPureRef.failed",
        params: { error: message },
      });
      actions.globalActions.pushToast(
        {
          key: "toast.command.importPureRef.failed",
          params: { error: message },
        },
        "error",
      );
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full flex-col px-4 py-5 text-sm text-neutral-200">
      <div className="rounded-md border border-dashed border-neutral-700 bg-neutral-900/60 px-4 py-6 text-center">
        <div className="text-sm font-medium text-neutral-100">
          {t("command.importPureRef.dropTitle")}
        </div>
        <div className="mt-2 text-xs leading-5 text-neutral-400">
          {t("command.importPureRef.dropSubtitle")}
        </div>
        <button
          type="button"
          disabled={loading}
          className="mt-5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
        >
          {t("command.importPureRef.select")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pur"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      <div className="mt-3 min-h-5 text-xs text-neutral-400">
        {t(status.key, status.params)}
      </div>
    </div>
  );
};
