import React, { useEffect, useMemo, useState, useRef } from "react";
import Masonry from "react-masonry-css";
import { globalActions, globalState } from "../store/globalStore";
import { state as galleryState, actions, type GallerySort, getImageUrl, type SearchResult } from "../store/galleryStore";
import type { ImageMeta } from "../store/galleryStore";
import { useSnapshot } from "valtio";
import { debounce } from "radash";
import { Tag } from "./Tag";
import { THEME } from "../theme";
import { SortableGalleryItem } from "./gallery/GalleryItem";
import { importFiles, scanDroppedItems } from "../utils/import";
import { localApi } from "../service";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { API_BASE_URL } from "../config";
import { Swatch } from "./gallery/Swatch";
import { ColorInput } from "./gallery/ColorInput";
import { DragOverlayItem } from "./gallery/DragOverlayItem";
import {
  GalleryContextMenu,
  type ContextMenuState,
} from "./gallery/GalleryContextMenu";
import { GalleryEmptyState } from "./gallery/EmptyState";
import { GalleryHeader } from "./gallery/GalleryHeader";
import { onOpenTagColorPicker } from "../events/uiEvents";
import { useT } from "../i18n/useT";

const ensureTags = (tags: string[] | undefined | null): string[] =>
  Array.isArray(tags) ? tags : [];

const POPOVER_WIDTH = 248;

const clampPopover = (x: number, y: number) => {
  const nextX = Math.min(
    Math.max(12, x),
    window.innerWidth - POPOVER_WIDTH - 12
  );
  const nextY = Math.max(12, y);
  return { x: nextX, y: nextY };
};

const sortImagesForGallery = (
  images: ImageMeta[],
  sort: GallerySort,
  allImages: ImageMeta[]
) => {
  // Check if images have score (search results)
  const hasScore = images.length > 0 && "score" in images[0];
  if (hasScore) {
    return [...images].sort((a, b) => {
      const scoreA = (a as SearchResult).score || 0;
      const scoreB = (b as SearchResult).score || 0;
      return scoreB - scoreA;
    });
  }

  if (sort === "createdAtDesc") {
    return [...images].sort((a, b) => b.createdAt - a.createdAt);
  }
  if (!allImages.length || !images.length) {
    return images;
  }
  const indexMap = new Map(allImages.map((image, index) => [image.image, index]));
  return [...images].sort((a, b) => {
    const indexA = indexMap.get(a.image);
    const indexB = indexMap.get(b.image);
    if (indexA === undefined && indexB === undefined) return 0;
    if (indexA === undefined) return 1;
    if (indexB === undefined) return -1;
    return indexA - indexB;
  });
};

