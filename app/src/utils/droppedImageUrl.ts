import { buildImportedImageUrlCandidates } from "../../shared/imageUrl";

export const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const collectHttpUrls = (
  values: Array<string | null | undefined>,
): string[] => Array.from(
  new Set(
    values
      .map((value) => value?.trim() ?? "")
      .filter((value) => isHttpUrl(value)),
  ),
);

type RankedImageUrl = {
  url: string;
  width: number;
  density: number;
  priority: number;
  order: number;
};

const getUrlWidth = (value: string): number => {
  try {
    const parsed = new URL(value);
    const rawPathWidth = Number(
      parsed.pathname.split("/").find((segment) => /^\d+x\d*$/i.test(segment))
        ?.match(/^(\d+)/)?.[1] ?? 0,
    );
    const rawQueryWidth = Number(
      parsed.searchParams.get("width") ?? parsed.searchParams.get("w") ?? 0,
    );
    const pathWidth = Number.isFinite(rawPathWidth) ? rawPathWidth : 0;
    const queryWidth = Number.isFinite(rawQueryWidth) ? rawQueryWidth : 0;
    return Math.max(pathWidth, queryWidth);
  } catch {
    return 0;
  }
};

const sortRankedImageUrls = (candidates: RankedImageUrl[]): string[] =>
  candidates
    .filter((candidate) => isHttpUrl(candidate.url))
    .sort((a, b) => {
      if (b.width !== a.width) return b.width - a.width;
      if (b.density !== a.density) return b.density - a.density;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.order - b.order;
    })
    .map((candidate) => candidate.url);

const parseSrcSet = (value: string | null): RankedImageUrl[] => {
  if (!value) return [];

  return value
    .split(",")
    .map((item, index) => {
      const [url = "", descriptor = ""] = item.trim().split(/\s+/, 2);
      const declaredWidth = Number(descriptor.match(/^(\d+)w$/i)?.[1] ?? 0);
      const density = Number(descriptor.match(/^(\d+(?:\.\d+)?)x$/i)?.[1] ?? 0);
      return {
        url,
        width: Math.max(declaredWidth, getUrlWidth(url)),
        density,
        priority: 30,
        order: index,
      };
    });
};

const extractImageUrlsFromHtml = (html: string): string[] => {
  const trimmed = html.trim();
  if (!trimmed) return [];

  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));
  for (const image of images) {
    const attributeCandidates = [
      { value: image.getAttribute("data-original"), priority: 50 },
      { value: image.getAttribute("data-lazy-src"), priority: 40 },
      { value: image.currentSrc, priority: 20 },
      { value: image.getAttribute("data-src"), priority: 10 },
      { value: image.getAttribute("src"), priority: 0 },
    ].map(({ value, priority }, order): RankedImageUrl => {
      const url = value?.trim() ?? "";
      const inferredWidth = getUrlWidth(url);
      return {
        url,
        width:
          inferredWidth > 0 || priority < 50
            ? inferredWidth
            : Number.MAX_SAFE_INTEGER,
        density: 0,
        priority,
        order,
      };
    });
    const urls = collectHttpUrls(
      sortRankedImageUrls([
        ...attributeCandidates,
        ...parseSrcSet(image.getAttribute("srcset")),
      ]),
    );
    if (urls.length > 0) return buildImportedImageUrlCandidates(urls);
  }

  return [];
};

const extractHttpUrlsFromText = (value: string): string[] => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const directUrls = collectHttpUrls(lines);
  const embeddedUrls = lines.flatMap(
    (line) => line.match(/https?:\/\/\S+/gi) ?? [],
  );
  const rankedUrls = sortRankedImageUrls(
    collectHttpUrls([...directUrls, ...embeddedUrls]).map(
      (url, order): RankedImageUrl => ({
        url,
        width: getUrlWidth(url),
        density: 0,
        priority: 0,
        order,
      }),
    ),
  );
  return buildImportedImageUrlCandidates(rankedUrls);
};

export const extractDroppedImageUrls = (
  dataTransfer: DataTransfer,
): string[] => {
  const htmlUrls = extractImageUrlsFromHtml(dataTransfer.getData("text/html"));
  if (htmlUrls.length > 0) return htmlUrls;

  const uriListUrls = extractHttpUrlsFromText(
    dataTransfer.getData("text/uri-list"),
  );
  if (uriListUrls.length > 0) return uriListUrls;

  return extractHttpUrlsFromText(dataTransfer.getData("text/plain"));
};
