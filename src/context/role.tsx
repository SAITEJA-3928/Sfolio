import * as React from "react";

export type Role = "admin" | "corporate" | "marketing";

const STORAGE_KEY = "gfolio_role";
const LOCK_KEY = "gfolio_role_locked";

export function normalizeRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (
    normalized === "admin" ||
    normalized === "super-admin" ||
    normalized === "superadmin"
  ) {
    return "admin";
  }

  if (
    normalized === "corporate" ||
    normalized === "corporate-admin" ||
    normalized === "corporateadmin"
  ) {
    return "corporate";
  }

  if (
    normalized === "marketing" ||
    normalized === "marketing-admin" ||
    normalized === "marketingadmin"
  ) {
    return "marketing";
  }

  return null;
}

export function getStoredRole(): Role {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return normalizeRole(saved) ?? "admin";
  } catch {
    return "admin";
  }
}

interface RoleContextValue {
  role: Role;
  setRole: (r: Role) => void;
  lockRole: (r: Role) => void;
  unlockRole: () => void;
  lockedRole: Role | null;
}

const RoleContext = React.createContext<RoleContextValue>({
  role: "admin",
  setRole: () => {},
  lockRole: () => {},
  unlockRole: () => {},
  lockedRole: null,
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = React.useState<Role>(() => getStoredRole());

  const [lockedRole, setLockedRoleState] =
    React.useState<Role | null>(() => {
      try {
        const saved = localStorage.getItem(LOCK_KEY);
        return normalizeRole(saved) ?? null;
      } catch {
        return null;
      }
    });

  const setRole = (r: Role) => {
    if (lockedRole && lockedRole !== r) return;

    setRoleState(r);

    try {
      localStorage.setItem(STORAGE_KEY, r);
    } catch {}
  };

  const lockRole = (r: Role) => {
    setLockedRoleState(r);
    setRoleState(r);
    try {
      localStorage.setItem(STORAGE_KEY, r);
      localStorage.setItem(LOCK_KEY, r);
    } catch {}
  };

  const unlockRole = () => {
    setLockedRoleState(null);
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {}
  };

  React.useEffect(() => {
    const handleStorage = () => {
      setRoleState(getStoredRole());
      try {
        const savedLock = localStorage.getItem(LOCK_KEY);
        setLockedRoleState(normalizeRole(savedLock));
      } catch {
        setLockedRoleState(null);
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return (
    <RoleContext.Provider
      value={{
        role,
        setRole,
        lockRole,
        unlockRole,
        lockedRole,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return React.useContext(RoleContext);
}