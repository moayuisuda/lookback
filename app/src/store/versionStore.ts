import { proxy } from "valtio";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "not-published"
  | "downloading"
  | "downloaded"
  | "error"
  | "unsupported";

type UpdaterPayload = {
  enabled: boolean;
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string;
  downloadProgress: number;
  errorMessage: string;
};

type VersionState = {
  currentVersion: string;
  latestVersion: string;
  updateEnabled: boolean;
  updateStatus: UpdateStatus;
  downloadProgress: number;
  errorMessage: string;
};

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, "");
}

function applyUpdaterState(payload: Partial<UpdaterPayload>) {
  if (typeof payload.enabled === "boolean") {
    versionState.updateEnabled = payload.enabled;
  }

  if (typeof payload.status === "string") {
    versionState.updateStatus = payload.status;
  }

  if (typeof payload.currentVersion === "string") {
    versionState.currentVersion = normalizeVersion(payload.currentVersion);
  }

  if (typeof payload.latestVersion === "string") {
    versionState.latestVersion = normalizeVersion(payload.latestVersion);
  }

  if (typeof payload.downloadProgress === "number") {
    versionState.downloadProgress = Math.max(
      0,
      Math.min(100, payload.downloadProgress),
    );
  }

  if (typeof payload.errorMessage === "string") {
    versionState.errorMessage = payload.errorMessage.trim();
  }
}

export const versionState = proxy<VersionState>({
  currentVersion: "",
  latestVersion: "",
  updateEnabled: false,
  updateStatus: "idle",
  downloadProgress: 0,
  errorMessage: "",
});

let initTask: Promise<void> | null = null;
let hasUpdaterSubscription = false;

async function syncUpdaterState() {
  const payload = await window.electron?.getUpdaterState?.();
  if (!payload) return;
  applyUpdaterState(payload);
}

export const versionActions = {
  async init() {
    if (!initTask) {
      initTask = (async () => {
        if (!hasUpdaterSubscription && window.electron?.onUpdaterState) {
          hasUpdaterSubscription = true;
          window.electron.onUpdaterState((payload) => {
            applyUpdaterState(payload);
          });
        }

        await syncUpdaterState();
      })();
    }

    await initTask;
  },

  async checkForUpdates() {
    await versionActions.init();
    const result = await window.electron?.checkAppUpdate?.();
    if (!result) return;
    if (result.success) return;

    versionState.updateStatus = "error";
    versionState.errorMessage = result.error?.trim() || "";
  },

  async downloadUpdate() {
    await versionActions.init();
    const result = await window.electron?.downloadAppUpdate?.();
    if (!result) return;
    if (result.success) return;

    versionState.updateStatus = "error";
    versionState.errorMessage = result.error?.trim() || "";
  },

  async quitAndInstallUpdate() {
    await versionActions.init();
    const result = await window.electron?.quitAndInstallAppUpdate?.();
    if (!result) return;
    if (result.success) return;

    versionState.updateStatus = "error";
    versionState.errorMessage = result.error?.trim() || "";
  },
};
