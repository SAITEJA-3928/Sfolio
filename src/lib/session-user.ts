export function readLoggedInUserEmail(): string {
  if (typeof window === "undefined") return "";

  try {
    const rawUser = window.localStorage.getItem("user");
    if (!rawUser) return "";

    const parsed = JSON.parse(rawUser) as Record<string, unknown>;
    const nested =
      parsed.user && typeof parsed.user === "object"
        ? (parsed.user as Record<string, unknown>)
        : parsed.data && typeof parsed.data === "object"
          ? (parsed.data as Record<string, unknown>)
          : null;

    const directEmail = parsed.email;
    if (typeof directEmail === "string" && directEmail.trim()) {
      return directEmail.trim().toLowerCase();
    }

    const nestedEmail = nested?.email;
    if (typeof nestedEmail === "string" && nestedEmail.trim()) {
      return nestedEmail.trim().toLowerCase();
    }

    return "";
  } catch {
    return "";
  }
}
