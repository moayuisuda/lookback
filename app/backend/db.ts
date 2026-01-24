import path from "path";
import Database from "better-sqlite3";
import { load as loadVss } from "sqlite-vss";

export class StorageIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageIncompatibleError";
  }
}

export type ImageMeta = {
  id: string;
  filename: string;
  imagePath: string;
  pageUrl: string | null;
  tags: string[];
  createdAt: number;
  dominantColor: string | null;
  tone: string | null;
  hasVector: boolean;
  score?: number;
};

type ImageRow = {
  rowid: number;
  id: string;
  filename: string;
  imagePath: string;
  createdAt: number;
  pageUrl: string | null;
  dominantColor: string | null;
  tone: string | null;
  galleryOrder?: number | null;
};

type TagRow = { imageId: string; name: string };

export type ImageDb = {
  getImageById: (id: string) => ImageMeta | null;
  listImages: () => ImageMeta[];
  listImagesByIds: (ids: string[]) => ImageMeta[];
  setGalleryOrder: (order: string[]) => void;
  moveGalleryOrder: (activeId: string, overId: string) => void;
  searchImages: (params: {
    vector?: number[] | null;
    limit?: number;
    offset?: number;
    tagIds?: number[];
    tagCount?: number;
    tone?: string | null;
  }) => ImageMeta[];
  searchImagesByText: (params: {
    query: string;
    limit?: number;
    offset?: number;
    tagIds?: number[];
    tagCount?: number;
    tone?: string | null;
  }) => ImageMeta[];
  insertImage: (data: {
    id: string;
    filename: string;
    imagePath: string;
    createdAt: number;
    pageUrl: string | null;
  }) => { rowid: number };
  updateImage: (data: {
    id: string;
    filename?: string;
    imagePath?: string;
    pageUrl?: string | null;
    dominantColor?: string | null;
    tone?: string | null;
  }) => void;
  deleteImage: (id: string) => { imagePath: string } | null;
  setImageTags: (id: string, tags: string[]) => void;
  setImageVector: (rowid: number, vector: number[]) => void;
  getImageRowById: (id: string) => ImageRow | null;
  getImageRowidById: (id: string) => number | null;
  getImageRowByFilename: (filename: string) => ImageRow | null;
  listTags: () => string[];
  renameTag: (oldName: string, newName: string) => void;
  resolveTagIds: (names: string[]) => number[];
  getTagIdsByNames: (names: string[]) => number[];
};

const schema = `
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  imagePath TEXT UNIQUE NOT NULL,
  createdAt INTEGER NOT NULL,
  pageUrl TEXT,
  dominantColor TEXT,
  tone TEXT,
  galleryOrder INTEGER
);
CREATE INDEX IF NOT EXISTS idx_images_created ON images(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename);
CREATE INDEX IF NOT EXISTS idx_images_path ON images(imagePath);
CREATE INDEX IF NOT EXISTS idx_images_gallery_order ON images(galleryOrder ASC);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS image_tags (
  imageId TEXT NOT NULL,
  tagId INTEGER NOT NULL,
  PRIMARY KEY (imageId, tagId),
  FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag_image ON image_tags(tagId, imageId);

CREATE VIRTUAL TABLE IF NOT EXISTS images_vss USING vss0(
  vector(768)
);
`;

const normalizeTags = (tags: string[]): string[] => {
  const normalized = tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
  return Array.from(new Set(normalized));
};

const buildTagsMap = (rows: TagRow[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.imageId) ?? [];
    list.push(row.name);
    map.set(row.imageId, list);
  }
  return map;
};

const resolveHasVector = (
  db: Database.Database,
  rowids: number[]
): Set<number> => {
  if (rowids.length === 0) return new Set();
  const placeholders = rowids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT rowid FROM images_vss WHERE rowid IN (${placeholders})`)
    .all(...rowids) as { rowid: number }[];
  return new Set(rows.map((row) => row.rowid));
};

const loadTags = (
  db: Database.Database,
  imageIds: string[]
): Map<string, string[]> => {
  if (imageIds.length === 0) return new Map();
  const placeholders = imageIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT it.imageId, t.name FROM image_tags it JOIN tags t ON t.id = it.tagId WHERE it.imageId IN (${placeholders})`
    )
    .all(...imageIds) as TagRow[];
  return buildTagsMap(rows);
};

