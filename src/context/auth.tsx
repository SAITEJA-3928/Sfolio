import * as React from "react";
import { normalizeRole, type Role } from "@/context/role";
import { buildAuthApiUrl } from "@/lib/api-config";
import { customFetch, setUnauthorizedHandler } from "@/lib/custom-fetch";

export type SessionUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  user: SessionUser | null;
  login: () => void;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue>({
  isAuthenticated: false,
  user: null,
  login: () => {},
  logout: () => {},
});

const STORAGE_KEY = "gfolio_is_authenticated";
const LAST_ACTIVITY_KEY = "gfolio_last_activity_at";
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const REFRESH_SESSION_ENDPOINT = buildAuthApiUrl("/auth/refreshSession");

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function readStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("user");
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const nested =
      parsed.user && typeof parsed.user === "object"
        ? (parsed.user as Record<string, unknown>)
        : undefined;

    return {
      id: pickString(parsed.id, parsed._id, nested?.id, nested?._id),
      name: pickString(parsed.name, parsed.userName, nested?.name, nested?.userName),
      email: pickString(parsed.email, nested?.email),
      role: pickString(parsed.role, nested?.role),
    };
  } catch {
    return null;
  }
}

export function getUserDisplayName(user: SessionUser | null, fallback = ""): string {
  if (user?.name?.trim()) return user.name.trim();
  const email = user?.email?.trim();
  if (email) {
    const localPart = email.split("@")[0]?.trim();
    if (localPart) return localPart;
    return email;
  }
  return fallback;
}

export function getUserRoleLabel(role?: string, portalRole?: Role): string {
  const normalized = normalizeRole(role);
  if (normalized === "corporate") return "Corporate Admin";
  if (normalized === "marketing") return "Marketing";
  if (normalized === "admin") return "Super Admin";
  if (portalRole === "corporate") return "Corporate Admin";
  if (portalRole === "marketing") return "Marketing";
  return "Super Admin";
}

export function getUserInitials(displayName: string, fallback: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return fallback;
}

function getNow() {
  return Date.now();
}

function persistLastActivity(timestamp: number) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
  } catch {}
}

function readLastActivity() {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function dispatchUnauthorized() {
  window.dispatchEvent(new Event("gfolio:unauthorized"));
}

function isIdle() {
  const lastActivity = readLastActivity() ?? getNow();
  return getNow() - lastActivity >= IDLE_TIMEOUT_MS;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [user, setUser] = React.useState<SessionUser | null>(() =>
    localStorage.getItem(STORAGE_KEY) === "true" ? readStoredUser() : null,
  );

  const syncUser = React.useCallback(() => {
    setUser(readStoredUser());
  }, []);

  const login = React.useCallback(() => {
    setIsAuthenticated(true);
    setUser(readStoredUser());
    const timestamp = getNow();
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
    persistLastActivity(timestamp);
  }, []);

  const logout = React.useCallback(() => {
    setIsAuthenticated(false);
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      localStorage.removeItem("user");
      localStorage.removeItem("id");
    } catch {}
  }, []);

  React.useEffect(() => {
    const handleStorage = () => {
      if (localStorage.getItem(STORAGE_KEY) === "true") {
        syncUser();
      } else {
        setUser(null);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [syncUser]);

  React.useEffect(() => {
    if (!isAuthenticated) return;

    const initialActivity = readLastActivity() ?? getNow();
    persistLastActivity(initialActivity);

    if (getNow() - initialActivity >= IDLE_TIMEOUT_MS) {
      dispatchUnauthorized();
      return;
    }

    let refreshInFlight: Promise<boolean> | null = null;
    let idleTimeoutId: number | null = null;

    const scheduleIdleLogout = () => {
      if (idleTimeoutId != null) {
        window.clearTimeout(idleTimeoutId);
      }

      const lastActivity = readLastActivity() ?? getNow();
      const idleFor = getNow() - lastActivity;
      const delay = Math.max(IDLE_TIMEOUT_MS - idleFor, 0);

      idleTimeoutId = window.setTimeout(() => {
        if (isIdle()) {
          dispatchUnauthorized();
          return;
        }

        scheduleIdleLogout();
      }, delay);
    };

    const markActivity = () => {
      persistLastActivity(getNow());
      scheduleIdleLogout();
    };

    const refreshSession = async () => {
      if (isIdle()) {
        dispatchUnauthorized();
        return false;
      }

      if (refreshInFlight) return refreshInFlight;

      refreshInFlight = (async () => {
        try {
          await customFetch(REFRESH_SESSION_ENDPOINT, {
            method: "GET",
            headers: { "content-type": "application/json" },
            skipAuthRefresh: true,
          });
          return true;
        } catch {
          dispatchUnauthorized();
          return false;
        } finally {
          refreshInFlight = null;
        }
      })();

      return refreshInFlight;
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    scheduleIdleLogout();
    setUnauthorizedHandler(() => refreshSession());

    return () => {
      if (idleTimeoutId != null) {
        window.clearTimeout(idleTimeoutId);
      }
      setUnauthorizedHandler(null);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
    };
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return React.useContext(AuthContext);
}
