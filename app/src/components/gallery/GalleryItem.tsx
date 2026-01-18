import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ImageMeta, type SearchResult, deriveNameFromFilename, getImageUrl } from "../../store/galleryStore";
import { Tag } from "../Tag";
import { useT } from "../../i18n/useT";

interface SortableGalleryItemProps {
  image: ImageMeta;
  enableVectorSearch: boolean;
  onDragStart: (e: React.DragEvent, image: ImageMeta) => void;
  onContextMenu: (e: React.MouseEvent, image: ImageMeta) => void;
  onClick: (image: ImageMeta) => void;
}

const ensureTags = (tags: string[] | undefined | null): string[] =>
  Array.isArray(tags) ? tags : [];

export const SortableGalleryItem: React.FC<SortableGalleryItemProps> = ({
  image,
  enableVectorSearch,
  onDragStart,
  onContextMenu,
  onClick,
}) => {
  const { t } = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.image });

  const style = {
    transform: CSS.Transform.toString(transform),
    transformOrigin: "top",
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  const name = deriveNameFromFilename(image.image);

  return (
    <div
      ref={setNodeRef}
      id={image.image}
      style={style}
      {...attributes}
      {...listeners}
      className="mb-4 group overflow-hidden relative rounded hover:z-10 cursor-grab active:cursor-grabbing"
    >
      <div
        draggable
        onDragStart={(e) => onDragStart(e, image)}
        onContextMenu={(e) => onContextMenu(e, image)}
        onClick={() => onClick(image)}
      >
        <img
          src={getImageUrl(image.image)}
          alt={name || t("gallery.referenceAlt")}
          className="w-full bg-neutral-800 transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 pointer-events-none max-w-[calc(100%-2rem)]">
          {name && (
            <div
              className="px-2 py-1 rounded bg-black/30 backdrop-blur-sm text-white text-[8px] font-normal leading-none truncate w-fit max-w-full"
              title={name}
            >
              {name}
            </div>
          )}
          {import.meta.env.DEV && "score" in image && (
            <div
              className="px-2 py-1 rounded bg-black/30 backdrop-blur-sm text-white text-[8px] font-normal leading-none truncate w-fit max-w-full"
              title={`Score: ${(image as SearchResult).score}`}
            >
              {(image as SearchResult).score.toFixed(4)}
            </div>
          )}
        </div>

        {enableVectorSearch && !Array.isArray(image.vector) && (
          <div
            className="absolute top-2 right-2 w-2 h-2 rounded-full bg-yellow-500 shadow-sm"
            title={t("gallery.notIndexed")}
          />
        )}

        <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="flex flex-wrap gap-1 items-center">
            {ensureTags(image.tags as string[])
              .slice(0, 5)
              .map((tag) => (
                <Tag key={tag} tag={tag} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
