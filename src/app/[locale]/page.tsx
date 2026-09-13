import Link from "next/link";

const features = [
  ["⌂", "إدارة العقار", "أضف المباني والوحدات وتابع طلبات السكان من مكان واحد."],
  ["✓", "عمال موثوقون", "تواصل مع فنيين معتمدين حسب التخصص والمنطقة."],
  ["↗", "شفافية كاملة", "قارن العروض وتابع حالة الإصلاح حتى إغلاق الطلب."],
];

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isArabic = locale === "ar";

  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f8f7] text-[#17221d]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href={`/${locale}`} className="text-xl font-bold tracking-tight text-[#176b4d]">صيانة</Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/${isArabic ? "en" : "ar"}`} className="rounded-full px-4 py-2 text-[#52635b] hover:bg-white">{isArabic ? "English" : "العربية"}</Link>
          <Link href={`/${locale}/auth`} className="rounded-full border border-[#c8d7d0] bg-white px-5 py-2.5 font-semibold hover:border-[#176b4d]">{isArabic ? "تسجيل الدخول" : "Sign in"}</Link>
        </div>
      </nav>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:pt-20">
        <div className={isArabic ? "text-right" : "text-left"}>
          <p className="mb-5 inline-flex rounded-full bg-[#dcefe6] px-4 py-2 text-sm font-semibold text-[#176b4d]">{isArabic ? "حل واحد لكل احتياجات الصيانة" : "One place for every maintenance need"}</p>
          <h1 className="max-w-2xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl">{isArabic ? "صيانة أسهل،" : "Property care,"} <span className="text-[#176b4d]">{isArabic ? "منازل أفضل." : "made simple."}</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#52635b]">{isArabic ? "منصة موثوقة تربط ملاك العقارات والسكان بأفضل عمال الصيانة، مع متابعة واضحة من الطلب إلى الإنجاز." : "A trusted marketplace connecting owners and residents with skilled maintenance workers, from request to completion."}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={`/${locale}/auth?mode=register`} className="rounded-full bg-[#176b4d] px-7 py-3.5 font-semibold text-white shadow-lg shadow-[#176b4d]/20 hover:bg-[#11553d]">{isArabic ? "ابدأ الآن مجانًا" : "Get started free"}</Link>
            <Link href="#how-it-works" className="rounded-full border border-[#c8d7d0] bg-white px-7 py-3.5 font-semibold hover:border-[#176b4d]">{isArabic ? "كيف تعمل المنصة؟" : "How it works"}</Link>
          </div>
        </div>
        <div className="relative rounded-[2rem] bg-[#176b4d] p-8 text-white shadow-2xl shadow-[#176b4d]/20 sm:p-12">
          <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-[#f3bf5b]" />
          <div className="relative">
            <p className="text-sm text-[#b9ddcc]">{isArabic ? "لوحة المتابعة" : "Your maintenance board"}</p>
            <div className="mt-8 rounded-2xl bg-white/10 p-5 backdrop-blur">
              <div className="flex items-center justify-between"><span className="font-semibold">{isArabic ? "تسرب في المطبخ" : "Kitchen leak"}</span><span className="rounded-full bg-[#f3bf5b] px-3 py-1 text-xs font-bold text-[#17221d]">{isArabic ? "قيد التنفيذ" : "In progress"}</span></div>
              <div className="mt-5 h-2 rounded-full bg-white/20"><div className="h-2 w-2/3 rounded-full bg-[#f3bf5b]" /></div>
              <p className="mt-3 text-sm text-[#b9ddcc]">{isArabic ? "تم تعيين فني معتمد • اليوم" : "Certified worker assigned • Today"}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/10 p-5"><p className="text-3xl font-bold">24</p><p className="mt-1 text-sm text-[#b9ddcc]">{isArabic ? "طلبًا مغلقًا" : "Requests closed"}</p></div>
              <div className="rounded-2xl bg-white/10 p-5"><p className="text-3xl font-bold">4.9</p><p className="mt-1 text-sm text-[#b9ddcc]">{isArabic ? "تقييم الفنيين" : "Worker rating"}</p></div>
            </div>
          </div>
        </div>
      </section>
      <section id="how-it-works" className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-3 lg:px-8">
        {features.map(([icon, title, description]) => <article key={title} className="rounded-3xl border border-[#e0e9e4] bg-white p-7"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e5f3ec] text-xl font-bold text-[#176b4d]">{icon}</span><h2 className="mt-5 text-xl font-bold">{title}</h2><p className="mt-2 leading-7 text-[#52635b]">{description}</p></article>)}
      </section>
    </main>
  );
}
