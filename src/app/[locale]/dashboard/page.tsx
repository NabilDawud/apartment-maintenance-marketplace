import { redirect } from "next/navigation";
import { Role, RequestStatus } from "@prisma/client";
import { db } from "@/server/db";
import { getSession, getSessionRole } from "@/server/session";
import LogoutButton from "./logout-button";
import {
  addComment,
  createBuilding,
  createMaintenanceRequest,
  createUnit,
  decideMembership,
  reviewWorkerProfile,
  requestMembership,
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

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-3xl border border-[#e0e9e4] bg-white p-6 shadow-sm">{children}</section>;
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

  const [buildings, tenancies, categories, areas, requests, profile, memberships, ownerMemberships, pendingWorkers] = await Promise.all([
    role === Role.OWNER
      ? db.building.findMany({ where: { ownerId: userId, archivedAt: null }, include: { units: { where: { archivedAt: null }, orderBy: { label: "asc" } } } })
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
          where: role === Role.TENANT ? { tenantId: userId } : role === Role.OWNER ? { unit: { ownerId: userId } } : role === Role.WORKER ? { workOrders: { some: { workerId: userId } } } : {},
          include: { unit: { include: { building: true } }, category: true, comments: { include: { author: true }, orderBy: { createdAt: "asc" } }, workOrders: { select: { workerId: true } } },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    role === Role.WORKER ? db.workerProfile.findUnique({ where: { id: userId }, include: { categories: true, serviceAreas: true } }) : Promise.resolve(null),
    role === Role.TENANT ? db.membershipRequest.findMany({ where: { tenantId: userId }, include: { unit: { include: { building: true } } }, orderBy: { submittedAt: "desc" } }) : Promise.resolve([]),
    role === Role.OWNER ? db.membershipRequest.findMany({ where: { unit: { ownerId: userId }, state: "PENDING" }, include: { tenant: true, unit: { include: { building: true } } }, orderBy: { submittedAt: "asc" } }) : Promise.resolve([]),
    role === Role.SUPER_ADMIN ? db.workerProfile.findMany({ where: { status: "PENDING_REVIEW" }, include: { user: true }, orderBy: { submittedAt: "asc" } }) : Promise.resolve([]),
  ]);

  const title = role === Role.OWNER ? "لوحة المالك" : role === Role.TENANT ? "لوحة المستأجر" : role === Role.WORKER ? "لوحة الفني" : role === Role.SUPER_ADMIN ? "لوحة الإدارة" : "لوحتك";
  return (
    <main className="min-h-screen bg-[#f6f8f7] px-5 py-8 text-[#17221d]" dir={isEnglish ? "ltr" : "rtl"}>
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-semibold text-[#176b4d]">صيانة</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-1 text-[#52635b]">مرحبًا، {session.user.name}</p></div>
          <LogoutButton locale={locale} />
        </header>
        {message && <p className="mt-6 rounded-xl bg-[#e3f3e9] px-4 py-3 text-sm font-semibold text-[#176b4d]">تم حفظ العملية بنجاح.</p>}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {role === Role.OWNER && <OwnerPanel buildings={buildings} memberships={ownerMemberships} locale={locale} />}
          {role === Role.TENANT && <TenantPanel tenancies={tenancies} memberships={memberships} categories={categories} locale={locale} />}
          {role === Role.WORKER && <WorkerPanel profile={profile} categories={categories} areas={areas} locale={locale} />}
          {!role && <Card><h2 className="text-xl font-bold">اختر دورًا من إعدادات الحساب</h2><p className="mt-2 text-[#52635b]">حسابك يحتاج إلى دور قبل البدء في المنصة.</p></Card>}
          {role === Role.SUPER_ADMIN && <AdminPanel workers={pendingWorkers} locale={locale} requests={requests.length} />}
        </div>
        {requests.length > 0 && <RequestList requests={requests} locale={locale} role={role} />}
      </div>
    </main>
  );
}

function OwnerPanel({ buildings, memberships, locale }: { buildings: Array<{ id: string; name: string; address: string; area: string; joinCode: string; units: Array<{ id: string; label: string; type: string }> }>; memberships: Array<{ id: string; tenant: { name: string; email: string }; unit: { label: string; building: { name: string } } }>; locale: string }) {
  return <div className="space-y-6">
    <Card><h2 className="text-xl font-bold">إضافة مبنى ووحدة</h2><form action={createBuilding} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><Input name="name" label="اسم المبنى" /><Input name="address" label="العنوان" /><Input name="area" label="المنطقة" /><Input name="unitLabel" label="رقم الوحدة الأولى" required={false} /><select name="unitType" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="APARTMENT">شقة</option><option value="SHOP">محل</option></select><Button>حفظ المبنى</Button></form></Card>
    {buildings.length > 0 && <Card><h2 className="text-xl font-bold">إضافة وحدة إلى مبنى</h2><form action={createUnit} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><select name="buildingId" required className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}</select><Input name="label" label="رقم الوحدة" /><Input name="floor" label="الطابق" required={false} /><select name="type" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="APARTMENT">شقة</option><option value="SHOP">محل</option></select><Button>إضافة الوحدة</Button></form></Card>}
    <Card><h2 className="text-xl font-bold">مبانيك</h2>{buildings.length === 0 ? <p className="mt-2 text-[#52635b]">لم تضف مباني بعد.</p> : <ul className="mt-3 space-y-3">{buildings.map((building) => <li key={building.id} className="rounded-2xl bg-[#f6f8f7] p-4"><strong>{building.name}</strong><p className="text-sm text-[#52635b]">{building.address} · رمز الانضمام: <code>{building.joinCode}</code></p><p className="mt-2 text-sm">الوحدات: {building.units.map((unit) => unit.label).join("، ") || "لا توجد"}</p></li>)}</ul>}</Card>
    {memberships.length > 0 && <Card><h2 className="text-xl font-bold">طلبات الانضمام</h2><ul className="mt-3 space-y-3">{memberships.map((membership) => <li key={membership.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p><strong>{membership.tenant.name}</strong> · {membership.tenant.email}</p><p className="text-sm text-[#52635b]">{membership.unit.building.name} · {membership.unit.label}</p><div className="mt-3 flex gap-2"><form action={decideMembership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="membershipId" value={membership.id} /><input type="hidden" name="decision" value="APPROVED" /><Button>موافقة</Button></form><form action={decideMembership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="membershipId" value={membership.id} /><input type="hidden" name="decision" value="REJECTED" /><button className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700">رفض</button></form></div></li>)}</ul></Card>}
  </div>;
}

function AdminPanel({ workers, locale, requests }: { workers: Array<{ id: string; user: { name: string; email: string } }>; locale: string; requests: number }) {
  return <Card><h2 className="text-xl font-bold">الإدارة</h2><p className="mt-2 text-[#52635b]">طلبات الصيانة الحالية: {requests}</p>{workers.length > 0 && <ul className="mt-4 space-y-3">{workers.map((worker) => <li key={worker.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p><strong>{worker.user.name}</strong> · {worker.user.email}</p><div className="mt-3 flex gap-2"><form action={reviewWorkerProfile}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workerId" value={worker.id} /><input type="hidden" name="decision" value="APPROVED" /><Button>اعتماد</Button></form><form action={reviewWorkerProfile}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workerId" value={worker.id} /><input type="hidden" name="decision" value="CHANGES_REQUESTED" /><Button>طلب تعديل</Button></form></div></li>)}</ul>}</Card>;
}

function TenantPanel({ tenancies, memberships, categories, locale }: { tenancies: Array<{ id: string; unit: { label: string; building: { name: string; joinCode: string } } }>; memberships: Array<{ id: string; state: string; unit: { label: string; building: { name: string } } }>; categories: Array<{ id: string; nameAr: string; nameEn: string }>; locale: string }) {
  return <div className="space-y-6">
    <Card><h2 className="text-xl font-bold">الانضمام إلى وحدة</h2><form action={requestMembership} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><Input name="joinCode" label="رمز المبنى" /><Input name="unitLabel" label="رقم الوحدة" /><Button>إرسال طلب الانضمام</Button></form>{memberships.length > 0 && <ul className="mt-4 space-y-2 text-sm">{memberships.map((membership) => <li key={membership.id}>{membership.unit.building.name} · {membership.unit.label} · {membership.state === "PENDING" ? "بانتظار الموافقة" : membership.state}</li>)}</ul>}</Card>
    {tenancies.length > 0 && <Card><h2 className="text-xl font-bold">طلب صيانة</h2><form action={createMaintenanceRequest} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><select name="unitId" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{tenancies.map((tenancy) => <option key={tenancy.id} value={tenancy.id}>{tenancy.unit.building.name} · {tenancy.unit.label}</option>)}</select><select name="categoryId" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{categories.map((category) => <option key={category.id} value={category.id}>{category.nameAr}</option>)}</select><Input name="title" label="عنوان المشكلة" /><label className="text-sm font-semibold">الوصف<textarea name="description" required className="mt-2 min-h-28 w-full rounded-xl border border-[#c8d7d0] px-3 py-2.5" /></label><select name="urgency" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="NORMAL">عادية</option><option value="URGENT">عاجلة</option><option value="LOW">منخفضة</option></select><Button>إرسال الطلب</Button></form></Card>}
  </div>;
}

function WorkerPanel({ profile, categories, areas, locale }: { profile: { bio: string | null; status: string; categories: Array<{ categoryId: string }>; serviceAreas: Array<{ areaId: string }> } | null; categories: Array<{ id: string; nameAr: string }>; areas: Array<{ id: string; code: string }>; locale: string }) {
  return <Card><h2 className="text-xl font-bold">الملف المهني</h2><p className="mt-2 text-sm text-[#52635b]">الحالة: {profile?.status === "PENDING_REVIEW" ? "بانتظار المراجعة" : profile?.status === "APPROVED" ? "معتمد" : "مسودة"}</p><form action={submitWorkerProfile} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><label className="text-sm font-semibold">نبذة عن خبرتك<textarea name="bio" defaultValue={profile?.bio ?? ""} className="mt-2 min-h-28 w-full rounded-xl border border-[#c8d7d0] px-3 py-2.5" /></label><Input name="yearsOfExperience" label="سنوات الخبرة" type="number" /><fieldset><legend className="text-sm font-semibold">التخصصات</legend><div className="mt-2 grid gap-2">{categories.map((category) => <label key={category.id} className="text-sm"><input type="checkbox" name="categoryIds" value={category.id} defaultChecked={profile?.categories.some((item) => item.categoryId === category.id)} className="ml-2" />{category.nameAr}</label>)}</div></fieldset><fieldset><legend className="text-sm font-semibold">مناطق الخدمة</legend><div className="mt-2 grid gap-2">{areas.map((area) => <label key={area.id} className="text-sm"><input type="checkbox" name="areaIds" value={area.id} defaultChecked={profile?.serviceAreas.some((item) => item.areaId === area.id)} className="ml-2" />{area.code}</label>)}</div></fieldset><Button>إرسال للمراجعة</Button></form></Card>;
}

function RequestList({ requests, locale, role }: { requests: Array<{ id: string; title: string; description: string; status: RequestStatus; version: number; category: { nameAr: string }; unit: { label: string; building: { name: string } }; comments: Array<{ id: string; text: string; author: { name: string } }>; workOrders: Array<{ workerId: string }> }>; locale: string; role: Role | null }) {
  return <section className="mt-8"><h2 className="mb-4 text-2xl font-bold">طلبات الصيانة</h2><div className="grid gap-4">{requests.map((request) => <Card key={request.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{request.title}</h3><p className="mt-1 text-sm text-[#52635b]">{request.unit.building.name} · {request.unit.label} · {request.category.nameAr}</p></div><span className="rounded-full bg-[#e3f3e9] px-3 py-1 text-xs font-semibold text-[#176b4d]">{statusLabels[request.status]}</span></div><p className="mt-3 leading-7">{request.description}</p>{role === Role.OWNER && request.status === RequestStatus.SUBMITTED && <StatusForm request={request} locale={locale} statuses={["PROCUREMENT", "REJECTED", "CANCELLED"]} />}{role === Role.OWNER && request.status === RequestStatus.PROCUREMENT && <StatusForm request={request} locale={locale} statuses={["ASSIGNED", "CANCELLED"]} />}{role === Role.OWNER && request.status === RequestStatus.TENANT_CONFIRMED && <StatusForm request={request} locale={locale} statuses={["CLOSED"]} />}{role === Role.WORKER && request.status === RequestStatus.ASSIGNED && <StatusForm request={request} locale={locale} statuses={["IN_PROGRESS"]} />}{role === Role.TENANT && request.status === RequestStatus.SUBMITTED && <StatusForm request={request} locale={locale} statuses={["CANCELLED"]} />}{role === Role.TENANT && request.status === RequestStatus.AWAITING_TENANT_CONFIRMATION && <StatusForm request={request} locale={locale} statuses={["TENANT_CONFIRMED"]} />}{request.comments.length > 0 && <ul className="mt-4 space-y-2 border-t border-[#e0e9e4] pt-4 text-sm">{request.comments.map((comment) => <li key={comment.id}><strong>{comment.author.name}:</strong> {comment.text}</li>)}</ul>}<form action={addComment} className="mt-4 flex gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="requestId" value={request.id} /><input name="text" required placeholder="أضف تعليقًا..." className="min-w-0 flex-1 rounded-xl border border-[#c8d7d0] px-3 py-2.5" /><input type="hidden" name="audience" value={role === Role.WORKER ? "JOB_PARTICIPANTS" : "TENANT_OWNER"} /><Button>تعليق</Button></form></Card>)}</div></section>;
}

function StatusForm({ request, locale, statuses }: { request: { id: string; version: number }; locale: string; statuses: string[] }) {
  return <form action={updateMaintenanceStatus} className="mt-4 flex flex-wrap items-center gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="requestId" value={request.id} /><select name="status" className="rounded-xl border border-[#c8d7d0] px-3 py-2 text-sm">{statuses.map((status) => <option key={status} value={status}>{statusLabels[status as RequestStatus]}</option>)}</select><Button>تحديث الحالة</Button></form>;
}
