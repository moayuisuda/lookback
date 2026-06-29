import path from "node:path";
import sagiri from "sagiri";
import { lockedFs } from "./fileLock.js";

const COMMAND_RUNTIME_DIR = "reverse-image-source";
const CONFIG_FILE = "config.json";
const RESULT_LIMIT = 12;
const MAX_NETWORK_ATTEMPTS = 2;
const NETWORK_RETRY_DELAY_MS = 350;
const DEFAULT_API_KEY = "07304d5567e5d5fc5f17ffdcb6fe432c012d257d";

const getConfigPath = async (context) => {
  const runtimeDir = path.join(
    context.storageDir,
    "command-runtimes",
    COMMAND_RUNTIME_DIR,
  );
  await lockedFs.ensureDir(runtimeDir);
  return path.join(runtimeDir, CONFIG_FILE);
};

const readConfig = async (context) => {
  const configPath = await getConfigPath(context);
  if (!(await lockedFs.pathExists(configPath))) {
    return { apiKey: "" };
  }

  const config = await lockedFs.readJson(configPath);
  return {
    apiKey: typeof config?.apiKey === "string" ? config.apiKey : "",
  };
};

const getConfig = async (_payload, context) => {
  const { apiKey } = await readConfig(context);
  return { hasApiKey: Boolean(apiKey) };
};

const writeConfig = async (context, apiKey) => {
  const configPath = await getConfigPath(context);
  await lockedFs.writeJson(configPath, { apiKey });
};

const isHttpUrl = (value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const toStringValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  }
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
};

const pickFirstValue = (data, keys) => {
  for (const key of keys) {
    const value = toStringValue(data?.[key]);
    if (value) return value;
  }
  return "";
};

const normalizeExternalUrls = (...candidates) => {
  const values = candidates.flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );
  return Array.from(
    new Set(
      values
        .map((item) => String(item || "").trim())
        .filter((item) => isHttpUrl(item)),
    ),
  ).slice(0, 3);
};

const normalizeResult = (result, index, resolvedUrl) => {
  const header = result?.header || {};
  const data = result?.data || {};
  // 聚合站的 source 优先；其次使用 Sagiri 解析出的索引记录地址。
  const urls = normalizeExternalUrls(
    data.source,
    resolvedUrl,
    data.ext_urls,
    data.url,
  );
  const title = pickFirstValue(data, [
    "title",
    "eng_name",
    "jp_name",
    "source",
    "material",
  ]);
  const author = pickFirstValue(data, [
    "member_name",
    "creator",
    "author_name",
    "author",
  ]);
  const details = pickFirstValue(data, ["characters", "material", "source"]);
  const similarity = Number.parseFloat(String(header.similarity || "0"));

  return {
    id: `${header.index_id ?? "result"}-${index}`,
    similarity: Number.isFinite(similarity) ? similarity : 0,
    thumbnail: isHttpUrl(String(header.thumbnail || ""))
      ? String(header.thumbnail)
      : "",
    indexName: toStringValue(header.index_name),
    title,
    author,
    details,
    urls,
  };
};

const mapRemoteError = (header) => {
  const message = String(header?.message || "").toLowerCase();
  if (/rate|limit|quota|too many|30\s*sec|24\s*h|daily|remaining/.test(message)) {
    return "RATE_LIMIT";
  }
  if (/api.?key|auth|credential|token/.test(message)) return "INVALID_API_KEY";
  if (/anonymous|unregistered|log.?in|register/.test(message)) {
    return "ANONYMOUS_RESTRICTED";
  }
  if (/image|upload|file|format|size|dimension|decode|url/.test(message)) {
    return "INVALID_IMAGE";
  }
  return "REMOTE_ERROR";
};

const normalizeRemoteMessage = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

