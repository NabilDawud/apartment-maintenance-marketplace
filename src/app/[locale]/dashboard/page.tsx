import { redirect } from "next/navigation";
import { ProfileStatus, Role, RequestStatus } from "@prisma/client";
import { db } from "@/server/db";
import { getSession, getSessionRole } from "@/server/session";
import LogoutButton from "./logout-button";
import DashboardTabs from "./dashboard-tabs";
import {
  addComment,
  awardOffer,
  createBuilding,
  createMaintenanceRequest,
  createProcurement,
  createUnit,
  decideMembership,
  markNotificationRead,
  reviewWorkerProfile,
  requestMembership,
  requestUnitOwnership,
  decideUnitOwnership,
  respondTenderInvitation,
  submitOffer,
  submitOwnerFeedback,
  submitTenantFeedback,
  sendOfferMessage,
  submitWorkerProfile,
  updateMaintenanceStatus,
} from "@/server/actions";

export const dynamic = "force-dynamic";

const statusLabels: Record<RequestStatus, string> = {
  SUBMITTED: "مُرسل",
  PROCUREMENT: "قيد البحث عن فني",
  ASSIGNED: "تم التعيين",
  IN_PROGRESS: "قيد التنفيذ",
  AWAITING_TENANT_CONFIRMATION: "بانتظار تأكيد المستأجر",
  TENANT_CONFIRMED: "أكد المستأجر",
  CLOSED: "مغلق",
  CANCELLED: "ملغى",
  REJECTED: "مرفوض",
};

const workerDirectorySelect = {
  id: true,
  user: { select: { name: true, email: true } },
  categories: { select: { categoryId: true } },
  workOrders: { select: { id: true, request: { select: { status: true } } } },
  tenantFeedbacks: { select: { rating: true, comment: true } },
  ownerFeedbacks: { select: { rating: true, comment: true } },
} as const;

