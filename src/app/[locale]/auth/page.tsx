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
  const alternateLocale = isArabic ? "en" : "ar";
  const languageLabel = isArabic ? "English" : "العربية";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_#e5f3ec_0%,_transparent_38%),radial-gradient(circle_at_bottom_right,_#fff3d8_0%,_transparent_34%),#f4f8f6] px-6 py-12">
      <div className="pointer-events-none absolute -left-24 top-1/4 h-48 w-48 rounded-full bg-[#b9ddcc]/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-1/4 h-56 w-56 rounded-full bg-[#f3bf5b]/20 blur-3xl" />
      <div className="relative w-full max-w-md rounded-[2rem] border border-white/80 bg-white/95 p-8 shadow-2xl shadow-[#176b4d]/10 backdrop-blur sm:p-10">
        <div className="flex items-center justify-between">
          <Link href={`/${locale}`} className="text-xl font-bold text-[#0b5c3b]">صيانة</Link>
          <Link href={`/${alternateLocale}/auth${mode === "register" ? "?mode=register" : ""}`} className="rounded-full px-3 py-1.5 text-sm font-semibold text-[#52635b] hover:bg-[#f6f8f7]">{languageLabel}</Link>
        </div>
        <h1 className="mt-12 text-3xl font-bold tracking-tight text-[#10251b]">{mode === "login" ? (isArabic ? "مرحبًا بعودتك" : "Welcome back") : (isArabic ? "أنشئ حسابك" : "Create your account")}</h1>
        <p className="mt-3 text-base leading-7 text-[#3f5148]">{isArabic ? "أدر طلبات الصيانة بثقة وسهولة." : "Manage maintenance requests with confidence."}</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "register" && <label className="block text-sm font-semibold text-[#17221d]">{isArabic ? "الاسم" : "Name"}<input name="name" required className="mt-2 w-full rounded-xl border-2 border-[#a9c5b7] bg-white px-4 py-3 text-[#17221d] outline-none transition focus:border-[#0b5c3b] focus:ring-4 focus:ring-[#0b5c3b]/15" /></label>}
          {mode === "register" && <label className="block text-sm font-semibold text-[#17221d]">{isArabic ? "نوع الحساب" : "Account type"}<select name="role" defaultValue="TENANT" className="mt-2 w-full rounded-xl border-2 border-[#a9c5b7] bg-white px-4 py-3 text-[#17221d] outline-none transition focus:border-[#0b5c3b] focus:ring-4 focus:ring-[#0b5c3b]/15"><option value="TENANT">{isArabic ? "مستأجر" : "Tenant"}</option><option value="OWNER">{isArabic ? "مالك وحدة أو بناية" : "Unit or building owner"}</option><option value="WORKER">{isArabic ? "فني" : "Worker"}</option></select><span className="mt-1 block text-xs font-normal text-[#52635b]">{isArabic ? "يمكنك إنشاء الحساب بدون بناية، ثم طلب ملكية وحدتك برمز البناية ورقم الوحدة." : "You can create an account without a building, then request unit ownership using the building and unit codes."}</span></label>}
          <label className="block text-sm font-semibold text-[#17221d]">{isArabic ? "البريد الإلكتروني" : "Email"}<input name="email" type="email" required className="mt-2 w-full rounded-xl border-2 border-[#a9c5b7] bg-white px-4 py-3 text-[#17221d] outline-none transition focus:border-[#0b5c3b] focus:ring-4 focus:ring-[#0b5c3b]/15" /></label>
          <label className="block text-sm font-semibold text-[#17221d]">{isArabic ? "كلمة المرور" : "Password"}<input name="password" type="password" minLength={8} required className="mt-2 w-full rounded-xl border-2 border-[#a9c5b7] bg-white px-4 py-3 text-[#17221d] outline-none transition focus:border-[#0b5c3b] focus:ring-4 focus:ring-[#0b5c3b]/15" /></label>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button disabled={pending} className="w-full rounded-xl bg-[#0b5c3b] px-4 py-3.5 font-bold text-white shadow-lg shadow-[#0b5c3b]/25 transition hover:bg-[#08442c] focus:outline-none focus:ring-4 focus:ring-[#f3bf5b] disabled:cursor-not-allowed disabled:bg-[#789487]">{pending ? "..." : (isArabic ? "متابعة" : "Continue")}</button>
        </form>
        <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="mt-6 w-full rounded-xl border-2 border-[#f3bf5b] bg-[#fff8e8] px-4 py-3 text-center text-sm font-bold text-[#6b4a00] transition hover:bg-[#ffefc2] focus:outline-none focus:ring-4 focus:ring-[#f3bf5b]/50">{mode === "login" ? (isArabic ? "ليس لديك حساب؟ أنشئ حسابًا" : "Need an account? Create one") : (isArabic ? "لديك حساب؟ سجل الدخول" : "Already have an account? Sign in")}</button>
      </div>
    </main>
  );
}
