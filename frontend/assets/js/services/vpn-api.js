export class VpnApiError extends Error {
  constructor(status, code, message, correlationId = "") {
    super(message);
    Object.assign(this, { status, code, correlationId });
  }
}

// Same-origin only. This module never reads demo-session or browser storage and never
// substitutes mock data for failed requests. Secrets for the control API stay on the server.
export function createVpnApi({ basePath = "/api/vpn", fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (!basePath.startsWith("/") || basePath.startsWith("//") || /[?#\\]/.test(basePath))
    throw Error("VPN API base path must be a same-origin path.");
  const base = basePath.replace(/\/$/, "");
  let csrfToken = "";
  async function request(path, { method = "GET", body, signal } = {}) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
    try {
      const response = await fetchImpl(`${base}/${path}`, {
        method, headers, credentials: "same-origin", cache: "no-store",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
      });
      if (response.status === 204) return null;
      let payload;
      try { payload = await response.json(); }
      catch { throw new VpnApiError(response.status >= 400 ? response.status : 502, "invalid_response", "Máy chủ chưa cung cấp API VPN hợp lệ."); }
      if (!response.ok) throw new VpnApiError(response.status, payload.error?.code || "request_failed",
        payload.error?.message || "Không thể xử lý yêu cầu VPN.", payload.error?.correlationId);
      return payload;
    } catch (error) {
      if (error instanceof VpnApiError || signal?.aborted) throw error;
      throw new VpnApiError(0, timeout.signal.aborted ? "timeout" : "offline", "Mất kết nối hoặc máy chủ không phản hồi.");
    } finally { clearTimeout(timer); }
  }
  const segment = (value) => encodeURIComponent(value);
  return {
    async session(options) {
      const session = await request("auth/session", options);
      csrfToken = session.csrfToken || "";
      return session;
    },
    async login(username, password, signal) {
      await request("auth/login", { method: "POST", body: { username, password }, signal });
      return this.session({ signal });
    },
    async logout(signal) {
      await request("auth/logout", { method: "POST", signal });
      csrfToken = "";
    },
    overview: (options) => request("overview", options),
    health: (options) => request("health", options),
    metrics: (options) => request("metrics", options),
    accounts: (options) => request("accounts", options),
    sessions: (options) => request("sessions", options),
    alerts: (options) => request("alerts", options),
    logs: (filters = {}, options = {}) => {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "" && value != null));
      return request(`logs?${query}`, options);
    },
    createAccount: (values, signal) => request("accounts", { method: "POST", body: values, signal }),
    setEnabled: (username, enabled, signal) => request(`accounts/${segment(username)}/${enabled ? "enable" : "disable"}`, { method: "POST", signal }),
    resetPassword: (username, password, signal) => request(`accounts/${segment(username)}/password`, { method: "POST", body: { password }, signal }),
    deleteAccount: (username, signal) => request(`accounts/${segment(username)}`, { method: "DELETE", signal }),
    disconnectSession: (id, signal) => request(`sessions/${segment(id)}/disconnect`, { method: "POST", signal }),
    disconnectUser: (username, signal) => request(`accounts/${segment(username)}/disconnect`, { method: "POST", signal }),
  };
}
export const vpnApi = createVpnApi();
