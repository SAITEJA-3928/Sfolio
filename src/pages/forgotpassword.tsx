import * as React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import gfolioLogoIcon from "@/assets/app icon.png";
import logo from "@/assets/logo5.png";
import { customFetch } from "@/lib/custom-fetch";
import { buildAuthApiUrl } from "@/lib/api-config";

const FORGOT_PASSWORD_ENDPOINT = buildAuthApiUrl("/auth/forgotPassword");

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleForgotPassword() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      toast({ title: "Missing email", description: "Enter your email address." });
      return;
    }

    if (!isEmail(normalizedEmail)) {
      toast({ title: "Invalid email", description: "Enter a valid email address." });
      return;
    }

    setLoading(true);

    try {
      const response = await customFetch<{ message?: string }>(FORGOT_PASSWORD_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      toast({
        title: "Reset link sent",
        description:
          response?.message ??
          `Password reset link sent to ${normalizedEmail}. Open the link from your email to continue.`,
      });
    } catch (error: any) {
      toast({
        title: "Request failed",
        description: error?.message || "Unable to send reset link right now.",
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
            <div className="flex h-18 w-18 items-center justify-center rounded-3xl border border-white/10">
              <img src={gfolioLogoIcon} alt="Gfolio logo" className="max-h-full w-auto object-contain" />
            </div>
            <div className="space-y-1">
              <img src={logo} alt="logo" className="h-8 w-auto mb-2" />
              <p className="text-sm uppercase tracking-[0.28em] text-emerald-200/70">Forgot Password</p>
            </div>
          </div>
        </div>

        <div className="mx-10 hidden h-[320px] w-px bg-white/35 lg:block" />

        <div className="flex flex-1 justify-center lg:justify-start">
          <div className="w-full max-w-[360px] space-y-8">
            <div className="space-y-2 text-center lg:text-left">
              <h1 className="text-4xl font-light tracking-wide text-white">Forgot Password</h1>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/65">
                We&apos;ll send a reset link to your email.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleForgotPassword();
              }}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/65">
                  Email
                </label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  className="h-10 rounded-sm border-[#cfd7da] bg-[#eef2f3] text-sm text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-3 pt-3">
                <Button
                  className="h-9 w-full rounded-sm border-0 bg-emerald-500 text-[11px] font-semibold uppercase tracking-[0.24em] text-white shadow-none transition hover:bg-emerald-400 cursor-pointer"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="mx-auto block cursor-pointer text-center text-[10px] uppercase tracking-[0.22em] text-white/55 transition hover:text-emerald-200"
                >
                  Back to login
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