export const Gallery: React.FC = () => {
  const snap = useSnapshot(galleryState);
  const appSnap = useSnapshot(globalState);
  const { t } = useT();

  const [loading, setLoading] = useState(false);
  const [enableVectorSearch, setEnableVectorSearch] = useState(false);

  // Load enableVectorSearch
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/settings`)
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.enableVectorSearch === "boolean") {
          setEnableVectorSearch(data.enableVectorSearch);
        }
      })
      .catch((err) => console.error("Failed to load settings in Gallery", err));
  }, []);

  // Drag Overlay State
  const [activeImage, setActiveImage] = useState<ImageMeta | null>(null);
  const [activeSize, setActiveSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeTagSize, setActiveTagSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const dragOverlay = useMemo(() => {
    if (activeImage && activeSize) {
      return {
        size: activeSize,
        className: "rounded overflow-hidden shadow-2xl opacity-90",
        content: (
          <img
            src={getImageUrl(activeImage.image)}
            className="w-full h-full object-cover bg-neutral-800"
            alt=""
          />
        ),
      };
    }

    if (activeTag) {
      return {
        size: activeTagSize,
        className: "opacity-95",
        content: <Tag tag={activeTag} showColor={false} size="md" />,
      };
    }

    return null;
  }, [activeImage, activeSize, activeTag, activeTagSize]);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [tagColorPicker, setTagColorPicker] = useState<{
    tag: string;
    x: number;
    y: number;
  } | null>(null);

  const [dominantColorPicker, setDominantColorPicker] = useState<{
    image: string;
    x: number;
    y: number;
    draft: string;
  } | null>(null);

  // Dynamic Columns
  const galleryRef = useRef<HTMLDivElement>(null);
  const latestSearchIdRef = useRef<string>("");
  const loadingTimeoutRef = useRef<number | null>(null);
  const [columnCount, setColumnCount] = useState(2);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    return onOpenTagColorPicker(({ tag, x, y }) => {
      const next = clampPopover(x, y + 8);
      setTagColorPicker({ tag, x: next.x, y: next.y });
    });
  }, []);

  useEffect(() => {
    if (!galleryRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // Calculate columns based on width.
        // Assuming ~120px per column is a good size to ensure 2 columns at default width (250px)
        const cols = Math.max(1, Math.floor(width / 120));
        setColumnCount(cols);
      }
    });
    observer.observe(galleryRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const cleanup = window.electron?.onSearchUpdated((payload) => {
      if (!payload || typeof payload !== "object") return;
      const { searchId, results } = payload as {
        searchId?: unknown;
        results?: unknown;
      };
      if (typeof searchId !== "string") return;
      if (searchId !== latestSearchIdRef.current) return;
      if (Array.isArray(results)) {
        actions.setImages(results as ImageMeta[]);
        if (loadingTimeoutRef.current !== null) {
          window.clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setLoading(false);
      }
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      if (loadingTimeoutRef.current !== null) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setLoading(false);

      const query = snap.searchQuery.trim();
      const searchTags = snap.searchTags;
      const hasTags = searchTags.length > 0;
      const searchColor = snap.searchColor;
      const hasColor = Boolean(searchColor);
      const searchTone = snap.searchTone;
      const hasTone = Boolean(searchTone);

      if (!query && !hasTags && !hasColor && !hasTone) {
        latestSearchIdRef.current = "";
        if (loadingTimeoutRef.current !== null) {
          window.clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setLoading(false);
        actions.setImages(snap.allImages as ImageMeta[]);
        return;
      }

      try {
        const isVectorSearch = Boolean(query);
        const searchId = `search_${Date.now()}_${Math.random()
          .toString(16)
          .slice(2)}`;
        latestSearchIdRef.current = searchId;

        loadingTimeoutRef.current = window.setTimeout(() => {
          if (
            latestSearchIdRef.current === searchId &&
            !controller.signal.aborted
          ) {
            setLoading(true);
          }
        }, 100);

        const res = await fetch(`${API_BASE_URL}/api/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            searchId,
            query,
            tags: searchTags,
            tagMatch: hasTags ? "strict" : "contains",
            color: searchColor,
            tone: searchTone,
            limit: 100,
            threshold: appSnap.vectorSearchThreshold,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          if (res.status === 409) {
            const payload = (await res.json().catch(() => null)) as {
              code?: unknown;
            } | null;
            if (payload && payload.code === "STORAGE_INCOMPATIBLE") {
              globalActions.pushToast(
                { key: "toast.storageIncompatible" },
                "error",
              );
              return;
            }
          }
          throw new Error(`Search failed with status ${res.status}`);
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          actions.setImages(data);
        }
        if (!isVectorSearch && !controller.signal.aborted) {
          if (loadingTimeoutRef.current !== null) {
            window.clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          setLoading(false);
        }
      } catch {
        if (controller.signal.aborted) return;
        if (loadingTimeoutRef.current !== null) {
          window.clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setLoading(false);
      }
    };

    void run();

    return () => {
      controller.abort();
      if (loadingTimeoutRef.current !== null) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [snap.searchQuery, snap.searchTags, snap.searchColor, snap.searchTone, snap.allImages, appSnap.vectorSearchThreshold]);

  useEffect(() => {
    // Paste handler removed in favor of App.tsx unified handler
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    snap.allImages.forEach((img) => {
      ensureTags(img.tags as string[]).forEach((t) => set.add(t));
    });
    const unsorted = Array.from(set.values());
    const order = snap.tagSortOrder || [];
    const orderMap = new Map(order.map((t, i) => [t, i]));

    return unsorted.sort((a, b) => {
      const indexA = orderMap.has(a) ? orderMap.get(a)! : 999999;
      const indexB = orderMap.has(b) ? orderMap.get(b)! : 999999;
      if (indexA !== indexB) return indexA - indexB;
      return a.localeCompare(b);
    });
  }, [snap.allImages, snap.tagSortOrder]);

  // Auto-remove cleaned up tags from search bar
  useEffect(() => {
    if (snap.searchTags.length === 0) return;

    const validTags = snap.searchTags.filter((t) => allTags.includes(t));

    if (validTags.length !== snap.searchTags.length) {
      actions.setSearchTags(validTags);
    }
  }, [allTags, snap.allImages, snap.searchTags]);

  const sortedImages = useMemo(
    () =>
      sortImagesForGallery(
        snap.images as ImageMeta[],
        snap.gallerySort,
        snap.allImages as ImageMeta[]
      ),
    [snap.images, snap.gallerySort, snap.allImages]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = active.id as string;

    if (allTags.includes(activeId)) {
      // Tag 使用 DragOverlay，尺寸从 active rect 读取，避免依赖 DOM id（Tag 名可能包含空格）
      setActiveTag(activeId);

      const rect = event.active.rect.current;
      const width = rect?.initial?.width ?? rect?.translated?.width;
      const height = rect?.initial?.height ?? rect?.translated?.height;
      if (typeof width === "number" && typeof height === "number") {
        setActiveTagSize({ width, height });
      } else {
        setActiveTagSize(null);
      }
      return;
    }

    const image = snap.allImages.find((i) => i.image === active.id);
    if (image) {
      setActiveImage(image as unknown as ImageMeta);
      const el = document.getElementById(active.id as string);
      if (el) {
        setActiveSize({ width: el.offsetWidth, height: el.offsetHeight });
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, activatorEvent, delta } = event;

    setActiveImage(null);
    setActiveSize(null);
    setActiveTag(null);
    setActiveTagSize(null);

    const galleryEl = galleryRef.current;

    // Calculate final pointer position
    let pointerX = 0;
    let pointerY = 0;
    let hasPointer = false;

    if (activatorEvent instanceof MouseEvent) {
      pointerX = activatorEvent.clientX + delta.x;
      pointerY = activatorEvent.clientY + delta.y;
      hasPointer = true;
    } else if (window.TouchEvent && activatorEvent instanceof TouchEvent) {
      const touch = activatorEvent.changedTouches[0];
      if (touch) {
        pointerX = touch.clientX + delta.x;
        pointerY = touch.clientY + delta.y;
        hasPointer = true;
      }
    }

    // Check if dragged out to Canvas (right side)
    // Use pointer position instead of item rect center for better responsiveness
    if (galleryEl && hasPointer) {
      const rect = galleryEl.getBoundingClientRect();

      if (pointerX > rect.right) {
        const image = snap.allImages.find((i) => i.image === active.id);
        if (image) {
          window.dispatchEvent(
            new CustomEvent("canvas-drop-request", {
              detail: {
                image: image as unknown as ImageMeta,
                x: pointerX,
                y: pointerY,
              },
            })
          );
          return;
        }
      }
    }

    if (!over || active.id === over.id) return;

    if (allTags.includes(active.id as string)) {
      const oldIndex = allTags.indexOf(active.id as string);
      const newIndex = allTags.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(allTags, oldIndex, newIndex);
      actions.setTagSortOrder(newOrder);
    } else {
      const oldIndexAll = snap.allImages.findIndex((i) => i.image === active.id);
      const newIndexAll = snap.allImages.findIndex((i) => i.image === over.id);

      if (oldIndexAll === -1 || newIndexAll === -1) {
        return;
      }

      const currentAllImages = [...snap.allImages];
      const newAllImages = arrayMove(
        currentAllImages,
        oldIndexAll,
        newIndexAll
      );
      actions.reorderImages(newAllImages as ImageMeta[]);
    }
  };

  const handleNativeDragStart = (e: React.DragEvent, image: ImageMeta) => {
    e.dataTransfer.setData("application/json", JSON.stringify(image));
  };

  const handleContextMenu = (e: React.MouseEvent, image: ImageMeta) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, image });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleUpdateDominantColor = async (
    image: ImageMeta,
    dominantColor: string | null
  ) => {
    try {
      await localApi<unknown>("/api/update-dominant-color", {
        image: image.image,
        dominantColor,
      });
      actions.updateImage(image.image, { dominantColor });
      if (contextMenu && contextMenu.image.image === image.image) {
        setContextMenu({
          ...contextMenu,
          image: { ...image, dominantColor },
        });
      }
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.updateDominantColorFailed" }, "error");
    }
  };

  const handleUpdateDominantColorRef = useRef(handleUpdateDominantColor);
  handleUpdateDominantColorRef.current = handleUpdateDominantColor;

  const debouncedUpdateDominantColor = useMemo(
    () =>
      debounce({ delay: 150 }, (imagePath: string, color: string) => {
        const image =
          galleryState.allImages.find((i) => i.image === imagePath) ||
          galleryState.images.find((i) => i.image === imagePath) ||
          contextMenu?.image;
        if (!image || image.image !== imagePath) return;
        void handleUpdateDominantColorRef.current(image as ImageMeta, color);
      }),
    [contextMenu]
  );

  const handleUpdateName = async (image: ImageMeta, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Cannot optimistic update name as it changes the ID (image path)
    // We wait for server response

    try {
      const data = await localApi<{
        success?: boolean;
        meta?: ImageMeta;
      }>("/api/update-name", {
        image: image.image,
        name: trimmed,
      });
      if (data && data.success && data.meta) {
        actions.updateImage(image.image, data.meta);
        if (contextMenu && contextMenu.image.image === image.image) {
          setContextMenu({
            ...contextMenu,
            image: data.meta,
          });
        }
      } else {
        globalActions.pushToast({ key: "toast.updateNameFailed" }, "error");
      }
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.updateNameFailed" }, "error");
    }
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    try {
      await localApi<unknown>("/api/delete", {
        image: contextMenu.image.image,
      });
      actions.deleteImage(contextMenu.image.image);
      globalActions.pushToast({ key: "toast.imageDeleted" }, "success");
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.deleteImageFailed" }, "error");
    }
    closeContextMenu();
  };

  const handleReindex = async () => {
    if (!contextMenu) return;
    try {
      const data = await localApi<{
        success?: boolean;
        meta?: { vector?: number[] | null };
      }>("/api/reindex", {
        image: contextMenu.image.image,
      });

      if (data && data.success && data.meta) {
        actions.updateImage(contextMenu.image.image, {
          vector: data.meta.vector,
        });
        globalActions.pushToast({ key: "toast.vectorIndexed" }, "success");
      } else {
        globalActions.pushToast({ key: "toast.vectorIndexFailed" }, "error");
      }
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.vectorIndexFailed" }, "error");
    }
    closeContextMenu();
  };

  const handleOpenFile = async () => {
    if (!contextMenu) return;
    try {
      await localApi<unknown>("/api/open-in-folder", {
        image: contextMenu.image.image,
      });
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.openFileFailed" }, "error");
    }
    closeContextMenu();
  };

  const handleImageClick = async (image: ImageMeta) => {
    try {
      await localApi<unknown>("/api/open-with-default", {
        image: image.image,
      });
    } catch (e) {
      console.error(e);
      globalActions.pushToast({ key: "toast.openFileFailed" }, "error");
    }
  };

  const handleAddTag = async (image: ImageMeta, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;

    const currentTags = ensureTags(image.tags as string[]);
    if (currentTags.includes(trimmed)) {
      return;
    }

    const newTags = [...currentTags, trimmed];
    try {
      await localApi<unknown>("/api/update-tags", {
        image: image.image,
        tags: newTags,
      });
      actions.updateImage(image.image, { tags: newTags });
      if (contextMenu && contextMenu.image.image === image.image) {
        setContextMenu({
          ...contextMenu,
          image: { ...image, tags: newTags },
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!contextMenu) return;
    const image = contextMenu.image;
    const newTags = image.tags.filter((t) => t !== tag);

    try {
      await localApi<unknown>("/api/update-tags", {
        image: image.image,
        tags: newTags,
      });
      actions.updateImage(image.image, { tags: newTags });
      setContextMenu({
        ...contextMenu,
        image: { ...image, tags: newTags },
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = await scanDroppedItems(e.dataTransfer);
    if (files.length > 0) {
      await importFiles(files);
    }
  };

  // Custom collision detection to stop sorting when dragging out
  const customCollisionDetection = React.useCallback(
    (args: Parameters<typeof closestCenter>[0]) => {
      const { pointerCoordinates } = args;

      if (galleryRef.current && pointerCoordinates) {
        const rect = galleryRef.current.getBoundingClientRect();
        // If pointer is near or past the right edge, disable sorting collision
        // Adding a small buffer (e.g., 20px) inside the gallery to make it more sensitive
        if (pointerCoordinates.x > rect.right - 20) {
          return [];
        }
      }
      return closestCenter(args);
    },
    []
  );

  return (
    <div
      className="flex flex-col h-full bg-neutral-900 border-r border-neutral-800 flex-shrink-0 relative transition-colors"
      style={{ width: appSnap.sidebarWidth }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => e.preventDefault()}
      onClick={() => globalActions.setActiveArea("gallery")}
      onFocus={() => globalActions.setActiveArea("gallery")}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <GalleryHeader loading={loading} allTags={allTags} />

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 scrollbar-hide"
          ref={galleryRef}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={(e) => e.preventDefault()}
        >
          {snap.allImages.length === 0 ? (
            <GalleryEmptyState />
          ) : (
            <SortableContext
              items={sortedImages.map((image) => image.image)}
              strategy={rectSortingStrategy}
            >
              <Masonry
                breakpointCols={columnCount}
                className="flex w-auto -ml-4"
                columnClassName="pl-4 bg-clip-padding"
              >
                {sortedImages.map((image) => (
                  <SortableGalleryItem
                    key={image.image}
                    image={image as ImageMeta}
                    enableVectorSearch={enableVectorSearch}
                    onDragStart={handleNativeDragStart}
                    onContextMenu={(e) => {
                      handleContextMenu(e, image as ImageMeta);
                    }}
                    onClick={handleImageClick}
                  />
                ))}
              </Masonry>
            </SortableContext>
          )}
        </div>
        <DragOverlay>
          {dragOverlay ? (
            <DragOverlayItem
              size={dragOverlay.size}
              className={dragOverlay.className}
            >
              {dragOverlay.content}
            </DragOverlayItem>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeContextMenu();
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <GalleryContextMenu
          key={contextMenu.image.image}
          value={contextMenu}
          allTags={allTags}
          enableVectorSearch={enableVectorSearch}
          onClose={closeContextMenu}
          onOpenFile={handleOpenFile}
          onDelete={handleDelete}
          onReindex={handleReindex}
          onOpenDominantColorPicker={({ x, y }) => {
            const next = clampPopover(x, y + 16);
            const current = contextMenu.image.dominantColor || THEME.primary;
            setDominantColorPicker({
              image: contextMenu.image.image,
              x: next.x,
              y: next.y,
              draft: current,
            });
          }}
          onUpdateName={(name) => handleUpdateName(contextMenu.image, name)}
          onAddTag={(tag) => handleAddTag(contextMenu.image, tag)}
          onRemoveTag={handleRemoveTag}
        />
      )}

      {tagColorPicker && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onMouseDown={() => setTagColorPicker(null)}
          />
          <div
            className="fixed z-[61] w-62 bg-neutral-900/95 border border-neutral-700/80 rounded-xl shadow-2xl p-3 backdrop-blur"
            style={{
              top: tagColorPicker.y,
              left: tagColorPicker.x,
              width: POPOVER_WIDTH,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <Tag
                tag={tagColorPicker.tag}
                className="truncate max-w-[150px]"
              />
              <button
                className="text-xs text-neutral-400 hover:text-white transition-colors"
                onClick={() => globalActions.clearTagColor(tagColorPicker.tag)}
              >
                {t("common.clear")}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ColorInput
                value={appSnap.tagColors[tagColorPicker.tag] || THEME.primary}
                onChange={(next) =>
                  globalActions.setTagColor(tagColorPicker.tag, next)
                }
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-200 font-semibold truncate">
                  {t("common.color")}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {appSnap.tagColors[tagColorPicker.tag] || t("common.notSet")}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-9 gap-1.5">
              {appSnap.colorSwatches.map((c, i) => {
                const current =
                  appSnap.tagColors[tagColorPicker.tag] || THEME.primary;
                return (
                  <Swatch
                    key={`${c}_${i}`}
                    color={c}
                    selected={c.toLowerCase() === current.toLowerCase()}
                    onPress={() => globalActions.setTagColor(tagColorPicker.tag, c)}
                    onReplaceWithCurrent={() =>
                      globalActions.setColorSwatch(i, current)
                    }
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {dominantColorPicker && contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onMouseDown={() => {
              closeContextMenu();
              debouncedUpdateDominantColor.cancel();
              setDominantColorPicker(null);
            }}
          />
          <div
            className="fixed z-[61] w-62 bg-neutral-900/95 border border-neutral-700/80 rounded-xl shadow-2xl p-3 backdrop-blur"
            style={{
              top: dominantColorPicker.y,
              left: dominantColorPicker.x,
              width: POPOVER_WIDTH,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-neutral-200 font-semibold">
                {t("gallery.dominantColor.title")}
              </div>
              <button
                type="button"
                className="text-xs text-neutral-400 hover:text-white transition-colors"
                onClick={async () => {
                  debouncedUpdateDominantColor.cancel();
                  await handleUpdateDominantColor(contextMenu.image, null);
                  setDominantColorPicker(null);
                }}
              >
                {t("common.clear")}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ColorInput
                value={dominantColorPicker.draft}
                onChange={(next) => {
                  setDominantColorPicker({
                    ...dominantColorPicker,
                    draft: next,
                  });
                  debouncedUpdateDominantColor(dominantColorPicker.image, next);
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-200 font-semibold truncate">
                  {t("gallery.colorFilter.selected")}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {dominantColorPicker.draft}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-9 gap-1.5">
              {appSnap.colorSwatches.map((c, i) => (
                <Swatch
                  key={`${c}_${i}`}
                  color={c}
                  selected={
                    c.toLowerCase() === dominantColorPicker.draft.toLowerCase()
                  }
                  onPress={() => {
                    debouncedUpdateDominantColor.cancel();
                    setDominantColorPicker({
                      ...dominantColorPicker,
                      draft: c,
                    });
                    const image =
                      galleryState.allImages.find(
                        (img) => img.image === dominantColorPicker.image
                      ) ||
                      galleryState.images.find(
                        (img) => img.image === dominantColorPicker.image
                      ) ||
                      contextMenu.image;
                    if (!image || image.image !== dominantColorPicker.image) return;
                    void handleUpdateDominantColor(image as ImageMeta, c);
                  }}
                  onReplaceWithCurrent={() =>
                    globalActions.setColorSwatch(i, dominantColorPicker.draft)
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
