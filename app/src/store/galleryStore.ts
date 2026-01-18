import { proxy } from 'valtio';
import { fileStorage, saveGalleryOrder } from '../service';
import { canvasActions } from './canvasStore';
import { API_BASE_URL } from '../config';

export interface ImageMeta {
  image: string; // "images/foo.jpg"
  pageUrl?: string;
  tags: string[];
  createdAt: number;
  vector?: number[] | null;
  dominantColor?: string | null;
  tone?: string | null;
}

export const getImageUrl = (imagePath: string) => {
  if (imagePath.startsWith('images/')) {
    return `${API_BASE_URL}/images/${imagePath}`;
  }
  return `${API_BASE_URL}/${imagePath}`;
};

export interface SearchResult extends ImageMeta {
  score: number;
  matchedType: string;
}

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
  grayscale?: boolean;
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
  image?: string;
  dominantColor?: string | null;
  tone?: string | null;
  grayscale?: boolean;
  
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
  // If input is a path like "images/foo.jpg", extract basename first
  const baseName = trimmed.split(/[\\/]/).pop() || trimmed;
  const dot = baseName.lastIndexOf('.');
  const withoutExt = dot <= 0 ? baseName : baseName.slice(0, dot) || baseName;
  if (withoutExt.startsWith('EMPTY_NAME_')) return '';
  return withoutExt;
};

export type GallerySort = 'manual' | 'createdAtDesc';

interface AppState {
  images: ImageMeta[];
  allImages: ImageMeta[];
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
  allImages: [],
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
      const [rawTagSortOrder, rawGallerySort] = await Promise.all([
        fileStorage.get<unknown>({
          key: 'tagSortOrder',
          fallback: [],
        }),
        fileStorage.get<unknown>({
          key: 'gallerySort',
          fallback: state.gallerySort,
        }),
      ]);

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
    return {
      image: file.storedFilename, // e.g. "images/foo.jpg"
      pageUrl: undefined,
      tags: [],
      createdAt: Date.now(),
      dominantColor: file.dominantColor ?? null,
      tone: file.tone ?? null,
      vector: null,
    };
  },

  setTagSortOrder: (order: string[]) => {
    state.tagSortOrder = order;
    void fileStorage.set('tagSortOrder', order);
  },

  setGallerySort: (sort: GallerySort) => {
    state.gallerySort = sort;
    void fileStorage.set('gallerySort', sort);
  },

  setImages: (images: ImageMeta[]) => {
    state.images = images.map((i) => ({ ...i }));
  },

  setAllImages: (images: ImageMeta[]) => {
    const next = images.map((i) => ({ ...i }));
    state.allImages = next;
    if (
      !state.searchQuery &&
      state.searchTags.length === 0 &&
      !state.searchColor &&
      !state.searchTone
    ) {
      state.images = next.map((i) => ({ ...i }));
    }
  },

  saveGalleryOrder: async (images: ImageMeta[]) => {
    const order = images.map((img) => img.image);
    await saveGalleryOrder(order);
  },

  reorderImages: (images: ImageMeta[]) => {
    const next = images.map((i) => ({ ...i }));
    state.allImages = next;
    if (
      !state.searchQuery &&
      state.searchTags.length === 0 &&
      !state.searchColor &&
      !state.searchTone
    ) {
      state.images = next.map((i) => ({ ...i }));
    }
    actions.saveGalleryOrder(next);
  },
  
  addImage: (image: ImageMeta) => {
    const existingIndex = state.images.findIndex(i => i.image === image.image);
    if (existingIndex >= 0) {
      Object.assign(state.images[existingIndex], image);
    } else {
      state.images.unshift(image);
    }
    const existingAllIndex = state.allImages.findIndex(i => i.image === image.image);
    if (existingAllIndex >= 0) {
      Object.assign(state.allImages[existingAllIndex], image);
    } else {
      state.allImages.unshift(image);
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

  deleteImage: (image: string) => {
    const index = state.images.findIndex(img => img.image === image);
    if (index !== -1) {
      state.images.splice(index, 1);
    }
    const allIndex = state.allImages.findIndex(img => img.image === image);
    if (allIndex !== -1) {
      state.allImages.splice(allIndex, 1);
    }
    canvasActions.removeImageFromCanvas(image);
  },

  updateImage: (image: string, updates: Partial<ImageMeta>) => {
    const index = state.images.findIndex((img) => img.image === image);
    if (index !== -1) {
      Object.assign(state.images[index], updates);
    }
    const allIndex = state.allImages.findIndex((img) => img.image === image);
    if (allIndex !== -1) {
      Object.assign(state.allImages[allIndex], updates);
    }
  },
};
