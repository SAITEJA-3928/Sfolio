import * as React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useRole, normalizeRole, type Role } from "@/context/role";
import { useAuth } from "@/context/auth";
import { Eye, EyeOff } from "lucide-react";
import gfolioLogoIcon from "@/assets/app icon.png";
import logo from "@/assets/logo5.png";
import { customFetch } from "@/lib/custom-fetch";
import { buildAuthApiUrl } from "@/lib/api-config";
import { encryptPassword } from "@/utils/encryption";
const ADMIN_LOGIN_ENDPOINT = buildAuthApiUrl("/auth/adminlogin");

type LoginResponse = {
  status?: number;
  message?: string;
  data?: {
    user?: {
      id?: string;
      name?: string;
      email?: string;
      role?: string;
      isActive?: boolean;
      loginCount?: number;
    };
  };
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function Login() {
  const { role, lockRole } = useRole();
  const { isAuthenticated, login } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  function dashboardRouteForRole(nextRole: Role = role) {
    if (nextRole === "corporate") return "/corporate";
    if (nextRole === "marketing") return "/notifications";
    return "/";
  }

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(dashboardRouteForRole(), { replace: true });
    }
  }, [isAuthenticated]);



  async function handleLogin() {
  const normalizedEmail = email.trim().toLowerCase();
    const passwordValue = password;

    if (!normalizedEmail) {
      toast({ title: "Missing email", description: "Enter your email address." });
      return;
    }

    if (!isEmail(normalizedEmail)) {
      toast({ title: "Invalid email", description: "Enter a valid email address." });
      return;
    }

    if (!passwordValue.trim()) {
      toast({ title: "Missing password", description: "Enter your password." });
      return;
    }

    setLoading(true);

    try {
      const { encrypted, iv } = await encryptPassword(passwordValue);

      const response = await customFetch<LoginResponse>(ADMIN_LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password: encrypted,
          iv: iv,
        }),
      });

      const user = response?.data?.user;
      const nextRole = normalizeRole(user?.role) ?? "admin";

      lockRole(nextRole);

      try {
        localStorage.setItem("user", JSON.stringify(user ?? {}));
        if (user?.id) {
          localStorage.setItem("id", user.id);
        }
      } catch {}

      toast({
        title: "Logged in",
        description: response?.message ?? "Login successful.",
      });

      login();
      navigate(dashboardRouteForRole(nextRole), { replace: true });

    } catch (error: any) {
      toast({
        title: "Login failed",
        description:
          error?.message || "Unable to sign in. Check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#032f31] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-8 py-10 sm:px-12 lg:px-20">
        <div className="hidden flex-1 items-center justify-center lg:flex">
          <div className="flex items-center gap-5">
            <div className="flex h-18 w-18  items-center justify-center rounded-3xl border border-white/10 ">
              <img src={gfolioLogoIcon} alt="Gfolio logo" className="max-h-full w-auto object-contain" />
            </div>
            <div className="space-y-1">
              <img src={logo} alt="logo" className="h-10 w-auto mb-2" />
              <p className="text-sm uppercase tracking-[0.28em] text-emerald-200/70">
                Admin Portal
              </p>
            </div>
          </div>
        </div>

        <div className="mx-10 hidden h-[320px] w-px bg-white/35 lg:block" />

        <div className="flex flex-1 justify-center lg:justify-start">
          <div className="w-full max-w-[360px] space-y-8">
            <div className="space-y-2 text-center lg:text-left">
              <div className="flex justify-center lg:hidden mb-4">
                <img src={logo} alt="logo" className="h-12 w-auto object-contain mb-2" />
              </div>

              <h1 className="text-4xl font-light tracking-wide text-white">Welcome</h1>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/65">
                Please login to admin dashboard.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleLogin();
              }}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/65">
                  Username
                </label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="username"
                  className="h-10 rounded-sm border-[#cfd7da] bg-[#eef2f3] text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/65">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-10 rounded-sm border-[#cfd7da] bg-[#eef2f3] pr-10 text-sm text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-3">
                <Button
                  className="h-9 w-full rounded-sm border-0 bg-emerald-500 text-[11px] font-semibold uppercase tracking-[0.24em] text-white shadow-none transition hover:bg-emerald-400 cursor-pointer"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "Signing In..." : "Login"}
                </Button>
                <button
                  type="button"
                  onClick={() => navigate("/forgotpassword")}
                  className="mx-auto block cursor-pointer text-center text-[10px] uppercase tracking-[0.22em] text-white/55 transition hover:text-emerald-200"
                >
                  Forgot password?
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