const mapImages = (
  db: Database.Database,
  rows: ImageRow[]
): ImageMeta[] => {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const rowids = rows.map((row) => row.rowid);
  const tagsMap = loadTags(db, ids);
  const vectorSet = resolveHasVector(db, rowids);
  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    imagePath: row.imagePath,
    createdAt: row.createdAt,
    pageUrl: row.pageUrl,
    dominantColor: row.dominantColor,
    tone: row.tone,
    tags: tagsMap.get(row.id) ?? [],
    hasVector: vectorSet.has(row.rowid),
  }));
};

// const ensureCompatible = (storageDir: string) => {
//   const dbPath = path.join(storageDir, "meta.sqlite");
//   const metaDir = path.join(storageDir, "meta");
//   const imagesDir = path.join(storageDir, "images");
//   const hasDb = fs.pathExistsSync(dbPath);
//   const metaFiles =
//     fs.pathExistsSync(metaDir) &&
//     fs
//       .readdirSync(metaDir)
//       .some((file) => file.toLowerCase().endsWith(".json"));
//   const imageFiles =
//     fs.pathExistsSync(imagesDir) &&
//     fs.readdirSync(imagesDir).some((file) => file.trim().length > 0);

//   if (!hasDb && (metaFiles || imageFiles)) {
//     throw new StorageIncompatibleError(
//       "Storage format is incompatible. Please reset the data folder."
//     );
//   }
// };

