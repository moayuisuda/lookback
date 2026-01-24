import { proxy } from 'valtio';
import {
  settingStorage,
  getSettingsSnapshot,
  readSetting,
  saveGalleryOrder,
} from '../service';
import { canvasActions } from './canvasStore';
import { API_BASE_URL } from '../config';

export interface ImageMeta {
  id: string;
  filename: string;
  imagePath: string;
  pageUrl?: string | null;
  tags: string[];
  createdAt: number;
  dominantColor?: string | null;
  tone?: string | null;
  hasVector?: boolean;
  isVectorResult?: boolean;
}

export type SearchResult = ImageMeta & {
  score?: number;
};

export const getImageUrl = (imagePath: string) => {
  if (imagePath.startsWith('images/')) {
    return `${API_BASE_URL}/images/${imagePath}`;
  }
  return `${API_BASE_URL}/${imagePath}`;
};

export interface CanvasText {
  type: 'text';
  canvasId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  scaleX?: number;
  text: string;
  fontSize: number;
  fill: string;
  width?: number;
  height?: number;
  align?: string;
}

export interface CanvasImage extends ImageMeta {
  type: 'image';
  canvasId: string;
  x: number;
  y: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  rotation: number;
  width?: number;
  height?: number;
  grayscale?: boolean; // Deprecated
  filters?: string[];
}

export type CanvasItem = CanvasImage | CanvasText;

export interface CanvasPersistedItem {
  type: 'image' | 'text';
  kind?: 'ref' | 'temp';
  canvasId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  
  // Image specific
  imageId?: string;
  imagePath?: string;
  dominantColor?: string | null;
  tone?: string | null;
  grayscale?: boolean; // Deprecated
  filters?: string[];
  
  // Temp image specific
  // name, localPath removed
  pageUrl?: string;
  tags?: string[];
  createdAt?: number;

  // Text specific
  text?: string;
  fontSize?: number;
  fill?: string;
  align?: string;
}

export const deriveNameFromFilename = (filename: string): string => {
  const trimmed = filename.trim();
  if (!trimmed) return 'image';
  const baseName = trimmed.split(/[\\/]/).pop() || trimmed;
  const dot = baseName.lastIndexOf('.');
  const withoutExt = dot <= 0 ? baseName : baseName.slice(0, dot) || baseName;
  if (withoutExt.startsWith('EMPTY_NAME_')) return '';
  return withoutExt;
};

export type GallerySort = 'manual' | 'createdAtDesc';

interface AppState {
  images: ImageMeta[];
  searchQuery: string;
  searchTags: string[];
  searchColor: string | null;
  searchTone: string | null;
  searchImage: ImageMeta | null;

  tagSortOrder: string[];
  gallerySort: GallerySort;
}

export const state = proxy<AppState>({
  images: [],
  searchQuery: '',
  searchTags: [],
  searchColor: null,
  searchTone: null,
  searchImage: null,
  tagSortOrder: [],
  gallerySort: 'manual',
});

export const actions = {
  hydrateSettings: async () => {
    try {
      const settings = await getSettingsSnapshot();
      const rawTagSortOrder = readSetting<unknown>(settings, 'tagSortOrder', []);
      const rawGallerySort = readSetting<unknown>(
        settings,
        'gallerySort',
        state.gallerySort,
      );

      if (
        Array.isArray(rawTagSortOrder) &&
        rawTagSortOrder.every((i) => typeof i === 'string')
      ) {
        state.tagSortOrder = rawTagSortOrder;
      }

      if (typeof rawGallerySort === 'string') {
        const allowed: GallerySort[] = ['manual', 'createdAtDesc'];
        if (allowed.includes(rawGallerySort as GallerySort)) {
          state.gallerySort = rawGallerySort as GallerySort;
        }
      }
    } catch (error) {
      console.error('Failed to hydrate settings:', error);
    }
  },

  createDropBatchId: () => {
    return `drop_${Date.now()}`;
  },

  createDroppedImageMeta: (
    file: {
      path?: string;
      storedFilename: string;
      originalName: string;
      dominantColor?: string | null;
      tone?: string | null;
    }
  ): ImageMeta => {
    const name = file.originalName.trim() || 'image';
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    return {
      id: `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      filename: base,
      imagePath: file.storedFilename,
      pageUrl: undefined,
      tags: [],
      createdAt: Date.now(),
      dominantColor: file.dominantColor ?? null,
      tone: file.tone ?? null,
      hasVector: false,
    };
  },

  setTagSortOrder: (order: string[]) => {
    state.tagSortOrder = order;
    void settingStorage.set('tagSortOrder', order);
  },

  setGallerySort: (sort: GallerySort) => {
    state.gallerySort = sort;
    void settingStorage.set('gallerySort', sort);
  },

  setImages: (images: ImageMeta[]) => {
    state.images = images.map((i) => ({ ...i }));
  },

  appendImages: (images: ImageMeta[]) => {
    const newImages = images.map((i) => ({ ...i }));
    // Avoid duplicates
    const existingIds = new Set(state.images.map((i) => i.id));
    for (const img of newImages) {
      if (!existingIds.has(img.id)) {
        state.images.push(img);
      }
    }
  },

  mergeImages: (images: ImageMeta[]) => {
    const newImages = images.map((i) => ({ ...i }));
    const imageMap = new Map(state.images.map((i) => [i.id, i]));
    
    for (const img of newImages) {
      if (imageMap.has(img.id)) {
        const existing = imageMap.get(img.id)!;
        if (!existing.isVectorResult && img.isVectorResult) {
          Object.assign(existing, { ...img, isVectorResult: existing.isVectorResult });
        } else {
          Object.assign(existing, img);
        }
      } else {
        state.images.push(img);
        imageMap.set(img.id, img);
      }
    }
  },

  saveGalleryOrder: async (images: ImageMeta[]) => {
    const order = images.map((img) => img.id);
    await saveGalleryOrder(order);
  },

  reorderImages: (images: ImageMeta[]) => {
    const next = images.map((i) => ({ ...i }));
    state.images = next;
    actions.saveGalleryOrder(next);
  },
  
  addImage: (image: ImageMeta) => {
    const existingIndex = state.images.findIndex(i => i.id === image.id);
    if (existingIndex >= 0) {
      Object.assign(state.images[existingIndex], image);
    } else {
      state.images.unshift(image);
    }
  },
  
  setSearchQuery: (query: string) => {
    state.searchQuery = query;
  },

  setSearchTags: (tags: string[]) => {
    state.searchTags = tags;
  },

  setSearchColor: (color: string | null) => {
    state.searchColor = color && color.trim() ? color.trim() : null;
  },
  
  setSearchTone: (tone: string | null) => {
    state.searchTone = tone && tone.trim() ? tone.trim() : null;
  },

  setSearchImage: (image: ImageMeta | null) => {
    state.searchImage = image;
  },

  deleteImage: (imageId: string) => {
    const index = state.images.findIndex(img => img.id === imageId);
    if (index !== -1) {
      state.images.splice(index, 1);
    }
    canvasActions.removeImageFromCanvas(imageId);
  },

  updateImage: (imageId: string, updates: Partial<ImageMeta>) => {
    const index = state.images.findIndex((img) => img.id === imageId);
    if (index !== -1) {
      Object.assign(state.images[index], updates);
    }
  },
};