const getThrownErrorMessage = (error) => {
  const responseBody = error?.response?.body;
  if (typeof responseBody === "string" && responseBody.trim()) {
    try {
      const body = JSON.parse(responseBody);
      const message = normalizeRemoteMessage(body?.header?.message);
      if (message) return message;
    } catch {
      const message = normalizeRemoteMessage(responseBody);
      if (message) return message;
    }
  }
  const message = normalizeRemoteMessage(
    error instanceof Error ? error.message : error,
  );
  const causeMessage = normalizeRemoteMessage(error?.cause?.message);
  if (!causeMessage || message.includes(causeMessage)) return message;
  return normalizeRemoteMessage(`${message}: ${causeMessage}`);
};

const mapThrownError = (error, message) => {
  const code = String(error?.code || error?.cause?.code || "").toUpperCase();
  if (
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EPIPE/.test(code) ||
    /network|socket|timeout|timed out|connection|fetch failed/i.test(message)
  ) {
    return "NETWORK_ERROR";
  }
  if (/json|unexpected token|invalid response|parse/i.test(message)) {
    return "INVALID_RESPONSE";
  }
  const remoteErrorCode = mapRemoteError({ message });
  if (remoteErrorCode !== "REMOTE_ERROR") return remoteErrorCode;
  return "SEARCH_FAILED";
};

const isTransientNetworkError = (error) => {
  const message = getThrownErrorMessage(error);
  const code = String(error?.code || error?.cause?.code || "").toUpperCase();
  return (
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EPIPE/.test(code) ||
    /network|socket|timeout|timed out|connection|fetch failed/i.test(message)
  );
};

const sleep = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const executeSearchOnce = async (imageInput, apiKey) => {
  const client = sagiri(apiKey, { results: RESULT_LIMIT });
  const response = await client(imageInput);
  const results = Array.isArray(response)
    ? response
        .slice(0, RESULT_LIMIT)
        .map((result, index) =>
          normalizeResult(result.raw, index, result.url),
        )
    : [];
  return { success: true, results };
};

const executeSearch = async (imageInput, apiKey) => {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_NETWORK_ATTEMPTS; attempt += 1) {
    try {
      return await executeSearchOnce(imageInput, apiKey);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_NETWORK_ATTEMPTS || !isTransientNetworkError(error)) {
        throw error;
      }
      console.warn("[reverse-image-source] retry transient network error", {
        attempt,
        message: getThrownErrorMessage(error),
      });
      await sleep(NETWORK_RETRY_DELAY_MS);
    }
  }
  throw lastError;
};

const search = async (payload, context) => {
  const submittedApiKey = String(payload?.apiKey || "").trim();
  let storedConfig = null;
  try {
    storedConfig = submittedApiKey ? null : await readConfig(context);
  } catch (error) {
    const remoteMessage = getThrownErrorMessage(error);
    console.error("[reverse-image-source] config read failed", error);
    return { success: false, errorCode: "CONFIG_FAILED", remoteMessage };
  }
  const apiKey = submittedApiKey || storedConfig?.apiKey || DEFAULT_API_KEY;

  const imageInput = String(payload?.imagePath || "").trim();
  if (!imageInput) {
    return { success: false, errorCode: "IMAGE_REQUIRED" };
  }

  try {
    let result;
    if (isHttpUrl(imageInput)) {
      result = await executeSearch(imageInput, apiKey);
    } else {
      const stat = await lockedFs.stat(imageInput).catch(() => null);
      if (!stat?.isFile()) {
        return { success: false, errorCode: "IMAGE_NOT_FOUND" };
      }

      // Sagiri 对 Buffer 的处理最稳定；文件读取统一经过 fileLock。
      const imageBuffer = await lockedFs.readFile(imageInput);
      result = await executeSearch(imageBuffer, apiKey);
    }

    // 新 Key 通过真实查询验证后才落盘，避免无效输入覆盖可用配置。
    if (result.success && submittedApiKey) {
      await writeConfig(context, submittedApiKey);
    }
    return result;
  } catch (error) {
    const remoteMessage = getThrownErrorMessage(error);
    console.error("[reverse-image-source] search failed", error);
    return {
      success: false,
      errorCode: mapThrownError(error, remoteMessage),
      remoteMessage,
    };
  }
};

export default {
  getConfig,
  search,
};
