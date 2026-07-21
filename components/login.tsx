"use client";

import { useState } from "react";
import { ShieldCheck, Eye, EyeOff, Key, User } from "lucide-react";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export function Login() {
  const login = useStore((s) => s.login);
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      toast.error("Please enter your operator ID / username.");
      return;
    }
    if (!passcode) {
      toast.error("Please enter your operator passcode.");
      return;
    }

    setBusy(true);
    const success = await login(username, passcode);
    setBusy(false);

    if (success) {
      toast.success("Authentication successful. Access granted.");
    } else {
      toast.error("Invalid operator ID or passcode. Access denied.");
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[450px_1fr] lg:grid-cols-[500px_1fr] bg-[#0b0f19] text-white">
      {/* Left Column: Terminal info panel */}
      <div className="relative flex flex-col justify-between bg-gradient-to-b from-[#0a122c] to-[#050917] p-10 border-r border-[#152347] md:min-h-screen">
        <div>
          {/* SECURITY GATE TERMINAL eyebrow */}
          <div className="flex items-center gap-2 mb-6">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-400">
              SECURITY GATE TERMINAL
            </span>
          </div>

          {/* YARDFLOW brand logo */}
          <div className="flex items-center gap-3 mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/yardflow-logo.png"
              alt="YARDFLOW logo"
              className="h-11 w-11 shrink-0 object-contain"
            />
            <h1 className="text-3xl font-black tracking-tight text-white">
              YARDFLOW<span className="text-blue-500 font-normal">™</span>
            </h1>
          </div>
          <p className="text-xs text-[#6e85b2] mb-12">
            Terminal Logistics & Intelligent Routing System
          </p>

          {/* ACTIVE NODE STATUS list */}
          <div className="mt-8">
            <h4 className="text-[10px] font-black tracking-[0.15em] text-[#d97706] mb-6 border-l-2 border-[#d97706] pl-3 uppercase">
              ACTIVE NODE STATUS
            </h4>
            <div className="flex flex-col gap-6 text-xs text-[#a3b8cc]">
              {/* Item 01 */}
              <div className="flex items-start gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#101c3d] text-[10px] font-black text-blue-400 border border-[#1d2f60]">
                  01
                </span>
                <div>
                  <p className="font-bold text-white mb-1">Controlled Site Access</p>
                  <p className="leading-relaxed text-[#7c94b6]">
                    Automated permission check-in limits page views based on assigned operator credentials.
                  </p>
                </div>
              </div>

              {/* Item 02 */}
              <div className="flex items-start gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#101c3d] text-[10px] font-black text-blue-400 border border-[#1d2f60]">
                  02
                </span>
                <div>
                  <p className="font-bold text-white mb-1">Admin-Managed Rights</p>
                  <p className="leading-relaxed text-[#7c94b6]">
                    Control panels enable Administrators to customize screen routes and create operator logins dynamically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer in left panel */}
        <div className="mt-12 text-[10px] font-mono text-[#475b83] tracking-wider uppercase">
          <p>AUTHORIZED SYSTEM PERSONNEL ONLY</p>
          <p className="mt-1">Cubiqlab Technologies &copy; 2026</p>
        </div>
      </div>

      {/* Right Column: Authentication form */}
      <div className="flex items-center justify-center p-8 bg-[#070b14] sm:p-12 md:p-16 lg:p-24">
        <div className="w-full max-w-[400px]">
          <h2 className="text-2xl font-extrabold tracking-tight text-white mb-1.5">
            Operator Sign In
          </h2>
          <p className="text-xs text-[#62779c] mb-8">
            Enter your terminal ID and passcode to verify access rights.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Operator ID Input */}
            <div>
              <label className="mb-2 block text-[10px] font-black tracking-wider text-[#798fae] uppercase">
                OPERATOR ID / USERNAME
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#405473]">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. op-101"
                  className="w-full rounded-lg border border-[#16223b] bg-[#0d1424] py-3.5 pl-11 pr-4 text-sm text-white placeholder-[#384c6c] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-900/40"
                />
              </div>
            </div>

            {/* Operator Passcode Input */}
            <div>
              <label className="mb-2 block text-[10px] font-black tracking-wider text-[#798fae] uppercase">
                OPERATOR PASSCODE
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#405473]">
                  <Key size={16} />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-[#16223b] bg-[#0d1424] py-3.5 pl-11 pr-11 text-sm text-white placeholder-[#384c6c] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-900/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#405473] hover:text-[#798fae]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-lg bg-blue-600 py-3.5 text-sm font-bold text-white transition-all hover:bg-blue-500 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 shadow-lg shadow-blue-900/20"
            >
              <ShieldCheck size={18} />
              {busy ? "Verifying..." : "Verify Credentials"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