const createImageDb = (db: Database.Database): ImageDb => {
  const insertImageStmt = db.prepare(
    `INSERT INTO images (id, filename, imagePath, createdAt, pageUrl, dominantColor, tone)
     VALUES (@id, @filename, @imagePath, @createdAt, @pageUrl, @dominantColor, @tone)`
  );

  const updateImageStmt = db.prepare(
    `UPDATE images SET
      filename = COALESCE(@filename, filename),
      imagePath = COALESCE(@imagePath, imagePath),
      pageUrl = COALESCE(@pageUrl, pageUrl),
      dominantColor = COALESCE(@dominantColor, dominantColor),
      tone = COALESCE(@tone, tone)
     WHERE id = @id`
  );

  const getImageRowById = (id: string): ImageRow | null => {
    const row = db
      .prepare(
        `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, tone, galleryOrder FROM images WHERE id = ?`
      )
      .get(id) as ImageRow | undefined;
    return row ?? null;
  };

  const getImageRowByFilename = (filename: string): ImageRow | null => {
    const row = db
      .prepare(
        `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, tone, galleryOrder FROM images WHERE filename = ?`
      )
      .get(filename) as ImageRow | undefined;
    return row ?? null;
  };

  const getImageRowidById = (id: string): number | null => {
    const row = db
      .prepare(`SELECT rowid FROM images WHERE id = ?`)
      .get(id) as { rowid?: number } | undefined;
    return typeof row?.rowid === "number" ? row.rowid : null;
  };

  const getImageById = (id: string): ImageMeta | null => {
    const row = getImageRowById(id);
    if (!row) return null;
    return mapImages(db, [row])[0] ?? null;
  };

  const listImages = (): ImageMeta[] => {
    const rows = db
      .prepare(
        `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, tone, galleryOrder FROM images ORDER BY galleryOrder ASC, createdAt DESC`
      )
      .all() as ImageRow[];
    return mapImages(db, rows);
  };

  const listImagesByIds = (ids: string[]): ImageMeta[] => {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, tone, galleryOrder FROM images WHERE id IN (${placeholders})`
      )
      .all(...ids) as ImageRow[];
    const map = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = ids
      .map((id) => map.get(id))
      .filter((row): row is ImageRow => Boolean(row));
    return mapImages(db, orderedRows);
  };

  const insertImage = (data: {
    id: string;
    filename: string;
    imagePath: string;
    createdAt: number;
    pageUrl: string | null;
  }) => {
    const info = insertImageStmt.run({
      ...data,
      dominantColor: null,
      tone: null,
    });
    return { rowid: Number(info.lastInsertRowid) };
  };

  const updateImage = (data: {
    id: string;
    filename?: string;
    imagePath?: string;
    pageUrl?: string | null;
    dominantColor?: string | null;
    tone?: string | null;
  }) => {
    updateImageStmt.run({
      id: data.id,
      filename: data.filename ?? null,
      imagePath: data.imagePath ?? null,
      pageUrl: data.pageUrl ?? null,
      dominantColor: data.dominantColor ?? null,
      tone: data.tone ?? null,
    });
  };

  const deleteImage = (id: string): { imagePath: string } | null => {
    const row = getImageRowById(id);
    if (!row) return null;
    db.prepare(`DELETE FROM images_vss WHERE rowid = ?`).run(row.rowid);
    db.prepare(`DELETE FROM images WHERE id = ?`).run(id);
    db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tagId FROM image_tags)`).run();
    return { imagePath: row.imagePath };
  };

  const resolveTagIds = (names: string[]): number[] => {
    const normalized = normalizeTags(names);
    if (normalized.length === 0) return [];
    const insertStmt = db.prepare(`INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING`);
    const getStmt = db.prepare(`SELECT id FROM tags WHERE name = ?`);
    const tx = db.transaction(() => {
      normalized.forEach((name) => insertStmt.run(name));
      return normalized
        .map((name) => {
          const row = getStmt.get(name) as { id?: number } | undefined;
          return row?.id;
        })
        .filter((id): id is number => typeof id === "number");
    });
    return tx();
  };

  const getTagIdsByNames = (names: string[]): number[] => {
    const normalized = normalizeTags(names);
    if (normalized.length === 0) return [];
    const placeholders = normalized.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT id, name FROM tags WHERE name IN (${placeholders})`)
      .all(...normalized) as { id: number; name: string }[];
    const map = new Map(rows.map((row) => [row.name, row.id]));
    return normalized
      .map((name) => map.get(name))
      .filter((id): id is number => typeof id === "number");
  };

  const setImageTags = (id: string, tags: string[]) => {
    const normalized = normalizeTags(tags);
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM image_tags WHERE imageId = ?`).run(id);
      const tagIds = resolveTagIds(normalized);
      const insertStmt = db.prepare(
        `INSERT OR IGNORE INTO image_tags (imageId, tagId) VALUES (?, ?)`
      );
      tagIds.forEach((tagId) => insertStmt.run(id, tagId));
      db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tagId FROM image_tags)`).run();
    });
    tx();
  };

  const setImageVector = (rowid: number, vector: number[]) => {
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM images_vss WHERE rowid = ?`).run(rowid);
      const normalizedVector = new Float32Array(vector);
      db.prepare(
        `INSERT INTO images_vss (rowid, vector) VALUES (@rowid, @vector)`
      ).run({
        rowid,
        vector: normalizedVector,
      });
    });
    tx();
  };

  const setGalleryOrder = (order: string[]) => {
    const resetStmt = db.prepare(`UPDATE images SET galleryOrder = NULL WHERE galleryOrder IS NOT NULL`);
    const updateStmt = db.prepare(`UPDATE images SET galleryOrder = ? WHERE id = ?`);
    const tx = db.transaction(() => {
      resetStmt.run();
      order.forEach((id, index) => updateStmt.run(index, id));
    });
    tx();
  };

  const moveGalleryOrder = (activeId: string, overId: string) => {
    const tx = db.transaction(() => {
      const hasNull = db.prepare("SELECT 1 FROM images WHERE galleryOrder IS NULL LIMIT 1").get();
      
      if (hasNull) {
        const allImages = db
          .prepare("SELECT id FROM images ORDER BY galleryOrder ASC, createdAt DESC")
          .all() as { id: string }[];
        
        const updateStmt = db.prepare("UPDATE images SET galleryOrder = ? WHERE id = ?");
        allImages.forEach((row, index) => {
          updateStmt.run(index, row.id);
        });
      }

      const getOrderStmt = db.prepare("SELECT galleryOrder FROM images WHERE id = ?");
      const activeRow = getOrderStmt.get(activeId) as { galleryOrder: number } | undefined;
      const overRow = getOrderStmt.get(overId) as { galleryOrder: number } | undefined;

      if (!activeRow || !overRow || activeRow.galleryOrder === null || overRow.galleryOrder === null) {
        return;
      }

      const oldOrder = activeRow.galleryOrder;
      const newOrder = overRow.galleryOrder;

      if (oldOrder === newOrder) return;

      if (oldOrder < newOrder) {
        db.prepare(
          "UPDATE images SET galleryOrder = galleryOrder - 1 WHERE galleryOrder > ? AND galleryOrder <= ?"
        ).run(oldOrder, newOrder);
      } else {
        db.prepare(
          "UPDATE images SET galleryOrder = galleryOrder + 1 WHERE galleryOrder >= ? AND galleryOrder < ?"
        ).run(newOrder, oldOrder);
      }

      db.prepare("UPDATE images SET galleryOrder = ? WHERE id = ?").run(newOrder, activeId);
    });
    tx();
  };

  const listTags = (): string[] => {
    const rows = db.prepare(`SELECT name FROM tags ORDER BY name ASC`).all() as { name: string }[];
    return rows.map((row) => row.name);
  };

  const renameTag = (oldName: string, newName: string) => {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;
    const oldRow = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmedOld) as { id?: number } | undefined;
    if (!oldRow?.id) return;
    const newRow = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmedNew) as { id?: number } | undefined;
    const tx = db.transaction(() => {
      if (newRow?.id) {
        db.prepare(`UPDATE OR IGNORE image_tags SET tagId = ? WHERE tagId = ?`).run(
          newRow.id,
          oldRow.id
        );
        db.prepare(`DELETE FROM tags WHERE id = ?`).run(oldRow.id);
      } else {
        db.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run(trimmedNew, oldRow.id);
      }
      db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tagId FROM image_tags)`).run();
    });
    tx();
  };

  const searchImages = (params: {
    vector?: number[] | null;
    limit?: number;
    offset?: number;
    tagIds?: number[];
    tagCount?: number;
    tone?: string | null;
  }) => {
    const { vector, limit, offset, tagIds, tagCount, tone } = params;
    if (!vector || vector.length === 0) return [];
    const idsJson = JSON.stringify(tagIds ?? []);
    const stmt = db.prepare(
      `
      WITH tag_ids AS (
        SELECT DISTINCT value AS tagId
        FROM json_each(@tagIds)
      ),
      vss_matches AS (
        SELECT rowid, distance
        FROM images_vss
        WHERE vss_search(vector, @vector)
        LIMIT @vssLimit
      )
      SELECT i.rowid, i.id, i.filename, i.imagePath, i.createdAt, i.pageUrl, i.dominantColor, i.tone, i.galleryOrder, v.distance
      FROM vss_matches v
      JOIN images i ON v.rowid = i.rowid
      WHERE (@tone IS NULL OR i.tone = @tone)
        AND (
          @hasTags = 0 OR EXISTS (
            SELECT 1 FROM image_tags it
            WHERE it.imageId = i.id
            AND it.tagId IN (SELECT tagId FROM tag_ids)
            GROUP BY it.imageId
            HAVING COUNT(DISTINCT it.tagId) = @tagCount
          )
        )
      ORDER BY v.distance ASC
      LIMIT @limit OFFSET @offset
    `
    );
    const normalizedVector = new Float32Array(vector);
    const effectiveLimit = typeof limit === "number" && limit > 0 ? limit : 100;
    const effectiveOffset = typeof offset === "number" && offset >= 0 ? offset : 0;
    const rows = stmt.all({
      vector: normalizedVector,
      tagIds: idsJson,
      hasTags: tagIds && tagIds.length > 0 ? 1 : 0,
      tagCount: tagCount ?? 0,
      limit: effectiveLimit,
      offset: effectiveOffset,
      vssLimit: effectiveLimit + effectiveOffset, // VSS search needs to find enough candidates
      tone: tone ?? null,
    }) as (ImageRow & { distance: number })[];
    const metas = mapImages(db, rows);
    const scores = new Map(rows.map((row) => [row.id, row.distance]));
    return metas.map((meta) => {
      const distance = scores.get(meta.id);
      const score = typeof distance === "number" ? 1 - distance : undefined;
      return score !== undefined ? { ...meta, score } : meta;
    });
  };

  const searchImagesByText = (params: {
    query: string;
    limit?: number;
    offset?: number;
    tagIds?: number[];
    tagCount?: number;
    tone?: string | null;
  }) => {
    const { query, limit, offset, tagIds, tagCount, tone } = params;
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return [];

    const idsJson = JSON.stringify(tagIds ?? []);

    // Build dynamic SQL for text search
    const textConditions = tokens
      .map(
        (_, i) =>
          `(lower(i.filename) LIKE @token${i} OR lower(i.imagePath) LIKE @token${i})`
      )
      .join(" AND ");

    const sql = `
      WITH tag_ids AS (
        SELECT DISTINCT value AS tagId
        FROM json_each(@tagIds)
      )
      SELECT i.rowid, i.id, i.filename, i.imagePath, i.createdAt, i.pageUrl, i.dominantColor, i.tone, i.galleryOrder
      FROM images i
      WHERE (@tone IS NULL OR i.tone = @tone)
        AND (
          @hasTags = 0 OR EXISTS (
            SELECT 1 FROM image_tags it
            WHERE it.imageId = i.id
            AND it.tagId IN (SELECT tagId FROM tag_ids)
            GROUP BY it.imageId
            HAVING COUNT(DISTINCT it.tagId) = @tagCount
          )
        )
        AND (${textConditions})
      ORDER BY i.createdAt DESC
      LIMIT @limit OFFSET @offset
    `;

    const stmt = db.prepare(sql);

    const queryParams: Record<string, unknown> = {
      tagIds: idsJson,
      hasTags: tagIds && tagIds.length > 0 ? 1 : 0,
      tagCount: tagCount ?? 0,
      limit: typeof limit === "number" && limit > 0 ? limit : 100,
      offset: typeof offset === "number" && offset >= 0 ? offset : 0,
      tone: tone ?? null,
    };

    tokens.forEach((token, i) => {
      queryParams[`token${i}`] = `%${token}%`;
    });

    const rows = stmt.all(queryParams) as ImageRow[];
    return mapImages(db, rows);
  };

  return {
    getImageById,
    listImages,
    listImagesByIds,
    setGalleryOrder,
    moveGalleryOrder,
    searchImages,
    searchImagesByText,
    insertImage,
    updateImage,
    deleteImage,
    setImageTags,
    setImageVector,
    getImageRowById,
    getImageRowidById,
    getImageRowByFilename,
    listTags,
    renameTag,
    resolveTagIds,
    getTagIdsByNames,
  };
};

export const createDatabase = (
  storageDir: string
): { db: Database.Database; imageDb: ImageDb; incompatibleError: StorageIncompatibleError | null } => {
  // let incompatibleError: StorageIncompatibleError | null = null;
  // try {
  //   ensureCompatible(storageDir);
  // } catch (error) {
  //   if (error instanceof StorageIncompatibleError) {
  //     incompatibleError = error;
  //   } else {
  //     throw error;
  //   }
  // }
  const dbPath = path.join(storageDir, "meta.sqlite");
  const db = new Database(dbPath);
  loadVss(db);
  db.pragma("journal_mode = WAL");
  db.exec(schema);
  return { db, imageDb: createImageDb(db), incompatibleError: null };
};