const actionMessages: Record<string, string> = {
  "error-invalid_name": "يرجى إدخال اسم صحيح.",
  "error-invalid_address": "يرجى إدخال عنوان صحيح.",
  "error-invalid_area": "يرجى إدخال منطقة صحيحة.",
  "error-invalid_unitlabel": "يرجى إدخال رقم وحدة صحيح.",
  "error-invalid_buildingid": "يرجى اختيار بناية صحيحة.",
  "error-building_not_found": "البناية غير موجودة أو لا تملك صلاحية إدارتها.",
  "error-forbidden": "لا تملك صلاحية تنفيذ هذه العملية.",
  "error-tenancy_not_found": "لا توجد عضوية نشطة لهذه الوحدة.",
  "error-category_not_found": "فئة الخدمة غير موجودة أو غير مفعلة.",
  "error-profile_taxonomy_required": "اختر فئة خدمة ومنطقة عمل واحدة على الأقل.",
  "error-invalid_profile_taxonomy": "اختيارات الملف المهني غير صالحة.",
  "error-invalid_experience": "سنوات الخبرة يجب أن تكون بين 0 و80.",
  "error-workers_required": "اختر فنيًا واحدًا على الأقل أو استخدم المناقصة العامة.",
  "error-invalid_worker_selection": "أحد الفنيين المختارين غير معتمد أو لا يطابق الفئة.",
  "error-invalid_request_status": "حالة طلب الصيانة لا تسمح بهذه العملية.",
  "error-procurement_already_open": "توجد مناقصة مفتوحة لهذا الطلب بالفعل.",
  "error-invalid_deadline": "يجب أن يكون الموعد النهائي في المستقبل.",
  "error-invalid_budget": "الميزانية يجب أن تكون رقمًا صحيحًا غير سالب.",
  "error-invalid_valid_until": "تاريخ انتهاء العرض يجب أن يكون في المستقبل.",
  "error-procurement_not_available": "المناقصة لم تعد متاحة أو أُغلقت.",
  "error-profile_not_approved": "يجب اعتماد ملفك المهني قبل إرسال العرض.",
  "error-invitation_not_available": "دعوة المناقصة غير متاحة.",
  "error-offer_already_submitted": "لقد أرسلت عرضًا لهذه المناقصة مسبقًا.",
  "error-offer_not_available": "العرض غير متاح أو لم يعد مفتوحًا.",
  "error-request_changed": "تم تحديث الطلب من مستخدم آخر. حدّث الصفحة وحاول مجددًا.",
  "error-feedback_not_available": "التقييم غير متاح في حالة الطلب الحالية.",
  "error-feedback_exists": "تم إرسال التقييم مسبقًا.",
  "error-request_not_found": "طلب الصيانة غير موجود.",
  "error-invalid_status_transition": "لا يمكن الانتقال إلى حالة الطلب المختارة.",
  "error-action_failed": "تعذر تنفيذ العملية حاليًا. تحقق من البيانات وحاول مجددًا.",
  "error-unauthorized": "انتهت جلسة الدخول. سجل الدخول مجددًا.",
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-[#e0e9e4] bg-white p-6 shadow-sm ${className}`}>{children}</section>;
}

function Input({ name, label, required = true, type = "text" }: { name: string; label: string; required?: boolean; type?: string }) {
  return <label className="block text-sm font-semibold">{label}<input name={name} type={type} required={required} className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-3 py-2.5 outline-none focus:border-[#176b4d]" /></label>;
}

function Button({ children }: { children: React.ReactNode }) {
  return <button className="rounded-xl bg-[#176b4d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#11553d]">{children}</button>;
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();
  if (!session) redirect(`/${locale}/auth`);
  const role = getSessionRole(session);
  const message = (await searchParams).message;
  const isEnglish = locale === "en";
  const userId = session.user.id;

  const [buildings, ownedUnits, tenancies, categories, areas, requests, profile, memberships, ownerMemberships, ownershipRequests, pendingWorkers, ownerWorkers, availableWorkers, workerProcurements, notifications] = await Promise.all([
    role === Role.OWNER
      ? db.building.findMany({ where: { ownerId: userId, archivedAt: null }, include: { units: { where: { archivedAt: null }, orderBy: { label: "asc" } } } })
      : Promise.resolve([]),
    role === Role.OWNER
      ? db.unit.findMany({ where: { ownerId: userId, archivedAt: null, building: { ownerId: { not: userId } } }, include: { building: true }, orderBy: [{ building: { name: "asc" } }, { label: "asc" }] })
      : Promise.resolve([]),
    role === Role.TENANT
      ? db.tenancy.findMany({ where: { tenantId: userId, endedAt: null }, include: { unit: { include: { building: true } } }, orderBy: { startedAt: "desc" } })
      : Promise.resolve([]),
    role === Role.TENANT || role === Role.WORKER
      ? db.serviceCategory.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" } })
      : Promise.resolve([]),
    role === Role.WORKER
      ? db.serviceArea.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })
      : Promise.resolve([]),
    role && [Role.TENANT, Role.OWNER, Role.WORKER, Role.SUPER_ADMIN].includes(role)
      ? db.maintenanceRequest.findMany({
          where: role === Role.TENANT ? { tenantId: userId } : role === Role.OWNER ? { OR: [{ unit: { ownerId: userId } }, { unit: { building: { ownerId: userId, canManageUnitRequests: true } } }] } : role === Role.WORKER ? { workOrders: { some: { workerId: userId } } } : {},
          include: {
            unit: { include: { building: true } },
            category: true,
            comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
            workOrders: {
              select: {
                id: true,
                workerId: true,
                worker: { select: { user: { select: { name: true } } } },
                tenantFeedback: { select: { id: true, rating: true, comment: true } },
                ownerFeedback: { select: { id: true, rating: true, comment: true } },
              },
            },
            procurements: {
              orderBy: { roundNumber: "desc" },
              include: {
                invitations: { include: { worker: { include: { user: true } } } },
                offers: { include: { worker: { include: { user: true } }, messages: { include: { author: true }, orderBy: { createdAt: "asc" } } } },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    role === Role.WORKER ? db.workerProfile.findUnique({ where: { id: userId }, include: { categories: true, serviceAreas: true, tenantFeedbacks: { select: { rating: true, comment: true } }, ownerFeedbacks: { select: { rating: true, comment: true } } } }) : Promise.resolve(null),
    role === Role.TENANT ? db.membershipRequest.findMany({ where: { tenantId: userId }, include: { unit: { include: { building: true } } }, orderBy: { submittedAt: "desc" } }) : Promise.resolve([]),
    role === Role.OWNER ? db.membershipRequest.findMany({ where: { unit: { ownerId: userId }, state: "PENDING" }, include: { tenant: true, unit: { include: { building: true } } }, orderBy: { submittedAt: "asc" } }) : Promise.resolve([]),
    role === Role.OWNER ? db.unitOwnershipRequest.findMany({ where: { unit: { building: { ownerId: userId } }, state: "PENDING" }, include: { applicant: true, unit: { include: { building: true } } }, orderBy: { submittedAt: "asc" } }) : Promise.resolve([]),
    role === Role.SUPER_ADMIN ? db.workerProfile.findMany({ where: { status: "PENDING_REVIEW" }, include: { user: true, categories: { include: { category: true } }, serviceAreas: { include: { area: true } } }, orderBy: { submittedAt: "asc" } }) : Promise.resolve([]),
    role === Role.OWNER
      ? db.workerProfile.findMany({ where: { status: ProfileStatus.APPROVED }, select: workerDirectorySelect, orderBy: { user: { name: "asc" } } })
      : Promise.resolve([]),
    role === Role.TENANT
      ? db.workerProfile.findMany({ where: { status: ProfileStatus.APPROVED }, select: workerDirectorySelect, orderBy: { user: { name: "asc" } } })
      : Promise.resolve([]),
    role === Role.WORKER
      ? db.procurement.findMany({
          where: { state: "OPEN", OR: [{ mode: "PUBLIC" }, { invitations: { some: { workerId: userId } } }] },
          include: {
            request: { include: { unit: { include: { building: true } }, category: true } },
            offers: { where: { workerId: userId }, include: { messages: { include: { author: true }, orderBy: { createdAt: "asc" } } }, },
          },
          orderBy: { openedAt: "desc" },
        })
      : Promise.resolve([]),
    db.notification.findMany({ where: { recipientId: userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const unreadNotifications = notifications.filter((notification) => !notification.readAt).length;

  const title = role === Role.OWNER ? "لوحة المالك" : role === Role.TENANT ? "لوحة المستأجر" : role === Role.WORKER ? "لوحة الفني" : role === Role.SUPER_ADMIN ? "لوحة الإدارة" : "لوحتك";
  return (
    <main className="min-h-screen bg-[#f6f8f7] px-5 py-8 text-[#17221d]" dir={isEnglish ? "ltr" : "rtl"}>
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-semibold text-[#176b4d]">صيانة</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-1 text-[#52635b]">مرحبًا، {session.user.name}</p></div>
          <LogoutButton locale={locale} />
        </header>
        {message && <p className={`mt-6 rounded-xl px-4 py-3 text-sm font-semibold ${message.startsWith("error-") || message.includes("not-found") || message.includes("exists") || message.includes("already") ? "bg-[#fff1f0] text-[#a33a32]" : "bg-[#e3f3e9] text-[#176b4d]"}`}>{actionMessages[message] ?? (message === "membership-requested" ? "تم إرسال طلب الانضمام، وسيظهر الآن لدى مالك الوحدة للموافقة." : message === "membership-building-not-found" || message === "ownership-building-not-found" ? "رمز البناية غير صحيح أو البناية غير موجودة." : message === "membership-unit-not-found" || message === "ownership-unit-not-found" ? "رقم الوحدة غير موجود داخل هذه البناية." : message === "membership-exists" ? "لديك طلب قائم أو عضوية موجودة لهذه الوحدة." : message === "ownership-requested" ? "تم إرسال طلب ملكية الوحدة إلى مالك البناية للموافقة." : message === "ownership-request-exists" ? "لديك طلب ملكية قيد المراجعة لهذه الوحدة." : message === "ownership-already-owned" ? "أنت مالك هذه الوحدة بالفعل." : "تم حفظ العملية بنجاح.")}</p>}
        <div className="mt-8">
          {!role && <Card><h2 className="text-xl font-bold">اختر دورًا من إعدادات الحساب</h2><p className="mt-2 text-[#52635b]">حسابك يحتاج إلى دور قبل البدء في المنصة.</p></Card>}
        </div>
        {role === Role.OWNER && <DashboardTabs tabs={[
          { id: "overview", label: "نظرة عامة", content: <OwnerPanel buildings={buildings} locale={locale} /> },
          { id: "memberships", label: `طلبات الانضمام (${ownerMemberships.length})`, content: <OwnerMembershipPanel memberships={ownerMemberships} locale={locale} /> },
          { id: "ownership", label: `طلبات ملكية الوحدات (${ownershipRequests.length})`, content: <OwnerOwnershipPanel requests={ownershipRequests} locale={locale} /> },
          { id: "buildings", label: `مبانيك (${buildings.length})`, content: <OwnerBuildingsPanel buildings={buildings} /> },
          { id: "units", label: `وحداتي (${ownedUnits.length})`, content: <OwnedUnitsPanel units={ownedUnits} /> },
          { id: "workers", label: "الفنيون المعتمدون", content: <WorkerDirectoryPanel workers={ownerWorkers} /> },
          { id: "requests", label: `طلبات الصيانة (${requests.length})`, content: <RequestStatusTabs requests={requests} locale={locale} role={role} workers={ownerWorkers} /> },
          { id: "notifications", label: `الإشعارات (${unreadNotifications})`, content: notifications.length ? <NotificationList notifications={notifications} locale={locale} /> : <EmptyState text="لا توجد إشعارات حاليًا." /> },
        ]} />}
        {role === Role.TENANT && <DashboardTabs tabs={[
          { id: "overview", label: "نظرة عامة", content: <TenantPanel tenancies={tenancies} memberships={memberships} categories={categories} locale={locale} /> },
          { id: "workers", label: "الفنيون المعتمدون", content: <WorkerDirectoryPanel workers={availableWorkers} /> },
          { id: "requests", label: `طلباتي (${requests.length})`, content: <RequestStatusTabs requests={requests} locale={locale} role={role} workers={availableWorkers} /> },
          { id: "notifications", label: `الإشعارات (${unreadNotifications})`, content: notifications.length ? <NotificationList notifications={notifications} locale={locale} /> : <EmptyState text="لا توجد إشعارات حاليًا." /> },
        ]} />}
        {role === Role.WORKER && <DashboardTabs tabs={[
          { id: "overview", label: "الملف المهني", content: <WorkerPanel profile={profile} categories={categories} areas={areas} locale={locale} /> },
          { id: "tenders", label: `دعوات المناقصات (${workerProcurements.length})`, content: <WorkerTenderPanel procurements={workerProcurements} locale={locale} /> },
          { id: "requests", label: `الأعمال المرتبطة (${requests.length})`, content: <RequestStatusTabs requests={requests} locale={locale} role={role} workers={[]} /> },
          { id: "notifications", label: `الإشعارات (${unreadNotifications})`, content: notifications.length ? <NotificationList notifications={notifications} locale={locale} /> : <EmptyState text="لا توجد إشعارات حاليًا." /> },
        ]} />}
        {role === Role.SUPER_ADMIN && <AdminPanel workers={pendingWorkers} locale={locale} requests={requests} notifications={notifications} unreadNotifications={unreadNotifications} />}
      </div>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Card><p className="text-[#52635b]">{text}</p></Card>;
}

function WorkerDirectoryPanel({ workers }: { workers: DirectoryWorker[] }) {
  return <Card><h2 className="text-xl font-bold">الفنيون المعتمدون</h2><p className="mt-1 text-sm text-[#52635b]">يمكنك مقارنة الخبرة العملية والتقييمات وآراء العملاء قبل اختيار الفني.</p>{workers.length === 0 ? <p className="mt-4 text-sm text-[#52635b]">لا يوجد فنيون معتمدون حاليًا.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{workers.map((worker) => <div key={worker.id} className="rounded-2xl border border-[#e0e9e4] p-4"><p className="font-bold">{worker.user.name}</p><p className="mt-1 text-sm text-[#52635b]">{worker.user.email}</p><div className="mt-3"><WorkerSummary worker={worker} showComments /></div></div>)}</div>}</Card>;
}

const requestFilterTabs: Array<{ id: string; label: string; statuses?: RequestStatus[] }> = [
  { id: "all", label: "الكل" },
  { id: "submitted", label: "مُرسل", statuses: [RequestStatus.SUBMITTED] },
  { id: "procurement", label: "قيد البحث عن فني", statuses: [RequestStatus.PROCUREMENT] },
  { id: "assigned", label: "تم التعيين", statuses: [RequestStatus.ASSIGNED] },
  { id: "in-progress", label: "قيد التنفيذ", statuses: [RequestStatus.IN_PROGRESS] },
  { id: "awaiting-confirmation", label: "بانتظار التأكيد", statuses: [RequestStatus.AWAITING_TENANT_CONFIRMATION] },
  { id: "confirmed", label: "مؤكد", statuses: [RequestStatus.TENANT_CONFIRMED] },
  { id: "closed", label: "مكتمل", statuses: [RequestStatus.CLOSED] },
  { id: "cancelled", label: "ملغي", statuses: [RequestStatus.CANCELLED, RequestStatus.REJECTED] },
];

function RequestStatusTabs({ requests, locale, role, workers }: { requests: DashboardRequest[]; locale: string; role: Role | null; workers: DirectoryWorker[] }) {
  return <DashboardTabs tabs={requestFilterTabs.map((tab) => {
    const filtered = tab.statuses ? requests.filter((request) => tab.statuses?.includes(request.status)) : requests;
    return { id: tab.id, label: `${tab.label} (${filtered.length})`, content: filtered.length ? <RequestList requests={filtered} locale={locale} role={role} workers={workers} /> : <EmptyState text="لا توجد طلبات بهذه الحالة." /> };
  })} />;
}

function OwnerPanel({ buildings, locale }: { buildings: Array<{ id: string; name: string; address: string; area: string; joinCode: string; canManageUnitRequests: boolean; units: Array<{ id: string; label: string; joinCode: string; type: string }> }>; locale: string }) {
  return <div className="grid items-stretch gap-6 lg:grid-cols-2">
    <Card className="h-full"><h2 className="text-xl font-bold">إضافة مبنى ووحدة</h2><form action={createBuilding} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><Input name="name" label="اسم المبنى" /><Input name="address" label="العنوان" /><Input name="area" label="المنطقة" /><Input name="unitLabel" label="رقم الوحدة الأولى" required={false} /><select name="unitType" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="APARTMENT">شقة</option><option value="SHOP">محل</option></select><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="canManageUnitRequests" className="mt-1" /><span><strong>السماح بإدارة طلبات الوحدات</strong><span className="block font-normal text-[#52635b]">اختياري للبنايات التي يدير مالكها الصيانة العامة.</span></span></label><Button>حفظ المبنى</Button></form></Card>
    {buildings.length > 0 && <Card className="h-full"><h2 className="text-xl font-bold">إضافة وحدة إلى مبنى</h2><form action={createUnit} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><select name="buildingId" required className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}</select><Input name="label" label="رقم الوحدة" /><Input name="floor" label="الطابق" required={false} /><select name="type" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="APARTMENT">شقة</option><option value="SHOP">محل</option></select><p className="text-xs text-[#52635b]">بعد إضافتها، أرسل رمز البناية ورقم الوحدة لمالك الشقة ليطلب ربطها بحسابه.</p><Button>إضافة الوحدة</Button></form></Card>}
    <Card className="h-full"><h2 className="text-xl font-bold">طلب ملكية شقة أو محل</h2><p className="mt-2 text-sm leading-6 text-[#52635b]">إذا لم تكن صاحب بناية، لا تحتاج إلى إنشاء بناية. أدخل رمز البناية ورمز الوحدة الذي أرسلهما لك صاحب البناية، وسيصل له طلب للموافقة.</p><form action={requestUnitOwnership} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><Input name="joinCode" label="رمز البناية" /><Input name="unitCode" label="رمز الوحدة" /><Button>إرسال طلب ملكية</Button></form></Card>
  </div>;
}

function OwnerBuildingsPanel({ buildings }: { buildings: Array<{ id: string; name: string; address: string; area: string; joinCode: string; canManageUnitRequests: boolean; units: Array<{ id: string; label: string; joinCode: string; type: string }> }> }) {
  return <Card><h2 className="text-xl font-bold">مبانيك</h2>{buildings.length === 0 ? <p className="mt-3 text-[#52635b]">لم تضف مباني بعد.</p> : <ul className="mt-4 grid gap-4 md:grid-cols-2">{buildings.map((building) => <li key={building.id} className="rounded-2xl bg-[#f6f8f7] p-5"><strong>{building.name}</strong><p className="mt-1 text-sm text-[#52635b]">{building.address} · رمز انضمام البناية: <code>{building.joinCode}</code></p><p className="mt-2 text-sm">إدارة طلبات الوحدات: {building.canManageUnitRequests ? "مفعلة" : "غير مفعلة"}</p><div className="mt-3 space-y-2 text-sm"><strong>الوحدات ورموز انضمامها</strong>{building.units.length ? building.units.map((unit) => <p key={unit.id} className="rounded-xl bg-white px-3 py-2">{unit.label} · رمز الوحدة: <code>{unit.joinCode}</code></p>) : <p>لا توجد وحدات</p>}</div></li>)}</ul>}</Card>;
}

function OwnedUnitsPanel({ units }: { units: Array<{ id: string; label: string; type: string; building: { name: string; address: string } }> }) {
  return <Card><h2 className="text-xl font-bold">وحداتي</h2>{units.length === 0 ? <p className="mt-3 text-[#52635b]">لا توجد وحدات مرتبطة بحسابك من بنايات أخرى.</p> : <ul className="mt-4 grid gap-3 md:grid-cols-2">{units.map((unit) => <li key={unit.id} className="rounded-2xl bg-[#f6f8f7] p-4"><strong>{unit.building.name} · الوحدة {unit.label}</strong><p className="mt-1 text-sm text-[#52635b]">{unit.building.address} · {unit.type === "SHOP" ? "محل" : "شقة"}</p></li>)}</ul>}</Card>;
}

function OwnerMembershipPanel({ memberships, locale }: { memberships: Array<{ id: string; tenant: { name: string; email: string }; unit: { label: string; building: { name: string } } }>; locale: string }) {
  return <Card><h2 className="text-xl font-bold">طلبات الانضمام</h2>{memberships.length === 0 ? <p className="mt-3 text-[#52635b]">لا توجد طلبات انضمام معلقة.</p> : <ul className="mt-4 grid gap-3 md:grid-cols-2">{memberships.map((membership) => <li key={membership.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p><strong>{membership.tenant.name}</strong> · {membership.tenant.email}</p><p className="mt-1 text-sm text-[#52635b]">{membership.unit.building.name} · {membership.unit.label}</p><div className="mt-3 flex gap-2"><form action={decideMembership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="membershipId" value={membership.id} /><input type="hidden" name="decision" value="APPROVED" /><Button>موافقة</Button></form><form action={decideMembership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="membershipId" value={membership.id} /><input type="hidden" name="decision" value="REJECTED" /><button className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700">رفض</button></form></div></li>)}</ul>}</Card>;
}

function OwnerOwnershipPanel({ requests, locale }: { requests: Array<{ id: string; applicant: { name: string; email: string }; unit: { label: string; building: { name: string } } }>; locale: string }) {
  return <Card><h2 className="text-xl font-bold">طلبات ملكية الوحدات</h2>{requests.length === 0 ? <p className="mt-3 text-[#52635b]">لا توجد طلبات ملكية معلقة.</p> : <ul className="mt-4 grid gap-3 md:grid-cols-2">{requests.map((request) => <li key={request.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p><strong>{request.applicant.name}</strong> · {request.applicant.email}</p><p className="mt-1 text-sm text-[#52635b]">{request.unit.building.name} · الوحدة {request.unit.label}</p><div className="mt-3 flex gap-2"><form action={decideUnitOwnership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="ownershipRequestId" value={request.id} /><input type="hidden" name="decision" value="APPROVED" /><Button>موافقة</Button></form><form action={decideUnitOwnership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="ownershipRequestId" value={request.id} /><input type="hidden" name="decision" value="REJECTED" /><button className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700">رفض</button></form></div></li>)}</ul>}</Card>;
}

function AdminPanel({ workers, locale, requests, notifications, unreadNotifications }: { workers: Array<{ id: string; bio: string | null; submittedAt: Date | null; user: { name: string; email: string }; categories: Array<{ category: { nameAr: string } }>; serviceAreas: Array<{ area: { code: string } }> }>; locale: string; requests: DashboardRequest[]; notifications: Array<{ id: string; eventType: string; messageKey: string; createdAt: Date; readAt: Date | null; parameters: unknown }>; unreadNotifications: number }) {
  return <Card>
    <DashboardTabs tabs={[
      {
        id: "overview",
        label: "نظرة عامة",
        content: <div><h2 className="text-xl font-bold">نظرة عامة</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-[#e9f5ee] p-5"><p className="text-3xl font-bold text-[#0b5c3b]">{requests.length}</p><p className="mt-1 text-sm text-[#52635b]">طلبات صيانة</p></div><div className="rounded-2xl bg-[#fff8e8] p-5"><p className="text-3xl font-bold text-[#6b4a00]">{workers.length}</p><p className="mt-1 text-sm text-[#52635b]">ملفات فنيين بانتظار المراجعة</p></div><div className="rounded-2xl bg-[#eef2ff] p-5"><p className="text-3xl font-bold text-[#3949ab]">جاهز</p><p className="mt-1 text-sm text-[#52635b]">حالة النظام</p></div></div><p className="mt-5 text-sm text-[#52635b]">إدارة المناقصات والعروض تتم من حساب المالك، والتقييم يرسله المستأجر بعد انتهاء أمر العمل.</p></div>,
      },
      {
        id: "workers",
        label: `مراجعة الفنيين (${workers.length})`,
        content: <div><h2 className="text-xl font-bold">مراجعة ملفات الفنيين</h2>{workers.length === 0 ? <p className="mt-3 text-[#52635b]">لا توجد ملفات بانتظار المراجعة.</p> : <ul className="mt-4 space-y-3">{workers.map((worker) => <li key={worker.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p><strong>{worker.user.name}</strong> · {worker.user.email}</p><p className="mt-1 text-sm text-[#52635b]">أُرسل في: {worker.submittedAt?.toLocaleDateString("ar-JO") ?? "غير متوفر"}</p><p className="mt-2 text-sm">{worker.bio || "لم يضف الفني نبذة."}</p><p className="mt-2 text-sm"><strong>التخصصات:</strong> {worker.categories.map((item) => item.category.nameAr).join("، ") || "غير محددة"}</p><p className="mt-1 text-sm"><strong>المناطق:</strong> {worker.serviceAreas.map((item) => item.area.code).join("، ") || "غير محددة"}</p><div className="mt-3 flex flex-wrap gap-2"><form action={reviewWorkerProfile}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workerId" value={worker.id} /><input type="hidden" name="decision" value="APPROVED" /><Button>اعتماد الملف</Button></form><form action={reviewWorkerProfile} className="flex gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workerId" value={worker.id} /><input type="hidden" name="decision" value="CHANGES_REQUESTED" /><input name="reason" placeholder="سبب التعديل (اختياري)" className="rounded-xl border border-[#c8d7d0] px-3 py-2 text-sm" /><Button>طلب تعديل</Button></form></div></li>)}</ul>}</div>,
      },
      {
        id: "requests",
        label: `طلبات الصيانة (${requests.length})`,
        content: <RequestStatusTabs requests={requests} locale={locale} role={Role.SUPER_ADMIN} workers={[]} />,
      },
      {
        id: "settings",
        label: "إعدادات النظام",
        content: <div><h2 className="text-xl font-bold">إعدادات النظام</h2><p className="mt-3 text-[#52635b]">الإشعارات، التصنيفات، مناطق الخدمة، وإعدادات الدفع.</p></div>,
      },
      {
        id: "notifications",
        label: `الإشعارات (${unreadNotifications})`,
        content: notifications.length ? <NotificationList notifications={notifications} locale={locale} /> : <p className="text-[#52635b]">لا توجد إشعارات حاليًا.</p>,
      },
    ]} />
  </Card>;
}

function TenantPanel({ tenancies, memberships, categories, locale }: { tenancies: Array<{ id: string; unit: { label: string; building: { name: string; joinCode: string } } }>; memberships: Array<{ id: string; state: string; unit: { label: string; building: { name: string } } }>; categories: Array<{ id: string; nameAr: string; nameEn: string }>; locale: string }) {
  return <div className="grid gap-6 lg:grid-cols-2">
    <Card><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">الانضمام إلى وحدة</h2><p className="mt-1 text-sm text-[#52635b]">أدخل رمز البناية ورمز وحدتك.</p></div><span className="rounded-full bg-[#eef7f1] px-3 py-1 text-xs font-bold text-[#176b4d]">الخطوة 1</span></div><form action={requestMembership} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><Input name="joinCode" label="رمز البناية" /><Input name="unitCode" label="رمز الوحدة" /><Button>إرسال طلب الانضمام</Button></form>{memberships.length > 0 && <ul className="mt-4 space-y-2 border-t border-[#e0e9e4] pt-4 text-sm">{memberships.map((membership) => <li key={membership.id} className="flex items-center justify-between gap-2"><span>{membership.unit.building.name} · {membership.unit.label}</span><span className="font-semibold text-[#52635b]">{membership.state === "PENDING" ? "بانتظار الموافقة" : membership.state}</span></li>)}</ul>}</Card>
    {tenancies.length > 0 && <Card><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">طلب صيانة</h2><p className="mt-1 text-sm text-[#52635b]">صف المشكلة ليتم التعامل معها.</p></div><span className="rounded-full bg-[#fff8e8] px-3 py-1 text-xs font-bold text-[#8a6200]">الخطوة 2</span></div><form action={createMaintenanceRequest} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><select name="unitId" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{tenancies.map((tenancy) => <option key={tenancy.id} value={tenancy.id}>{tenancy.unit.building.name} · {tenancy.unit.label}</option>)}</select><select name="categoryId" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{categories.map((category) => <option key={category.id} value={category.id}>{category.nameAr}</option>)}</select><Input name="title" label="عنوان المشكلة" /><label className="text-sm font-semibold">الوصف<textarea name="description" required className="mt-2 min-h-28 w-full rounded-xl border border-[#c8d7d0] px-3 py-2.5" /></label><select name="urgency" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="NORMAL">عادية</option><option value="URGENT">عاجلة</option><option value="LOW">منخفضة</option></select><Button>إرسال الطلب</Button></form></Card>}
    {tenancies.length === 0 && <Card><h2 className="text-xl font-bold">طلب صيانة</h2><p className="mt-2 text-sm leading-6 text-[#52635b]">بعد موافقة المالك على طلب الانضمام، سيظهر هنا نموذج إرسال طلب الصيانة.</p></Card>}
  </div>;
}

function WorkerPanel({
  profile,
  categories,
  areas,
  locale,
}: {
  profile: { bio: string | null; status: string; categories: Array<{ categoryId: string }>; serviceAreas: Array<{ areaId: string }>; tenantFeedbacks: Array<{ rating: number; comment: string | null }>; ownerFeedbacks: Array<{ rating: number; comment: string | null }> } | null;
  categories: Array<{ id: string; nameAr: string }>;
  areas: Array<{ id: string; code: string }>;
  locale: string;
}) {
  const feedback = [...(profile?.tenantFeedbacks ?? []), ...(profile?.ownerFeedbacks ?? [])];
  const average = feedback.length ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1) : "لا يوجد";
  return <Card><h2 className="text-xl font-bold">الملف المهني</h2><p className="mt-2 text-sm text-[#52635b]">الحالة: {profile?.status === "PENDING_REVIEW" ? "بانتظار مراجعة الإدارة" : profile?.status === "APPROVED" ? "معتمد ويمكنك استقبال الدعوات" : profile?.status === "CHANGES_REQUESTED" ? "مطلوب تعديل الملف ثم إعادة الإرسال" : profile?.status === "REJECTED" ? "مرفوض" : "مسودة"}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#f6f8f7] p-4"><p className="text-sm text-[#52635b]">متوسط التقييم</p><p className="mt-1 text-2xl font-bold text-[#176b4d]">{average} {feedback.length ? "/ 5" : ""}</p></div><div className="rounded-2xl bg-[#f6f8f7] p-4"><p className="text-sm text-[#52635b]">التقييمات</p><p className="mt-1 text-2xl font-bold">{feedback.length}</p></div></div>{feedback.length > 0 && <ul className="mt-4 space-y-2">{feedback.map((item, index) => <li key={`${item.rating}-${index}`} className="rounded-xl border border-[#e0e9e4] p-3 text-sm"><strong>{item.rating}/5</strong>{item.comment && <span className="mr-2 text-[#52635b]">{item.comment}</span>}</li>)}</ul>}{profile?.status === "PENDING_REVIEW" && <p className="mt-2 rounded-xl bg-[#fff8e8] px-3 py-2 text-sm text-[#6b4a00]">تم استلام طلبك. سيظهر الآن في لوحة الإدارة لحين اعتماده.</p>}<form action={submitWorkerProfile} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><label className="text-sm font-semibold">نبذة عن خبرتك<textarea name="bio" defaultValue={profile?.bio ?? ""} className="mt-2 min-h-28 w-full rounded-xl border border-[#c8d7d0] px-3 py-2.5" /></label><Input name="yearsOfExperience" label="سنوات الخبرة" type="number" /><fieldset><legend className="text-sm font-semibold">التخصصات</legend><div className="mt-2 grid gap-2">{categories.map((category) => <label key={category.id} className="text-sm"><input type="checkbox" name="categoryIds" value={category.id} defaultChecked={profile?.categories.some((item) => item.categoryId === category.id)} className="ml-2" />{category.nameAr}</label>)}</div></fieldset><fieldset><legend className="text-sm font-semibold">مناطق الخدمة</legend><div className="mt-2 grid gap-2">{areas.map((area) => <label key={area.id} className="text-sm"><input type="checkbox" name="areaIds" value={area.id} defaultChecked={profile?.serviceAreas.some((item) => item.areaId === area.id)} className="ml-2" />{area.code}</label>)}</div></fieldset><Button>إرسال للمراجعة</Button></form></Card>;
}

function WorkerTenderPanel({ procurements, locale }: { procurements: Array<{ id: string; deadline: Date | null; request: { title: string; description: string; category: { nameAr: string }; unit: { label: string; building: { name: string } } }; offers: Array<{ id: string; state: string; messages: Array<{ id: string; message: string; author: { name: string } }> }> }>; locale: string }) {
  return <Card><h2 className="text-xl font-bold">دعوات المناقصات</h2>{procurements.length === 0 ? <p className="mt-2 text-[#52635b]">لا توجد دعوات مفتوحة حاليًا.</p> : <ul className="mt-4 space-y-4">{procurements.map((procurement) => <li key={procurement.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p className="font-bold">{procurement.request.title}</p><p className="mt-1 text-sm text-[#52635b]">{procurement.request.category.nameAr} · {procurement.request.unit.building.name} · {procurement.request.unit.label}</p><p className="mt-1 text-sm">{procurement.request.description}</p>{procurement.offers.length > 0 && <p className="mt-2 text-sm font-semibold text-[#176b4d]">تم إرسال عرضك</p>}{procurement.offers.map((offer) => <OfferConversation key={offer.id} offerId={offer.id} messages={offer.messages} locale={locale} />)}<form action={submitOffer} className="mt-3 grid gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="procurementId" value={procurement.id} /><Input name="amountShekels" label="قيمة العرض (شيكل)" type="number" /><label className="text-sm font-semibold">نطاق العمل<p className="mt-1 text-xs font-normal text-[#52635b]">اكتب بالتفصيل ما الذي سيتضمنه العرض، وما سيتم إصلاحه أو تركيبه.</p><textarea name="scopeInclusions" required className="mt-1 min-h-20 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /></label><Input name="assumptions" label="ملاحظات أو افتراضات" required={false} /><Input name="duration" label="المدة المتوقعة" required={false} /><label className="text-sm font-semibold">التاريخ المقترح للعمل<input name="proposedDate" type="date" required={false} className="mt-1 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /></label><label className="text-sm font-semibold">صالح حتى<input name="validUntil" type="date" required className="mt-1 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /></label><div className="flex flex-wrap gap-2"><Button>{procurement.offers.length > 0 ? "تحديث العرض" : "إرسال العرض"}</Button><button formAction={respondTenderInvitation} name="response" value="DECLINED" className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700">رفض الدعوة</button></div></form></li>)}</ul>}</Card>;
}

function OfferConversation({ offerId, messages, locale }: { offerId: string; messages: Array<{ id: string; message: string; author: { name: string } }>; locale: string }) {
  return <div className="mt-3 rounded-xl border border-[#dce8e1] bg-white p-3"><p className="text-sm font-semibold">التفاوض والاستفسارات</p>{messages.length > 0 && <ul className="mt-2 space-y-1 text-sm">{messages.map((item) => <li key={item.id}><strong>{item.author.name}:</strong> {item.message}</li>)}</ul>}<form action={sendOfferMessage} className="mt-2 flex gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="offerId" value={offerId} /><input name="message" required placeholder="اكتب ردًا أو استفسارًا..." className="min-w-0 flex-1 rounded-xl border border-[#c8d7d0] px-3 py-2" /><Button>إرسال</Button></form></div>;
}

type DashboardRequest = {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  version: number;
  category: { id: string; nameAr: string };
  unit: { label: string; building: { name: string } };
  comments: Array<{ id: string; text: string; author: { name: string } }>;
  workOrders: Array<{ id: string; workerId: string; worker: { user: { name: string } }; tenantFeedback: { id: string; rating: number; comment: string | null } | null; ownerFeedback: { id: string; rating: number; comment: string | null } | null }>;
  procurements: Array<{
    id: string;
    state: string;
    invitations: Array<{ workerId: string; response: string; worker: { user: { name: string } } }>;
    offers: Array<{ id: string; workerId: string; totalAgorot: number; scopeInclusions: string; assumptions: string | null; proposedDate: Date | null; duration: string | null; validUntil: Date; state: string; worker: { user: { name: string } }; messages: Array<{ id: string; message: string; author: { name: string } }> }>;
  }>;
};

type DirectoryWorker = { id: string; user: { name: string; email: string }; categories: Array<{ categoryId: string }>; workOrders: Array<{ id: string; request: { status: RequestStatus } }>; tenantFeedbacks: Array<{ rating: number; comment: string | null }>; ownerFeedbacks: Array<{ rating: number; comment: string | null }> };

function WorkerSummary({ worker, showComments = false }: { worker: DirectoryWorker; showComments?: boolean }) {
  const feedback = [...worker.tenantFeedbacks, ...worker.ownerFeedbacks];
  const average = feedback.length ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1) : "لا يوجد";
  const completed = worker.workOrders.filter((order) => order.request.status === RequestStatus.CLOSED).length;
  return <span className="text-sm"><strong>{worker.user.name}</strong> · متوسط التقييم {average}{feedback.length ? "/5" : ""} · {feedback.length} تقييم · {completed} أعمال مكتملة{showComments && feedback.filter((item) => item.comment).length > 0 && <span className="mt-2 block border-t border-[#e0e9e4] pt-2 text-[#52635b]">{feedback.filter((item) => item.comment).map((item, index) => <span key={`${item.rating}-${index}`} className="mr-2 inline-block">&quot;{item.comment}&quot;</span>)}</span>}</span>;
}

function RequestList({ requests, locale, role, workers }: { requests: DashboardRequest[]; locale: string; role: Role | null; workers: DirectoryWorker[] }) {
  return <section className="mt-8"><h2 className="mb-4 text-2xl font-bold">طلبات الصيانة</h2><div className="grid gap-4">{requests.map((request) => {
    const openProcurement = request.procurements.find((procurement) => procurement.state === "OPEN");
    const matchingWorkers = workers.filter((worker) => worker.categories.some((category) => category.categoryId === request.category.id));
    return <Card key={request.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{request.title}</h3><p className="mt-1 text-sm text-[#52635b]">{request.unit.building.name} · {request.unit.label} · {request.category.nameAr}</p></div><span className="rounded-full bg-[#e3f3e9] px-3 py-1 text-xs font-semibold text-[#176b4d]">{statusLabels[request.status]}</span></div><p className="mt-3 leading-7">{request.description}</p>
      {role === Role.OWNER && request.status === RequestStatus.SUBMITTED && <form action={createProcurement} className="mt-4 rounded-2xl border border-[#dce8e1] p-4"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="requestId" value={request.id} /><p className="font-semibold">اختيار طريقة الحصول على الفني</p><select name="procurementMode" className="mt-3 w-full max-w-md rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="INVITED">دعوة فنيين محددين</option><option value="PUBLIC">استقبال عروض من الفنيين المعتمدين</option></select>{matchingWorkers.length === 0 ? <p className="mt-2 text-sm text-[#52635b]">لا يوجد فني معتمد لهذا التخصص للدعوات المحددة. يمكنك اختيار استقبال عروض عامة.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{matchingWorkers.map((worker) => <label key={worker.id} className="rounded-xl border border-[#e0e9e4] p-3 text-sm"><input type="checkbox" name="workerIds" value={worker.id} className="ml-2" /><WorkerSummary worker={worker} showComments /></label>)}</div>}<label className="mt-3 block max-w-md text-sm font-semibold">الموعد النهائي<input name="deadline" type="date" className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /></label><div className="mt-4"><Button>إنشاء وإرسال المناقصة</Button></div></form>}
      {request.workOrders.map((order) => <p key={`worker-${order.id}`} className="mt-3 rounded-xl bg-[#f6f8f7] px-3 py-2 text-sm">الفني: <strong>{order.worker.user.name}</strong>{order.tenantFeedback && <span className="mr-3">تقييم المستأجر: {order.tenantFeedback.rating}/5</span>}{order.ownerFeedback && <span className="mr-3">تقييم المالك: {order.ownerFeedback.rating}/5</span>}</p>)}
      {role === Role.OWNER && openProcurement && <div className="mt-4 rounded-2xl border border-[#dce8e1] p-4"><p className="font-semibold">العروض الواردة ({openProcurement.offers.length})</p>{openProcurement.offers.length === 0 ? <p className="mt-2 text-sm text-[#52635b]">بانتظار عروض الفنيين.</p> : <ul className="mt-2 space-y-3">{openProcurement.offers.map((offer) => { const offerWorker = workers.find((worker) => worker.id === offer.workerId); return <li key={offer.id} className="rounded-xl bg-[#f6f8f7] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{offer.worker.user.name}</strong><span className="font-semibold text-[#176b4d]">{(offer.totalAgorot / 100).toFixed(2)} شيكل · {offer.state}</span></div>{offerWorker && <p className="mt-2"><WorkerSummary worker={offerWorker} showComments /></p>}<dl className="mt-3 grid gap-2 text-[#52635b]"><div><dt className="font-semibold text-[#17221d]">نطاق العمل</dt><dd>{offer.scopeInclusions}</dd></div>{offer.assumptions && <div><dt className="font-semibold text-[#17221d]">الملاحظات والافتراضات</dt><dd>{offer.assumptions}</dd></div>}<div><dt className="font-semibold text-[#17221d]">المدة المتوقعة</dt><dd>{offer.duration || "لم يحدد"}</dd></div><div><dt className="font-semibold text-[#17221d]">التاريخ المقترح</dt><dd>{offer.proposedDate?.toLocaleDateString("ar-JO") || "لم يحدد"}</dd></div><div><dt className="font-semibold text-[#17221d]">صالح حتى</dt><dd>{offer.validUntil.toLocaleDateString("ar-JO")}</dd></div></dl><OfferConversation offerId={offer.id} messages={offer.messages} locale={locale} />{offer.state === "SUBMITTED" && <form action={awardOffer} className="mt-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="offerId" value={offer.id} /><Button>ترسية وإنشاء أمر عمل</Button></form>}</li>; })}</ul>}</div>}
      {role === Role.WORKER && request.status === RequestStatus.ASSIGNED && <StatusForm request={request} locale={locale} statuses={["IN_PROGRESS"]} />}
      {role === Role.WORKER && request.status === RequestStatus.IN_PROGRESS && <StatusForm request={request} locale={locale} statuses={["AWAITING_TENANT_CONFIRMATION"]} submitLabel="إنهاء العمل وإرساله للتأكيد" />}
      {role === Role.OWNER && request.status === RequestStatus.IN_PROGRESS && <StatusForm request={request} locale={locale} statuses={["CANCELLED"]} submitLabel="إلغاء الطلب" />}
      {role === Role.OWNER && request.status === RequestStatus.TENANT_CONFIRMED && <StatusForm request={request} locale={locale} statuses={["CLOSED"]} />}
      {role === Role.OWNER && request.status === RequestStatus.PROCUREMENT && !openProcurement && <StatusForm request={request} locale={locale} statuses={["CANCELLED"]} />}
      {role === Role.OWNER && request.status === RequestStatus.SUBMITTED && <StatusForm request={request} locale={locale} statuses={["REJECTED", "CANCELLED"]} />}
      {role === Role.TENANT && request.status === RequestStatus.SUBMITTED && <StatusForm request={request} locale={locale} statuses={["CANCELLED"]} />}
      {role === Role.TENANT && request.status === RequestStatus.AWAITING_TENANT_CONFIRMATION && request.workOrders.filter((order) => !order.tenantFeedback).map((order) => <form key={order.id} action={submitTenantFeedback} className="mt-4 rounded-2xl border border-[#dce8e1] p-4"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workOrderId" value={order.id} /><p className="font-semibold">قيّم الخدمة</p><select name="rating" className="mt-2 rounded-xl border border-[#c8d7d0] px-3 py-2"><option value="5">5 - ممتاز</option><option value="4">4 - جيد جدًا</option><option value="3">3 - جيد</option><option value="2">2 - مقبول</option><option value="1">1 - ضعيف</option></select><textarea name="comment" placeholder="ملاحظات اختيارية" className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /><div className="mt-2"><Button>إرسال التقييم</Button></div></form>)}
      {role === Role.OWNER && request.status === RequestStatus.CLOSED && request.workOrders.filter((order) => !order.ownerFeedback).map((order) => <form key={order.id} action={submitOwnerFeedback} className="mt-4 rounded-2xl border border-[#dce8e1] p-4"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workOrderId" value={order.id} /><p className="font-semibold">قيّم الفني</p><select name="rating" className="mt-2 rounded-xl border border-[#c8d7d0] px-3 py-2"><option value="5">5 - ممتاز</option><option value="4">4 - جيد جدًا</option><option value="3">3 - جيد</option><option value="2">2 - مقبول</option><option value="1">1 - ضعيف</option></select><textarea name="comment" placeholder="ملاحظات اختيارية" className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /><div className="mt-2"><Button>إرسال تقييم المالك</Button></div></form>)}
      {request.comments.length > 0 && <ul className="mt-4 space-y-2 border-t border-[#e0e9e4] pt-4 text-sm">{request.comments.map((comment) => <li key={comment.id}><strong>{comment.author.name}:</strong> {comment.text}</li>)}</ul>}<form action={addComment} className="mt-4 flex gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="requestId" value={request.id} /><input name="text" required placeholder="أضف تعليقًا..." className="min-w-0 flex-1 rounded-xl border border-[#c8d7d0] px-3 py-2.5" /><input type="hidden" name="audience" value={role === Role.WORKER ? "JOB_PARTICIPANTS" : "TENANT_OWNER"} /><Button>تعليق</Button></form></Card>;
  })}</div></section>;
}

function NotificationList({ notifications, locale }: { notifications: Array<{ id: string; eventType: string; messageKey: string; createdAt: Date; readAt: Date | null; parameters: unknown }>; locale: string }) {
  const labels: Record<string, string> = {
    MAINTENANCE_REQUEST_CREATED: "تم إنشاء طلب صيانة جديد",
    MEMBERSHIP_REQUESTED: "طلب انضمام جديد",
    MEMBERSHIP_DECIDED: "تم تحديث طلب الانضمام",
    TENDER_INVITED: "تمت دعوتك إلى مناقصة",
    TENDER_INVITATION_CREATED: "تمت دعوتك إلى مناقصة",
    OFFER_SUBMITTED: "تم إرسال عرض جديد",
    OFFER_AWARDED: "تمت ترسية العرض",
    TENANT_FEEDBACK_SUBMITTED: "تم استلام تقييم جديد",
    OWNER_FEEDBACK_SUBMITTED: "تم استلام تقييم جديد من المالك",
    WORK_COMPLETION_READY: "العمل جاهز لتأكيد المستأجر",
    OFFER_MESSAGE_RECEIVED: "رسالة جديدة حول العرض",
  };
  return <section className="mt-8"><Card><h2 className="text-xl font-bold">الإشعارات</h2><ul className="mt-3 space-y-2">{notifications.map((notification) => { const actorName = typeof notification.parameters === "object" && notification.parameters !== null && "actorName" in notification.parameters && typeof notification.parameters.actorName === "string" ? notification.parameters.actorName : null; return <li key={notification.id} className={`flex items-center justify-between gap-3 rounded-xl p-3 text-sm ${notification.readAt ? "bg-[#f6f8f7]" : "bg-[#e9f5ee]"}`}><span><strong>{labels[notification.eventType] ?? notification.messageKey}</strong>{actorName && <span className="mr-2 text-[#60756a]">بواسطة {actorName}</span>}</span>{!notification.readAt && <form action={markNotificationRead}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="notificationId" value={notification.id} /><button className="text-xs font-bold text-[#176b4d]">تحديد كمقروء</button></form>}</li>; })}</ul></Card></section>;
}

function StatusForm({ request, locale, statuses, submitLabel = "تحديث الحالة" }: { request: { id: string; version: number }; locale: string; statuses: string[]; submitLabel?: string }) {
  return <form action={updateMaintenanceStatus} className="mt-4 flex flex-wrap items-center gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="requestId" value={request.id} /><select name="status" className="rounded-xl border border-[#c8d7d0] px-3 py-2 text-sm">{statuses.map((status) => <option key={status} value={status}>{statusLabels[status as RequestStatus]}</option>)}</select><Button>{submitLabel}</Button></form>;
}
