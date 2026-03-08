import { type ImageMeta } from '../store/canvasStore';
import { uploadTempImageBinary } from '../service';
import { globalActions } from '../store/globalStore';

const MAX_DROP_SCAN_CONCURRENCY = 16;
const MAX_UPLOAD_CONCURRENCY = 16;

type ImageImportLogLevel = 'info' | 'warn' | 'error';
type ImageImportSource = 'drop' | 'paste' | 'drop-url';

interface CreateTempMetasOptions {
  canvasName?: string;
  source: ImageImportSource;
}

const clampInt = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
};

const getHardwareConcurrency = () => {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  return 8;
};

const getDropScanConcurrency = (workItems: number) => {
  const hw = getHardwareConcurrency();
  const base = clampInt(hw, 4, MAX_DROP_SCAN_CONCURRENCY);
  return clampInt(Math.min(base, Math.max(1, workItems)), 1, MAX_DROP_SCAN_CONCURRENCY);
};

const getUploadConcurrency = (workItems: number) => {
  const hw = getHardwareConcurrency();
  const base = clampInt(hw, 4, MAX_UPLOAD_CONCURRENCY);
  return clampInt(Math.min(base, Math.max(1, workItems)), 1, MAX_UPLOAD_CONCURRENCY);
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const logImageImport = (
  level: ImageImportLogLevel,
  message: string,
  payload?: Record<string, unknown>,
) => {
  if (typeof window === 'undefined') return;
  try {
    window.electron?.log?.(level, '[image-import]', message, payload ?? {});
  } catch {
    // 日志失败不能影响导入主流程。
  }
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const limit = Math.max(1, Math.floor(concurrency || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const uploadTempImage = async (
  file: File,
  canvasName?: string
): Promise<{
  filename: string;
  path: string;
  diskPath?: string;
  width: number;
  height: number;
  dominantColor?: string | null;
  tone?: string | null;
} | null> => {
  const data = await uploadTempImageBinary(file, canvasName);
  if (
    !data ||
    !data.success ||
    typeof data.filename !== 'string' ||
    typeof data.path !== 'string'
  ) {
    return null;
  }
  return {
    filename: data.filename,
    path: data.path,
    diskPath: typeof data.diskPath === 'string' ? data.diskPath : undefined,
    width: data.width || 0,
    height: data.height || 0,
    dominantColor: data.dominantColor ?? null,
    tone: data.tone ?? null,
  };
};

export const scanDroppedItems = async (dataTransfer: DataTransfer): Promise<File[]> => {
  const items = Array.from(dataTransfer.items);

  const scanEntry = async (entry: FileSystemEntry): Promise<File[]> => {
    if (entry.isFile) {
      try {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        return [file];
      } catch (e) {
        console.error('Failed to read file entry', entry.name, e);
        logImageImport('error', 'read dropped file entry failed', {
          entryName: entry.name,
          error: getErrorMessage(e),
        });
        return [];
      }
    } else if (entry.isDirectory) {
      try {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readAllEntries = async (): Promise<FileSystemEntry[]> => {
          const entries: FileSystemEntry[] = [];
          let batch: FileSystemEntry[] = [];
          do {
            batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
              reader.readEntries(resolve, reject);
            });
            entries.push(...batch);
          } while (batch.length > 0);
          return entries;
        };
        
        const entries = await readAllEntries();
        const lists = await mapWithConcurrency(
          entries,
          getDropScanConcurrency(entries.length),
          async (child) => scanEntry(child),
        );
        return lists.flat();
      } catch (e) {
        console.error('Failed to read directory entry', entry.name, e);
        logImageImport('error', 'read dropped directory entry failed', {
          entryName: entry.name,
          error: getErrorMessage(e),
        });
        return [];
      }
    }
    return [];
  };

  const entries = items
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  const lists = await mapWithConcurrency(
    entries,
    getDropScanConcurrency(entries.length),
    async (entry) => scanEntry(entry),
  );
  return lists.flat();
};

export const createTempMetasFromFiles = async (
  files: File[],
  options: CreateTempMetasOptions,
): Promise<ImageMeta[]> => {
  const { canvasName, source } = options;
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));

  if (imageFiles.length > 0) {
    globalActions.beginUploadProgress(imageFiles.length);
    logImageImport('info', 'image import started', {
      source,
      canvasName: canvasName ?? '',
      total: imageFiles.length,
    });
  }

  const results = await mapWithConcurrency(
    imageFiles,
    getUploadConcurrency(imageFiles.length),
    async (file) => {
      try {
        const uploaded = await uploadTempImage(file, canvasName);
        if (!uploaded) {
          globalActions.tickUploadProgress({ completed: 1, failed: 1 });
          logImageImport('warn', 'image import returned empty result', {
            source,
            canvasName: canvasName ?? '',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          });
          return null;
        }
        const meta: ImageMeta = {
          id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          filename: uploaded.filename,
          imagePath: uploaded.path,
          tags: [],
          createdAt: Date.now(),
          dominantColor: uploaded.dominantColor ?? null,
          tone: uploaded.tone ?? null,
          hasVector: false,
          width: uploaded.width,
          height: uploaded.height,
        };
        globalActions.tickUploadProgress({ completed: 1 });
        return meta;
      } catch (e) {
        console.error('Error creating temp meta', file.name, e);
        globalActions.tickUploadProgress({ completed: 1, failed: 1 });
        logImageImport('error', 'image import failed', {
          source,
          canvasName: canvasName ?? '',
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          error: getErrorMessage(e),
        });
        return null;
      }
    },
  );

  const metas = results.filter((m): m is ImageMeta => m !== null);
  if (imageFiles.length > 0) {
    logImageImport('info', 'image import completed', {
      source,
      canvasName: canvasName ?? '',
      total: imageFiles.length,
      succeeded: metas.length,
      failed: imageFiles.length - metas.length,
    });
  }
  return metas;
};
