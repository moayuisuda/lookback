const COMMAND_ID = "reverseImageSource";

export const config = {
  id: COMMAND_ID,
  i18n: {
    en: {
      "command.reverseImageSource.title": "Find Image Source",
      "command.reverseImageSource.description": "Find the source of the selected image with SauceNAO",
      "command.reverseImageSource.apiKey": "SauceNAO API Key (optional)",
      "command.reverseImageSource.apiKey.placeholder": "Leave blank to use the default key",
      "command.reverseImageSource.apiKey.configured": "Configured. Enter a new key to replace it",
      "command.reverseImageSource.apiKey.hint": "A custom key takes priority and is stored only in a local configuration file",
      "command.reverseImageSource.apiKey.show": "Show API Key",
      "command.reverseImageSource.apiKey.hide": "Hide API Key",
      "command.reverseImageSource.apiKey.get": "Get API Key",
      "command.reverseImageSource.selected": "Selected image",
      "command.reverseImageSource.noSelection": "Select one image on the canvas first",
      "command.reverseImageSource.multipleSelection": "Select only one image to search",
      "command.reverseImageSource.search": "Search",
      "command.reverseImageSource.searching": "Searching...",
      "command.reverseImageSource.empty": "No matching source was found",
      "command.reverseImageSource.result.open": "Open original source",
      "command.reverseImageSource.result.untitled": "Untitled result",
      "command.reverseImageSource.result.similarity": "{{value}}% match",
      "command.reverseImageSource.quota": "Remaining: {{short}} short-term / {{long}} daily",
      "command.reverseImageSource.error.INVALID_API_KEY": "The SauceNAO API Key is invalid",
      "command.reverseImageSource.error.IMAGE_REQUIRED": "Select one image first",
      "command.reverseImageSource.error.IMAGE_NOT_FOUND": "The selected image file no longer exists",
      "command.reverseImageSource.error.RATE_LIMIT": "The SauceNAO query limit has been reached",
      "command.reverseImageSource.error.ANONYMOUS_RESTRICTED": "Anonymous search is currently unavailable. Try again later or configure an API Key",
      "command.reverseImageSource.error.INVALID_IMAGE": "SauceNAO could not process this image",
      "command.reverseImageSource.error.INVALID_RESPONSE": "SauceNAO returned an invalid response",
      "command.reverseImageSource.error.NETWORK_ERROR": "Could not connect to SauceNAO",
      "command.reverseImageSource.error.REMOTE_ERROR": "SauceNAO rejected the query",
      "command.reverseImageSource.error.remoteDetail": "SauceNAO: {{message}}",
      "command.reverseImageSource.error.SEARCH_FAILED": "Image source search failed. Please try again",
      "command.reverseImageSource.error.CONFIG_FAILED": "Failed to read or save the local configuration",
    },
    zh: {
      "command.reverseImageSource.title": "图片来源反查",
      "command.reverseImageSource.description": "使用 SauceNAO 查询当前选中图片的来源",
      "command.reverseImageSource.apiKey": "SauceNAO API Key（可选）",
      "command.reverseImageSource.apiKey.placeholder": "留空将使用默认 Key",
      "command.reverseImageSource.apiKey.configured": "已配置；输入新 Key 可替换",
      "command.reverseImageSource.apiKey.hint": "自定义 Key 优先，并且仅保存到本地配置文件",
      "command.reverseImageSource.apiKey.show": "显示 API Key",
      "command.reverseImageSource.apiKey.hide": "隐藏 API Key",
      "command.reverseImageSource.apiKey.get": "获取 API Key",
      "command.reverseImageSource.selected": "当前选中图片",
      "command.reverseImageSource.noSelection": "请先在画板中选中一张图片",
      "command.reverseImageSource.multipleSelection": "每次只能反查一张图片",
      "command.reverseImageSource.search": "查询来源",
      "command.reverseImageSource.searching": "正在查询...",
      "command.reverseImageSource.empty": "没有找到匹配的图片来源",
      "command.reverseImageSource.result.open": "打开原始来源",
      "command.reverseImageSource.result.untitled": "未命名结果",
      "command.reverseImageSource.result.similarity": "相似度 {{value}}%",
      "command.reverseImageSource.quota": "剩余额度：短期 {{short}} / 每日 {{long}}",
      "command.reverseImageSource.error.INVALID_API_KEY": "SauceNAO API Key 无效",
      "command.reverseImageSource.error.IMAGE_REQUIRED": "请先选中一张图片",
      "command.reverseImageSource.error.IMAGE_NOT_FOUND": "选中的图片文件已不存在",
      "command.reverseImageSource.error.RATE_LIMIT": "SauceNAO 查询额度已用完",
      "command.reverseImageSource.error.ANONYMOUS_RESTRICTED": "匿名查询当前不可用，请稍后重试或配置 API Key",
      "command.reverseImageSource.error.INVALID_IMAGE": "SauceNAO 无法处理这张图片",
      "command.reverseImageSource.error.INVALID_RESPONSE": "SauceNAO 返回了无效响应",
      "command.reverseImageSource.error.NETWORK_ERROR": "无法连接到 SauceNAO",
      "command.reverseImageSource.error.REMOTE_ERROR": "SauceNAO 拒绝了本次查询",
      "command.reverseImageSource.error.remoteDetail": "SauceNAO：{{message}}",
      "command.reverseImageSource.error.SEARCH_FAILED": "图片反查失败，请稍后重试",
      "command.reverseImageSource.error.CONFIG_FAILED": "读取或保存本地配置失败",
    },
  },
  titleKey: "command.reverseImageSource.title",
  title: "Find Image Source",
  descriptionKey: "command.reverseImageSource.description",
  description: "Find the source of the selected image with SauceNAO",
  keywords: ["image", "source", "reverse", "saucenao", "图片", "来源", "反查"],
};

