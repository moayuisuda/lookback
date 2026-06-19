import { Type } from "@earendil-works/pi-ai";

const DEFAULT_SOURCE = "baidu";
const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 LookBack-Ira/0.2.43";

const SOURCE_LABELS = {
  baidu: "百度图片",
  bing: "Bing Images",
  so: "360 图片",
};

const clampInteger = (value, { min, max, fallback }) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
};

const normalizeSource = (value) => {
  const source = String(value || DEFAULT_SOURCE).trim().toLowerCase();
  if (source in SOURCE_LABELS) return source;
  throw new Error(`不支持的图片搜索源：${source}`);
};

const createJsonSearchUrl = ({ source, query, page, pageSize }) => {
  if (source === "baidu") {
    const url = new URL("https://image.baidu.com/search/acjson");
    url.searchParams.set("tn", "resultjson_com");
    url.searchParams.set("word", query);
    url.searchParams.set("pn", String((page - 1) * pageSize));
    url.searchParams.set("rn", String(pageSize));
    return url;
  }

  const url = new URL("https://image.so.com/j");
  url.searchParams.set("q", query);
  url.searchParams.set("sn", String((page - 1) * pageSize));
  url.searchParams.set("pn", String(pageSize));
  return url;
};

const createBingSearchUrl = ({ query, page, pageSize }) => {
  const url = new URL("https://www.bing.com/images/async");
  url.searchParams.set("q", query);
  url.searchParams.set("first", String((page - 1) * pageSize + 1));
  url.searchParams.set("count", String(pageSize));
  return url;
};

