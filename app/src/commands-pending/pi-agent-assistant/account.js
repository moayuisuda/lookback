import { TWO_MOONS_API_BASE } from "./serviceConfig.js";

const REFRESH_BUFFER_SECONDS = 2 * 24 * 60 * 60;

const readResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || `HTTP ${response.status}`));
  }
  return data;
};

const normalizeAccount = (account, fallbackName) => ({
  token: String(account.token || ""),
  name: String(account.name || fallbackName),
  id: String(account.id || ""),
  role: String(account.role || "user"),
});

const isTokenExpiringSoon = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return !payload.exp || payload.exp - Math.floor(Date.now() / 1000) < REFRESH_BUFFER_SECONDS;
  } catch {
    return true;
  }
};

export const loginAccount = async (payload) => {
  const name = String(payload?.name || "").trim();
  const password = String(payload?.password || "");
  if (!name || !password) throw new Error("请输入用户名和密码");

  const response = await fetch(`${TWO_MOONS_API_BASE}/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  const account = await readResponse(response);
  return normalizeAccount(account, name);
};

export const refreshAccount = async (payload) => {
  const token = String(payload?.token || "").trim();
  if (!token) throw new Error("NO TOKEN PROVIDED");
  if (!payload?.force && !isTokenExpiringSoon(token)) return { refreshed: false };

  const response = await fetch(`${TWO_MOONS_API_BASE}/user/refresh-token`, {
    method: "POST",
    headers: { "authorization-auth": token },
  });
  const account = await readResponse(response);
  return { ...normalizeAccount(account, ""), refreshed: true };
};