const API_KEY_URL = "https://saucenao.com/user.php?page=search-api";

const getSelectedImages = (canvas) => {
  const items = Array.isArray(canvas?.canvasItems) ? canvas.canvasItems : [];
  return items.filter(
    (item) => item?.type === "image" && item.isSelected === true,
  );
};

const getImageUrl = (imagePath, canvasName, apiBaseUrl) => {
  let normalized = String(imagePath || "").replace(/\\/g, "/");
  if (normalized.startsWith("/")) normalized = normalized.slice(1);
  if (normalized.startsWith("assets/")) {
    const filename = normalized.split("/").pop() || normalized;
    return `${apiBaseUrl}/api/assets/${encodeURIComponent(
      canvasName || "Default",
    )}/${encodeURIComponent(filename)}`;
  }
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${apiBaseUrl}/${normalized}`;
};

const getErrorKey = (errorCode) => {
  const knownCodes = new Set([
    "INVALID_API_KEY",
    "IMAGE_REQUIRED",
    "IMAGE_NOT_FOUND",
    "RATE_LIMIT",
    "ANONYMOUS_RESTRICTED",
    "INVALID_IMAGE",
    "INVALID_RESPONSE",
    "NETWORK_ERROR",
    "REMOTE_ERROR",
    "SEARCH_FAILED",
    "CONFIG_FAILED",
  ]);
  return `command.reverseImageSource.error.${
    knownCodes.has(errorCode) ? errorCode : "SEARCH_FAILED"
  }`;
};

const openExternal = async (url) => {
  if (!/^https?:\/\//i.test(url)) return;
  if (window.electron?.openExternal) {
    await window.electron.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

export const ui = ({ context, plugin }) => {
  const { React, hooks, actions, store, config: appConfig } = context;
  const { useEffect, useMemo, useState } = React;
  const { useEnvState, useT } = hooks;
  const { t } = useT();
  const { canvas: canvasSnap } = useEnvState();
  const [apiKey, setApiKey] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [quota, setQuota] = useState(null);
  const [errorKey, setErrorKey] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const selectedImages = useMemo(
    () => getSelectedImages(canvasSnap),
    [canvasSnap],
  );
  const selectedImage = selectedImages.length === 1 ? selectedImages[0] : null;
  const selectedImageUrl = selectedImage
    ? getImageUrl(
        selectedImage.imagePath,
        canvasSnap.currentCanvasName,
        appConfig.API_BASE_URL,
      )
    : "";

  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      try {
        if (!plugin?.invoke) throw new Error("Plugin server unavailable");
        const stored = await plugin.invoke("getConfig");
        if (!active) return;
        setHasSavedApiKey(stored?.hasApiKey === true);
      } catch (error) {
        console.error("[reverse-image-source] config load failed", error);
        if (active) setErrorKey(getErrorKey("CONFIG_FAILED"));
      } finally {
        if (active) setIsConfigLoading(false);
      }
    };
    void loadConfig();
    return () => {
      active = false;
    };
  }, [plugin]);

  useEffect(() => {
    setResults([]);
    setQuota(null);
    setHasSearched(false);
    setErrorKey("");
    setErrorDetail("");
  }, [selectedImage?.itemId]);

  const handleSearch = async () => {
    const activeApiKey = apiKey.trim();
    const activeImages = getSelectedImages(store.canvas);
    if (activeImages.length !== 1) {
      setErrorKey(
        activeImages.length > 1
          ? "command.reverseImageSource.multipleSelection"
          : getErrorKey("IMAGE_REQUIRED"),
      );
      return;
    }

    setIsSearching(true);
    setErrorKey("");
    setErrorDetail("");
    setHasSearched(false);
    try {
      if (!plugin?.invoke) throw new Error("Plugin server unavailable");
      const imagePath = await actions.canvasActions.resolveLocalImagePath(
        activeImages[0].imagePath,
        store.canvas.currentCanvasName,
      );
      const response = await plugin.invoke("search", {
        imagePath,
        apiKey: activeApiKey,
      });
      if (!response?.success) {
        setResults([]);
        setQuota(null);
        setErrorKey(getErrorKey(response?.errorCode));
        setErrorDetail(String(response?.remoteMessage || ""));
        return;
      }

      setResults(Array.isArray(response.results) ? response.results : []);
      setQuota(response.quota || null);
      setHasSearched(true);
      if (activeApiKey) {
        setHasSavedApiKey(true);
        setApiKey("");
      }
    } catch (error) {
      console.error("[reverse-image-source] search failed", error);
      setResults([]);
      setQuota(null);
      setErrorKey(getErrorKey("SEARCH_FAILED"));
      setErrorDetail(
        error instanceof Error ? error.message : String(error || ""),
      );
    } finally {
      setIsSearching(false);
    }
  };

  const selectionMessage =
    selectedImages.length > 1
      ? t("command.reverseImageSource.multipleSelection")
      : t("command.reverseImageSource.noSelection");

  return (
    <div className="flex h-full min-h-0 max-h-[680px] flex-col bg-neutral-950 text-neutral-100">
      <div className="shrink-0 space-y-3 border-b border-neutral-800 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 p-3">
          {selectedImage ? (
            <img
              src={selectedImageUrl}
              alt={selectedImage.filename || t("command.reverseImageSource.selected")}
              className="h-16 w-16 shrink-0 rounded-lg border border-neutral-700 bg-neutral-950 object-contain"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-950 text-2xl text-neutral-600">
              ?
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-primary">
              {t("command.reverseImageSource.selected")}
            </div>
            <div className="mt-1 truncate text-sm text-neutral-100">
              {selectedImage?.filename || selectionMessage}
            </div>
            {selectedImage && (
              <div className="mt-1 text-xs text-neutral-500">
                {selectedImage.width || 0} × {selectedImage.height || 0}
              </div>
            )}
          </div>
        </div>

        <label className="block">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-neutral-300">
              {t("command.reverseImageSource.apiKey")}
            </span>
            <button
              type="button"
              onClick={() => void openExternal(API_KEY_URL)}
              className="text-xs text-primary transition-colors hover:text-white"
            >
              {t("command.reverseImageSource.apiKey.get")}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              disabled={isConfigLoading || isSearching}
              placeholder={t(
                hasSavedApiKey
                  ? "command.reverseImageSource.apiKey.configured"
                  : "command.reverseImageSource.apiKey.placeholder",
              )}
              autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-primary disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((value) => !value)}
              className="h-9 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            >
              {t(
                showApiKey
                  ? "command.reverseImageSource.apiKey.hide"
                  : "command.reverseImageSource.apiKey.show",
              )}
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-neutral-500">
            {t("command.reverseImageSource.apiKey.hint")}
          </div>
        </label>

        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={isConfigLoading || isSearching || !selectedImage}
          className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-neutral-950 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t(
            isSearching
              ? "command.reverseImageSource.searching"
              : "command.reverseImageSource.search",
          )}
        </button>

        {errorKey && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <div>{t(errorKey)}</div>
            {errorDetail && (
              <div className="mt-1 break-words text-[11px] text-red-400/80">
                {t("command.reverseImageSource.error.remoteDetail", {
                  message: errorDetail,
                })}
              </div>
            )}
          </div>
        )}
        {quota && (
          <div className="text-center text-[11px] text-neutral-500">
            {t("command.reverseImageSource.quota", {
              short: quota.shortRemaining,
              long: quota.longRemaining,
            })}
          </div>
        )}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {hasSearched && results.length === 0 ? (
          <div className="py-10 text-center text-sm text-neutral-500">
            {t("command.reverseImageSource.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {results.map((result) => {
              const sourceUrl = result.urls?.[0] || "";
              return (
                <div
                  key={result.id}
                  className="group flex gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950">
                    {result.thumbnail && (
                      <img
                        src={result.thumbnail}
                        alt={result.title || result.indexName}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute bottom-1 right-1 rounded bg-neutral-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {t("command.reverseImageSource.result.similarity", {
                        value: result.similarity.toFixed(1),
                      })}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-neutral-100">
                      {result.title ||
                        result.indexName ||
                        t("command.reverseImageSource.result.untitled")}
                    </div>
                    {result.author && (
                      <div className="mt-1 truncate text-xs text-neutral-400">
                        {result.author}
                      </div>
                    )}
                    {result.details && result.details !== result.title && (
                      <div className="mt-1 line-clamp-1 text-[11px] text-neutral-500">
                        {result.details}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-neutral-600">
                        {result.indexName}
                      </span>
                      {sourceUrl && (
                        <button
                          type="button"
                          onClick={() => void openExternal(sourceUrl)}
                          className="shrink-0 rounded-md border border-primary/40 px-2 py-1 text-[11px] text-primary transition-colors hover:bg-primary hover:text-neutral-950"
                        >
                          {t("command.reverseImageSource.result.open")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