const fetchText = async (url, timeoutMs, accept) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`图片搜索请求失败：${response.status} ${response.statusText} ${text}`.trim());
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`图片搜索请求超时：${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const fetchJson = async (url, timeoutMs) => {
  const text = await fetchText(url, timeoutMs, "application/json,text/plain,*/*");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`图片搜索返回非 JSON 内容：${text.slice(0, 300).replace(/\s+/g, " ")}`);
  }
};

const firstText = (...values) =>
  values
    .map((value) => String(value || "").trim())
    .find(Boolean) || "";

const toHttpsUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("//")) return `https:${text}`;
  if (text.startsWith("http://")) return `https://${text.slice("http://".length)}`;
  return text;
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(toHttpsUrl(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const BAIDU_URL_CHAR_MAP = Object.freeze({
  w: "a",
  k: "b",
  v: "c",
  1: "d",
  j: "e",
  u: "f",
  2: "g",
  i: "h",
  t: "i",
  3: "j",
  h: "k",
  s: "l",
  4: "m",
  g: "n",
  5: "o",
  r: "p",
  q: "q",
  6: "r",
  f: "s",
  p: "t",
  7: "u",
  e: "v",
  o: "w",
  8: "1",
  d: "2",
  n: "3",
  9: "4",
  c: "5",
  m: "6",
  0: "7",
  b: "8",
  l: "9",
  a: "0",
});

const decodeBaiduImageUrl = (value) => {
  const text = String(value || "").trim();
  if (!/^ipprf?_z2C\$q/.test(text)) return "";

  // 百度 objURL 使用固定字符替换规则；先保护特殊片段，避免字符表二次替换。
  const decoded = text
    .replace(/^ipprf_z2C\$q/, "__HTTPS__")
    .replace(/^ippr_z2C\$q/, "__HTTP__")
    .replace(/_z&e3B/g, "__DOT__")
    .replace(/z&e3B/g, "__DOT__")
    .replace(/AzdH3F/g, "__SLASH__")
    .replace(/[wkv1ju2it3hs4g5r6fp7eo8dn9cm0bla]/g, (char) => BAIDU_URL_CHAR_MAP[char] || char)
    .replace(/__HTTPS__/g, "https:")
    .replace(/__HTTP__/g, "http:")
    .replace(/__DOT__/g, ".")
    .replace(/__SLASH__/g, "/");

  return isHttpUrl(decoded) ? decoded : "";
};

const normalizeHttpUrl = (value) => {
  const directUrl = toHttpsUrl(value);
  if (isHttpUrl(directUrl)) return directUrl;
  return decodeBaiduImageUrl(value);
};

const firstHttpUrl = (...values) =>
  values.map(normalizeHttpUrl).find(Boolean) || "";

const escapeMarkdownAlt = (value) =>
  String(value || "image").replace(/[\r\n[\]\\]/g, " ").trim() || "image";

const createResult = ({
  id,
  title,
  site,
  sourceUrl,
  imageUrl,
  thumbnailUrl,
  width,
  height,
  imageType,
  imageSize,
}) => {
  const normalizedTitle = firstText(title, site, "image");
  const normalizedImageUrl = firstHttpUrl(imageUrl);
  const normalizedThumbnailUrl = firstHttpUrl(thumbnailUrl, imageUrl);

  return {
    id: firstText(id, normalizedImageUrl, normalizedThumbnailUrl),
    title: normalizedTitle,
    site: firstText(site),
    sourceUrl: firstHttpUrl(sourceUrl),
    imageUrl: normalizedImageUrl,
    thumbnailUrl: normalizedThumbnailUrl,
    width: Number(width || 0) || null,
    height: Number(height || 0) || null,
    imageType: firstText(imageType),
    imageSize: firstText(imageSize),
    markdown: normalizedThumbnailUrl ? `![${escapeMarkdownAlt(normalizedTitle)}](${normalizedThumbnailUrl})` : "",
  };
};

const toSoResult = (item) =>
  createResult({
    id: firstText(item.id, item.key, item.imgkey),
    title: firstText(item.title, item.litetitle, item.dspurl),
    site: firstText(item.site, item.dspurl),
    sourceUrl: item.link,
    imageUrl: firstText(item.img, item.thumb_bak, item.thumb),
    thumbnailUrl: firstText(item.thumb, item._thumb, item.thumb_bak, item.img),
    width: item.width,
    height: item.height,
    imageType: item.imgtype,
    imageSize: item.imgsize,
  });

const toBaiduResult = (item) => {
  const replacement = Array.isArray(item.replaceUrl) ? item.replaceUrl[0] : null;
  return createResult({
    id: firstText(item.di, item.id, item.bdImgnewsDate),
    title: firstText(item.fromURLHost, item.title, item.desc),
    site: firstText(item.fromURLHost),
    sourceUrl: firstHttpUrl(replacement?.FromURL, replacement?.FromUrl, item.fromJumpUrl, item.fromURL),
    imageUrl: firstHttpUrl(
      replacement?.ObjURL,
      replacement?.ObjUrl,
      item.objURL,
      item.hoverURL,
      item.middleURL,
      item.thumbURL,
    ),
    thumbnailUrl: firstText(item.thumbURL, item.middleURL, item.hoverURL),
    width: item.width,
    height: item.height,
    imageType: item.type,
    imageSize: item.filesize,
  });
};

const decodeHtmlAttribute = (value) =>
  String(value || "")
    .replaceAll("&quot;", "\"")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

const getHostname = (value) => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

const toBingResult = (item) =>
  createResult({
    id: firstText(item.mid, item.md5, item.murl),
    title: firstText(item.t, item.desc),
    site: getHostname(item.purl),
    sourceUrl: item.purl,
    imageUrl: item.murl,
    thumbnailUrl: item.turl,
    width: item.w,
    height: item.h,
    imageType: item.img_format,
    imageSize: item.fileSize,
  });

const parseBingResults = (html) =>
  [...String(html || "").matchAll(/class="iusc"[^>]*m="([^"]+)/g)]
    .map((match) => {
      try {
        return JSON.parse(decodeHtmlAttribute(match[1]));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .map(toBingResult);

const searchJsonSource = async ({ source, query, page, pageSize, timeoutMs }) => {
  const searchUrl = createJsonSearchUrl({ source, query, page, pageSize });
  const data = await fetchJson(searchUrl, timeoutMs);
  const rawResults = source === "baidu" ? data.data : data.list;
  const mapper = source === "baidu" ? toBaiduResult : toSoResult;
  return {
    searchUrl,
    total: Number(data.total || data.listNum || data.displayNum || 0),
    end: data.end === true,
    results: (Array.isArray(rawResults) ? rawResults : []).map(mapper),
  };
};

const searchBing = async ({ query, page, pageSize, timeoutMs }) => {
  const searchUrl = createBingSearchUrl({ query, page, pageSize });
  const html = await fetchText(searchUrl, timeoutMs, "text/html,*/*");
  return {
    searchUrl,
    total: 0,
    end: false,
    results: parseBingResults(html),
  };
};

const searchImages = async (params) => {
  const query = String(params.query || "").trim();
  if (!query) throw new Error("缺少图片搜索关键词");

  const source = normalizeSource(params.source);
  const pageSize = clampInteger(params.pageSize, {
    min: 1,
    max: MAX_PAGE_SIZE,
    fallback: DEFAULT_PAGE_SIZE,
  });
  const page = clampInteger(params.page, {
    min: 1,
    max: 100,
    fallback: 1,
  });
  const timeoutMs = clampInteger(params.timeoutMs, {
    min: 1000,
    max: MAX_TIMEOUT_MS,
    fallback: DEFAULT_TIMEOUT_MS,
  });

  const response =
    source === "bing"
      ? await searchBing({ query, page, pageSize, timeoutMs })
      : await searchJsonSource({ source, query, page, pageSize, timeoutMs });
  const results = response.results
    .filter((item) => item.imageUrl || item.thumbnailUrl)
    .slice(0, pageSize);

  return {
    query,
    source,
    sourceLabel: SOURCE_LABELS[source],
    page,
    pageSize,
    total: response.total,
    end: response.end,
    searchUrl: response.searchUrl.toString(),
    rightsNotice: "结果来自公开网页索引，正式使用前需要打开来源页核验版权与使用条件。",
    results,
  };
};

export const createImageSearchTool = () => ({
  name: "image_search",
  label: "图片搜索",
  description:
    "搜索图片并返回缩略图、原图链接、来源站点、来源页和 Markdown 图片语法。支持 source：baidu(默认，百度图片)、bing(Bing Images)、so(360 图片)。不需要代理和 API Key。",
  parameters: Type.Object({
    query: Type.String({ description: "图片搜索关键词" }),
    source: Type.Optional(Type.String({ description: "搜索源：baidu、bing、so。默认 baidu" })),
    pageSize: Type.Optional(Type.Number({ description: `返回数量，1-${MAX_PAGE_SIZE}，默认 ${DEFAULT_PAGE_SIZE}` })),
    page: Type.Optional(Type.Number({ description: "页码，默认 1" })),
    timeoutMs: Type.Optional(Type.Number({ description: `请求超时毫秒数，最高 ${MAX_TIMEOUT_MS}` })),
  }),
  execute: async (_toolCallId, params) => {
    const result = await searchImages(params || {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});
