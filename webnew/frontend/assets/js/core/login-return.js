// Redirect targets are an explicit list of local pages, never an arbitrary URL.
export function loginReturnTarget(search = "") {
  const value = new URLSearchParams(search).get("returnTo");
  return ["vpn-admin.html", "admin.html", "work.html", "department.html"].includes(value) ? value : "index.html";
}
