import { type ImageMeta } from '../store/canvasStore';
import { localApi } from '../service';

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const uploadTempImage = async (
  file: File,
  canvasName?: string
): Promise<{
  filename: string;
  path: string;
  width: number;
  height: number;
  dominantColor?: string | null;
  tone?: string | null;
} | null> => {
  const imageBase64 = await fileToDataUrl(file);
  if (!imageBase64) return null;

  const data = await localApi<{
    success?: boolean;
    filename?: string;
    path?: string;
    width?: number;
    height?: number;
    dominantColor?: string | null;
    tone?: string | null;
  }>('/api/upload-temp', {
    imageBase64,
    filename: file.name,
    canvasName,
  });
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
    width: data.width || 0,
    height: data.height || 0,
    dominantColor: data.dominantColor ?? null,
    tone: data.tone ?? null,
  };
};

export const scanDroppedItems = async (dataTransfer: DataTransfer): Promise<File[]> => {
  const items = Array.from(dataTransfer.items);
  const files: File[] = [];

  const scanEntry = async (entry: FileSystemEntry) => {
    if (entry.isFile) {
      try {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        files.push(file);
      } catch (e) {
        console.error('Failed to read file entry', entry.name, e);
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
        for (const e of entries) {
          await scanEntry(e);
        }
      } catch (e) {
        console.error('Failed to read directory entry', entry.name, e);
      }
    }
  };

  for (const item of items) {
    const entry = item.webkitGetAsEntry();
    if (entry) {
      await scanEntry(entry);
    }
  }
  return files;
};

export const createTempMetasFromFiles = async (
  files: File[],
  canvasName?: string
): Promise<ImageMeta[]> => {
  const metas: ImageMeta[] = [];

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const uploaded = await uploadTempImage(file, canvasName);
      if (!uploaded) continue;
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
      
      metas.push(meta);
    } catch (e) {
      console.error('Error creating temp meta', file.name, e);
    }
  }

  return metas;
};
