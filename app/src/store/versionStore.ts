import { proxy } from "valtio";

type LatestReleaseApi = {
  tag_name: string;
};

type VersionState = {
  currentVersion: string;
  latestVersion: string;
  loadingLatestVersion: boolean;
  latestVersionLoadFailed: boolean;
};

const LATEST_RELEASE_API =
  "https://api.github.com/repos/moayuisuda/lookback-release/releases/latest";

function normalizeVersion(tagName: string) {
  return tagName.replace(/^v/i, "");
}

export const versionState = proxy<VersionState>({
  currentVersion: "",
  latestVersion: "",
  loadingLatestVersion: false,
  latestVersionLoadFailed: false,
});

export const versionActions = {
  async loadCurrentVersion() {
    const rawVersion = await window.electron?.getAppVersion?.();
    if (typeof rawVersion !== "string") return;
    const version = rawVersion.trim();
    if (!version) return;
    versionState.currentVersion = normalizeVersion(version);
  },

  async loadLatestVersion() {
    if (versionState.loadingLatestVersion) return;
    versionState.loadingLatestVersion = true;
    versionState.latestVersionLoadFailed = false;
    try {
      // 直接读取 GitHub latest release，确保设置页展示的是实时最新版本。
      const response = await fetch(LATEST_RELEASE_API);
      if (!response.ok) {
        versionState.latestVersionLoadFailed = true;
        return;
      }
      const payload = (await response.json()) as LatestReleaseApi;
      if (typeof payload.tag_name !== "string") {
        versionState.latestVersionLoadFailed = true;
        return;
      }
      const latestVersion = normalizeVersion(payload.tag_name.trim());
      if (!latestVersion) {
        versionState.latestVersionLoadFailed = true;
        return;
      }
      versionState.latestVersion = latestVersion;
      versionState.latestVersionLoadFailed = false;
    } catch {
      versionState.latestVersionLoadFailed = true;
    } finally {
      versionState.loadingLatestVersion = false;
    }
  },

  async refreshVersionInfo() {
    await versionActions.loadCurrentVersion();
    await versionActions.loadLatestVersion();
  },
};
