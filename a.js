// LookBack Collector Content Script

const API_PORT = 30001;
const API_BASE = `http://localhost:${API_PORT}/api`;

// --- Floating Menu ---

const DRAG_THRESHOLD = 40;
let dragStartX = 0;
let dragSourceEl = null;
let dragFinalUrl = "";
let dragDirectionLeft = null;
let menuShown = false;

function getHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function pickBestImageElement(container) {
    if (!container) return null;
    const imgs = Array.from(container.querySelectorAll("img"));
    if (imgs.length === 0) return null;
    let best = null;
    let bestScore = -1;
    for (const img of imgs) {
        const url = img.currentSrc;
        if (!url) continue;
        const rect = img.getBoundingClientRect();
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);
        const urlScore = /pinimg\.com/i.test(url) ? 1000000000 : 0;
        const score = urlScore + area;
        if (score > bestScore) {
            bestScore = score;
            best = img;
        }
    }
    return best || imgs[0];
}

function parseCssUrl(value) {
    if (!value || typeof value !== "string") return "";
    const match = /url\((['"]?)(.*?)\1\)/i.exec(value);
    return match?.[2] || "";
}

function getElementBackgroundImageUrl(el) {
    if (!(el instanceof Element)) return "";
    return parseCssUrl(window.getComputedStyle(el).backgroundImage);
}

function findBestImageNearby(el) {
    if (!(el instanceof Element)) return null;
    const direct = el.tagName === "IMG" ? el : el.closest("img");
    if (direct instanceof HTMLImageElement && (direct.currentSrc || direct.src))
        return direct;

    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
        const img = pickBestImageElement(cur);
        if (img) return img;
        cur = cur.parentElement;
    }
    return null;
}

function upgradeTwimgUrl(url) {
    try {
        const u = new URL(url);
        if (!/twimg\.com$/i.test(u.hostname)) return url;
        u.searchParams.set("name", "orig");
        return u.toString();
    } catch {
        return url;
    }
}

function upgradePinimgUrl(url) {
    try {
        const u = new URL(url);
        if (!/pinimg\.com$/i.test(u.hostname)) return url;
        const parts = u.pathname.split("/");
        const sizeSegment = parts[1] || "";
        if (/^\d+x(\d+)?$/i.test(sizeSegment)) {
            parts[1] = "originals";
            u.pathname = parts.join("/");
        }
        return u.toString();
    } catch {
        return url;
    }
}

function getLargestSrcsetUrl(img) {
    if (!(img instanceof HTMLImageElement)) return "";
    const raw = (img.getAttribute("srcset") || img.srcset || "").trim();
    if (!raw) return "";

    let bestUrl = "";
    let bestScore = -1;

    const parts = raw.split(",");
    for (const part of parts) {
        const candidate = part.trim();
        if (!candidate) continue;

        const tokens = candidate.split(/\s+/).filter(Boolean);
        const urlToken = tokens[0] || "";
        if (!urlToken) continue;
        if (/^\d+(?:\.\d+)?[wx]$/i.test(urlToken)) continue;

        const descriptor = tokens[1] || "";
        const match = /^(\d+(?:\.\d+)?)(w|x)$/i.exec(descriptor);
        const score = match
            ? Number(match[1]) * (match[2].toLowerCase() === "x" ? 1000 : 1)
            : 0;

        if (score >= bestScore) {
            bestScore = score;
            bestUrl = urlToken;
        }
    }

    if (!bestUrl) return "";

    try {
        return new URL(bestUrl, document.baseURI).toString();
    } catch {
        return bestUrl;
    }
}

function getDomainParserKey(hostname) {
    if (/huaban\./i.test(hostname)) return "huaban.com";
    if (/pinterest\./i.test(hostname)) return "pinterest.com";
    if (/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(hostname)) return "x.com";
    return "default";
}

function parseDefaultFinalUrl(el) {
    if (!(el instanceof Element)) return "";

    const img = findBestImageNearby(el);
    if (img) return img.currentSrc || img.src || "";

    return getElementBackgroundImageUrl(el) || "";
}

function parsePinterestFinalUrl(el) {
    if (!(el instanceof Element)) return "";
    const pinImg = resolvePinterestImageFromTarget(el);
    // Pinterest images usually expose multiple candidates via srcset; pick the largest one for storage.
    const url = pinImg
        ? getLargestSrcsetUrl(pinImg) || pinImg.currentSrc || pinImg.src || ""
        : parseDefaultFinalUrl(el);
    return upgradePinimgUrl(url);
}

function parseXFinalUrl(el) {
    if (!(el instanceof Element)) return "";
    return upgradeTwimgUrl(parseDefaultFinalUrl(el));
}

function parseHuabanFinalUrl(el) {
    if (!(el instanceof Element)) return "";
    const url = parseDefaultFinalUrl(el);
    return url ? url.replace(/_fw\d+webp/i, "") : "";
}

function resolveXInfo(el) {
    if (!el) return { name: "" };

    let current = el;
    let tweetTextEl = null;

    const tweetContainer =
        el.closest('[data-testid="tweet"]') || el.closest("article");

    if (tweetContainer) {
        tweetTextEl = tweetContainer.querySelector('[data-testid="tweetText"]');
    } else {
        for (let i = 0; i < 20; i++) {
            if (!current || current === document.body) break;
            current = current.parentElement;
            if (current) {
                const found = current.querySelector('[data-testid="tweetText"]');
                if (found) {
                    tweetTextEl = found;
                    break;
                }
            }
        }
    }

    if (!tweetTextEl) return { name: "" };

    const clone = tweetTextEl.cloneNode(true);
    clone.querySelectorAll('a[href*="/hashtag/"]').forEach((el) => el.remove());
    const name = clone.innerText.replace(/[\r\n]+/g, " ").trim();

    return { name };
}

function resolvePinterestInfo(el) {
    if (!(el instanceof Element)) return { name: "" };

    const normalizeText = (text) => (text || "").replace(/\s+/g, " ").trim();

    const closeupTitleEl = document.querySelector(
        '[data-test-id="closeup-title"] h1',
    );
    const closeupTitle = normalizeText(closeupTitleEl?.textContent || "");
    if (closeupTitle) return { name: closeupTitle };

    const pinContainer = el.closest('[data-test-id="pin"]');
    if (!pinContainer) return { name: "" };

    const footerTitleAnchor =
        pinContainer.querySelector(
            '[data-test-id="pinrep-footer-organic-title"] a',
        ) ||
        pinContainer.querySelector("h2 a") ||
        pinContainer.querySelector('a[href*="/pin/"]');

    let name = normalizeText(footerTitleAnchor?.textContent || "");

    return { name };
}

const finalUrlParsers = new Map([
    ["x.com", parseXFinalUrl],
    ["pinterest.com", parsePinterestFinalUrl],
    ["huaban.com", parseHuabanFinalUrl],
    ["default", parseDefaultFinalUrl],
]);
const dragElementResolvers = new Map([
    ["pinterest.com", resolvePinterestDragElement],
    ["default", resolveDefaultDragElement],
]);

function resolveFinalUrlFromElement(el) {
    const host = getHostname(window.location.href);
    const key = getDomainParserKey(host);
    const parser = finalUrlParsers.get(key) || finalUrlParsers.get("default");
    const url = parser ? parser(el) : "";
    return typeof url === "string" ? url.trim() : "";
}

function resolvePinterestImageFromTarget(el) {
    if (!(el instanceof Element)) return null;
    const direct = el.tagName === "IMG" ? el : el.closest("img");
    if (direct) {
        const url = direct.currentSrc;
        if (/pinimg\.com/i.test(url)) return direct;
    }
    const pinCard =
        el.closest('[data-test-id="pincard-image-without-link"]') ||
        el.closest('[data-test-id="pin"]');
    if (pinCard) {
        const img = pickBestImageElement(pinCard);
        if (img) return img;
    }
    const overlay = el.closest('[data-test-id="pin-card-hover-overlay"]');
    if (overlay) {
        const container =
            overlay.closest('[data-test-id="pincard-image-without-link"]') ||
            overlay.parentElement;
        const img = pickBestImageElement(container);
        if (img) return img;
    }
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
        const img = pickBestImageElement(cur);
        if (img) {
            const url = img.currentSrc;
            if (/pinimg\.com/i.test(url)) return img;
        }
        cur = cur.parentElement;
    }
    return null;
}

function resolveDefaultDragElement(el) {
    const img = el instanceof HTMLImageElement ? el : el.closest("img");
    if (img instanceof HTMLImageElement) return img;
    return el;
}

function resolvePinterestDragElement(el) {
    const pinImg = resolvePinterestImageFromTarget(el);
    if (pinImg) return pinImg;
    return resolveDefaultDragElement(el);
}

function resolveDragSourceElement(target) {
    const el = target instanceof Element ? target : null;
    if (!el) return null;
    const host = getHostname(window.location.href);
    const key = getDomainParserKey(host);
    const resolver =
        dragElementResolvers.get(key) || dragElementResolvers.get("default");
    return resolver(el);
}

function init() {
    // --- Ghost Image Setup (canvas based) ---
    const ghostCanvas = document.createElement("canvas");
    ghostCanvas.width = 100;
    ghostCanvas.height = 100;
    ghostCanvas.style.cssText = "position: absolute; top: -9999px;";
    document.body.append(ghostCanvas);

    void probeLocalApp();
    setInterval(() => void probeLocalApp(), LOCAL_APP_PROBE_INTERVAL_MS);

    // --- Event Listeners ---

    document.addEventListener(
        "onClick",
        (e) => {
            debugger;
            if (!localAppAlive) {
                void probeLocalApp();
                return;
            }
            const target = e.target instanceof Element ? e.target : null;
            const sourceEl = target ? resolveDragSourceElement(target) : null;
            if (sourceEl) {
                dragStartX = e.clientX;
                dragSourceEl = sourceEl;
                dragFinalUrl = resolveFinalUrlFromElement(sourceEl);
                dragDirectionLeft = null;
                menuShown = false;

                const ghostImg =
                    sourceEl instanceof HTMLImageElement
                        ? sourceEl
                        : findBestImageNearby(sourceEl);
                const ctx = ghostCanvas.getContext("2d");
                if (ctx) {
                    ctx.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
                    if (ghostImg) {
                        const rect = ghostImg.getBoundingClientRect();
                        const iw = rect.width || ghostImg.naturalWidth || 100;
                        const ih = rect.height || ghostImg.naturalHeight || 100;
                        const scale = Math.min(
                            ghostCanvas.width / iw,
                            ghostCanvas.height / ih,
                            1,
                        );
                        const dw = iw * scale;
                        const dh = ih * scale;
                        const dx = (ghostCanvas.width - dw) / 2;
                        const dy = (ghostCanvas.height - dh) / 2;
                        ctx.drawImage(ghostImg, dx, dy, dw, dh);
                    }
                }

                if (e.dataTransfer && e.dataTransfer.setDragImage) {
                    e.dataTransfer.setDragImage(ghostCanvas, 0, 0);
                }
            }
        },
        true,
    );
}

const SITE_LOAD_CHECKS = [
    {
        pattern: /pinterest\./i,
        selector: "#VerticalNavContent",
    },
];