import fs from "node:fs/promises";
import path from "node:path";
import { runFollowPracticeScraper } from "./scraper.js";

const PROFILE_SCROLL_MAX_CARDS = 100;

const splitKeywords = (value) =>
  String(value || "")
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const buildProfileUrl = (userId) =>
  `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(String(userId || "").trim())}`;

const getRuntime = async (context) => {
  const runtimeDir = path.join(context.storageDir, "command-runtimes", "follow-practice");
  await fs.mkdir(runtimeDir, { recursive: true });
  return {
    runtimeDir,
    profileDir: path.join(runtimeDir, "xhs-profile"),
  };
};

const assertScraperSuccess = (payload, fallbackMessage) => {
  if (payload?.success === true) {
    return {
      todos: Array.isArray(payload.todos) ? payload.todos : [],
      debugTrace: payload.debug ? String(payload.debug) : "",
    };
  }
  const message = payload?.error ? String(payload.error) : fallbackMessage;
  const debugTrace = payload?.debug ? String(payload.debug) : "";
  throw new Error(debugTrace ? `${message} | debug=${debugTrace}` : message);
};

const scrapeTodos = async (payload, context) => {
  const runtime = await getRuntime(context);
  return assertScraperSuccess(
    await runFollowPracticeScraper({
      mode: "scrape",
      profileUrl: buildProfileUrl(payload?.userId),
      userDataDir: runtime.profileDir,
      keywords: splitKeywords(payload?.keywords),
      headless: payload?.headless !== false,
      maxCards: Number(payload?.maxCards) || PROFILE_SCROLL_MAX_CARDS,
    }),
    "Scrape failed",
  );
};

const scrapeTodoDetail = async (payload, context) => {
  const runtime = await getRuntime(context);
  const todo = payload?.todo || {};
  const { todos, debugTrace } = assertScraperSuccess(
    await runFollowPracticeScraper({
      mode: "detail",
      profileUrl: buildProfileUrl(payload?.userId),
      userDataDir: runtime.profileDir,
      headless: payload?.headless !== false,
      card: {
        noteId: todo.noteId,
        url: todo.url,
        title: todo.title || todo.noteId,
        desc: todo.desc,
        coverUrl: todo.coverUrl,
      },
    }),
    "Scrape failed",
  );
  const [detail] = todos;
  if (!detail) throw new Error("No note detail");
  return { ...detail, __debugTrace: debugTrace };
};

const openLoginWindow = async (payload, context) => {
  const runtime = await getRuntime(context);
  assertScraperSuccess(
    await runFollowPracticeScraper({
      mode: "login",
      profileUrl: buildProfileUrl(payload?.userId),
      userDataDir: runtime.profileDir,
    }),
    "Login failed",
  );
  return { success: true };
};

const clearLoginState = async (_payload, context) => {
  const runtime = await getRuntime(context);
  await fs.rm(runtime.profileDir, { recursive: true, force: true });
  return { success: true };
};

export default {
  scrapeTodos,
  scrapeTodoDetail,
  openLoginWindow,
  clearLoginState,
};
