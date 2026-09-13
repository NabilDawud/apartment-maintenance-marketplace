"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";

export default function AuthPage() {
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState(searchParams.get("mode") === "register" ? "register" : "login");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isArabic = locale === "ar";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const endpoint = mode === "login" ? "sign-in/email" : "sign-up/email";
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          ...(mode === "register" ? { name: form.get("name"), role: form.get("role") } : {}),
        }),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(details?.message || "AUTH_REQUEST_FAILED");
      }
      router.replace(`/${locale}/dashboard`);
      router.refresh();
    } catch {
      setError(isArabic ? "تعذر إكمال العملية. تحقق من البيانات وحاول مرة أخرى." : "Unable to complete the request. Check your details and try again.");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8f7] px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-[#e0e9e4] bg-white p-8 shadow-xl shadow-[#176b4d]/5">
        <Link href={`/${locale}`} className="text-xl font-bold text-[#176b4d]">صيانة</Link>
        <h1 className="mt-10 text-3xl font-bold">{mode === "login" ? (isArabic ? "مرحبًا بعودتك" : "Welcome back") : (isArabic ? "أنشئ حسابك" : "Create your account")}</h1>
        <p className="mt-2 text-[#52635b]">{isArabic ? "أدر طلبات الصيانة بثقة وسهولة." : "Manage maintenance requests with confidence."}</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "register" && <label className="block text-sm font-semibold">{isArabic ? "الاسم" : "Name"}<input name="name" required className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-4 py-3 outline-none focus:border-[#176b4d]" /></label>}
          {mode === "register" && <label className="block text-sm font-semibold">{isArabic ? "نوع الحساب" : "Account type"}<select name="role" defaultValue="TENANT" className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-4 py-3 outline-none focus:border-[#176b4d]"><option value="TENANT">{isArabic ? "مستأجر" : "Tenant"}</option><option value="OWNER">{isArabic ? "مالك عقار" : "Owner"}</option><option value="WORKER">{isArabic ? "فني" : "Worker"}</option></select></label>}
          <label className="block text-sm font-semibold">{isArabic ? "البريد الإلكتروني" : "Email"}<input name="email" type="email" required className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-4 py-3 outline-none focus:border-[#176b4d]" /></label>
          <label className="block text-sm font-semibold">{isArabic ? "كلمة المرور" : "Password"}<input name="password" type="password" minLength={8} required className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-4 py-3 outline-none focus:border-[#176b4d]" /></label>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button disabled={pending} className="w-full rounded-xl bg-[#176b4d] px-4 py-3.5 font-semibold text-white hover:bg-[#11553d] disabled:opacity-60">{pending ? "..." : (isArabic ? "متابعة" : "Continue")}</button>
        </form>
        <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="mt-6 w-full text-center text-sm font-semibold text-[#176b4d]">{mode === "login" ? (isArabic ? "ليس لديك حساب؟ أنشئ حسابًا" : "Need an account? Create one") : (isArabic ? "لديك حساب؟ سجل الدخول" : "Already have an account? Sign in")}</button>
      </div>
    </main>
  );
}
