"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton({ locale }: { locale: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function logout() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("SIGN_OUT_FAILED");
      router.replace(`/${locale}/auth`);
      router.refresh();
    } catch {
      setPending(false);
      setError(true);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-red-700">تعذر تسجيل الخروج</span>}
      <button type="button" onClick={logout} disabled={pending} className="rounded-full border border-[#c8d7d0] bg-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
        {pending ? "..." : "تسجيل الخروج"}
      </button>
    </div>
  );
}
