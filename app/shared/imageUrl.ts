const PINTEREST_SIZE_SEGMENT_RE = /^\d+x\d*$/i;
const X_IMAGE_HOSTNAME = "pbs.twimg.com";
const HUABAN_IMAGE_HOST_SUFFIXES = [
  "hbimg.com",
  "huabanimg.com",
  "huaban.com",
  "aicdn.com",
] as const;
const HUABAN_STYLE_SUFFIX_RE =
  /_(?:fw|sq)\d+(?:webp|jpe?g|png|gif|avif)?$/i;
const HUABAN_PROCESS_SEGMENT_RE =
  /^(?:imageMogr2|imageView2|fw|sq|w|h|thumbnail|quality|format|webp|jpe?g|png|gif|avif|auto-orient|strip|gravity|crop|resize|interlace)$/i;
const HUABAN_PROCESS_QUERY_RE =
  /^(?:imageMogr2|imageView2|x-oss-process=)|(?:thumbnail|format\/webp|quality\/\d+)/i;

export const MAX_IMPORTED_IMAGE_URL_CANDIDATES = 20;

const normalizePinterestImageUrl = (parsed: URL): void => {
  if (!parsed.hostname.toLowerCase().endsWith("pinimg.com")) {
    return;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 5 || segments[0] === "originals") {
    return;
  }

  if (PINTEREST_SIZE_SEGMENT_RE.test(segments[0])) {
    segments[0] = "originals";
    parsed.pathname = `/${segments.join("/")}`;
  }
};

const normalizeXImageUrl = (parsed: URL): void => {
  if (parsed.hostname.toLowerCase() !== X_IMAGE_HOSTNAME) {
    return;
  }

  parsed.searchParams.set("name", "orig");
  if (!parsed.searchParams.has("format")) {
    const ext = parsed.pathname
      .split("/")
      .pop()
      ?.match(/\.([a-z0-9]{1,10})$/i)?.[1];
    if (ext) {
      parsed.searchParams.set("format", ext.toLowerCase());
    }
  }
};

const isHuabanImageHost = (hostname: string) =>
  HUABAN_IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) &&
  /(?:^|[-.])(?:hbimg|huabanimg|huaban|hb)(?:[-.]|$)/i.test(hostname);

const stripHuabanProcessPath = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  const processIndex = segments.findIndex((segment, index) =>
    index > 0 && HUABAN_PROCESS_SEGMENT_RE.test(segment)
  );
  const imageSegments =
    processIndex === -1 ? segments : segments.slice(0, processIndex);
  const normalized = imageSegments.map((segment, index) =>
    index === imageSegments.length - 1
      ? segment.replace(HUABAN_STYLE_SUFFIX_RE, "")
      : segment
  );
  return normalized.length > 0 ? `/${normalized.join("/")}` : pathname;
};

const normalizeHuabanImageUrl = (parsed: URL): void => {
  if (!isHuabanImageHost(parsed.hostname.toLowerCase())) {
    return;
  }

  parsed.pathname = stripHuabanProcessPath(parsed.pathname);
  parsed.hash = "";
  if (HUABAN_PROCESS_QUERY_RE.test(parsed.search.slice(1))) {
    parsed.search = "";
  }
};

const optimizeImportedImageUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    normalizePinterestImageUrl(parsed);
    normalizeXImageUrl(parsed);
    normalizeHuabanImageUrl(parsed);
    return parsed.toString();
  } catch {
    return value;
  }
};

const isHttpUrl = (value: string): boolean => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * 为同一张网页图片生成按清晰度从高到低排列的导入候选。
 * 站点原图地址优先，网页实际提供的地址作为后续候选。
 */
export const buildImportedImageUrlCandidates = (
  values: readonly string[],
): string[] => {
  const sources = Array.from(
    new Set(values.map((value) => value.trim()).filter(isHttpUrl)),
  );
  const candidates: string[] = [];

  sources.forEach((source) => {
    const optimized = optimizeImportedImageUrl(source);
    if (!candidates.includes(optimized)) candidates.push(optimized);
    if (!candidates.includes(source)) candidates.push(source);
  });

  return candidates.slice(0, MAX_IMPORTED_IMAGE_URL_CANDIDATES);
};
