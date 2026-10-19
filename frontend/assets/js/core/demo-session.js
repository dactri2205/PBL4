const key = "preview-user";
const enabledKey = "preview-enabled";
const query = new URLSearchParams(location.search);
try {
  if (query.get("demo") === "1") sessionStorage.setItem(enabledKey, "1");
} catch {}
export function isPreview() {
  try {
    return sessionStorage.getItem(enabledKey) === "1";
  } catch {
    return query.get("demo") === "1";
  }
}
export function getSessionId() {
  try {
    return isPreview() ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
export function setSession(id) {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {}
  location.reload();
}
export function exitPreview() {
  try {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(enabledKey);
  } catch {}
  location.href = location.pathname;
}
