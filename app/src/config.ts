const DEFAULT_API_PORT = 30001;

const buildApiBaseUrl = (port: number): string => `http://localhost:${port}`;

const isValidPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535;

export let API_BASE_URL = buildApiBaseUrl(DEFAULT_API_PORT);

export async function hydrateApiBaseUrl(): Promise<void> {
  if (!window.electron?.getServerPort) return;
  try {
    const port = await window.electron.getServerPort();
    if (!isValidPort(port)) return;
    API_BASE_URL = buildApiBaseUrl(port);
  } catch {
    // Keep default port when IPC is temporarily unavailable.
  }
}
