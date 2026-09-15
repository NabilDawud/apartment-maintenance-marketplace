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
  "error-invalid_unitcode": "يرجى إدخال رمز الوحدة.",
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
  "error-ownership_unit_not_found": "لا توجد وحدة بهذا الرمز داخل هذه البناية.",
  "error-membership_unit_not_found": "لا توجد وحدة بهذا الرمز داخل هذه البناية.",
  "error-ownership_building_not_found": "لا توجد بناية بهذا الرمز.",
  "error-membership_building_not_found": "لا توجد بناية بهذا الرمز.",
  "error-unauthorized": "انتهت جلسة الدخول. سجل الدخول مجددًا.",
};

const englishDashboardText: Record<string, string> = {
  "لوحة المالك": "Owner dashboard",
  "لوحة المستأجر": "Tenant dashboard",
  "لوحة الفني": "Worker dashboard",
  "لوحة الإدارة": "Admin dashboard",
  "لوحتك": "Your dashboard",
  "صيانة": "Maintenance",
  "مرحبًا": "Welcome",
  "اختر دورًا من إعدادات الحساب": "Choose a role in account settings",
  "حسابك يحتاج إلى دور قبل البدء في المنصة.": "Your account needs a role before you can begin.",
  "نظرة عامة": "Overview",
  "طلبات المستأجرين": "Tenant requests",
  "طلبات ملكية الوحدات": "Unit ownership requests",
  "مبانيك": "My buildings",
  "وحداتي": "My units",
  "الفنيون المعتمدون": "Approved workers",
  "طلبات الصيانة": "Maintenance requests",
  "الإشعارات": "Notifications",
  "لا توجد إشعارات حاليًا.": "No notifications yet.",
  "طلباتي": "My requests",
  "الملف المهني": "Professional profile",
  "دعوات المناقصات": "Tender invitations",
  "الأعمال المرتبطة": "Assigned work",
  "الكل": "All",
  "مُرسل": "Submitted",
  "قيد البحث عن فني": "Finding a worker",
  "تم التعيين": "Assigned",
  "قيد التنفيذ": "In progress",
  "بانتظار التأكيد": "Awaiting confirmation",
  "مؤكد": "Confirmed",
  "مكتمل": "Completed",
  "ملغي": "Cancelled",
  "إدارة البنايات ورموز الوحدات.": "Manage buildings and unit codes.",
  "مراجعة طلبات ملكية الوحدات.": "Review unit ownership requests.",
  "مراجعة طلبات المستأجرين لوحداتك.": "Review tenant requests for your units.",
  "إنشاء المناقصات ومقارنة العروض والتفاوض وترسية العمل.": "Create tenders, compare offers, negotiate, and award work.",
  "إغلاق الأعمال المكتملة وتقييم الفنيين.": "Close completed work and rate workers.",
  "تمت الموافقة على ملكية وحدتك.": "Your unit ownership was approved.",
  "مراجعة طلبات المستأجرين لوحدتك.": "Review tenant requests for your unit.",
  "إدارة طلبات الصيانة والعروض لوحدتك.": "Manage maintenance requests and offers for your unit.",
  "أرسل طلب ملكية باستخدام رمز البناية ورمز الوحدة.": "Request ownership with the building and unit codes.",
  "انتظر موافقة مالك البناية على الطلب.": "Wait for the building owner to approve your request.",
  "بعد الموافقة، أدر وحدتك وطلبات المستأجرين.": "After approval, manage your unit and tenant requests.",
  "الانضمام إلى وحدة باستخدام رمزي البناية والوحدة.": "Join a unit using its building and unit codes.",
  "انتظار موافقة مالك الوحدة على طلبك.": "Wait for the unit owner to approve your membership.",
  "إرسال ومتابعة طلبات الصيانة.": "Submit and track maintenance requests.",
  "تأكيد انتهاء العمل وتقييم الفني.": "Confirm completed work and rate the worker.",
  "إكمال الملف المهني واختيار التخصصات والمناطق.": "Complete your profile and select categories and service areas.",
  "انتظار اعتماد الإدارة.": "Wait for administrator approval.",
  "مراجعة دعوات المناقصات وإرسال أو تحديث العروض.": "Review tender invitations and submit or update offers.",
  "التفاوض مع المالك وتنفيذ الأعمال التي تمت ترسيتها.": "Negotiate with the owner and perform awarded work.",
  "تحديث حالة العمل حتى تأكيد المستأجر.": "Update work status until tenant confirmation.",
  "مراجعة ملفات الفنيين المعلقة.": "Review pending worker profiles.",
  "متابعة طلبات الصيانة ونشاط المنصة.": "Monitor maintenance requests and platform activity.",
  "إدارة إعدادات المنصة والإشعارات.": "Manage platform settings and notifications.",
  "كيف تعمل المنصة معك": "How your workflow works",
  "اتبع هذه الخطوات حسب الدور المرتبط بحسابك.": "Follow these steps for your account role.",
  "يمكنك مقارنة الخبرة العملية والتقييمات وآراء العملاء قبل اختيار الفني.": "Compare experience, ratings, and customer feedback before choosing a worker.",
  "لا يوجد فنيون معتمدون حاليًا.": "No approved workers are available.",
  "لا توجد طلبات بهذه الحالة.": "No requests in this status.",
  "البنايات": "Buildings",
  "طلبات الملكية المعلقة": "Pending ownership requests",
  "من تبويب ": "From the ",
  " أنشئ البنايات والوحدات، ومن تبويب ": " create buildings and units; from the ",
  " اربط الوحدات التي تملكها في بنايات أخرى. ستجد طلبات المستأجرين وطلبات الملكية في تبويبات مستقلة.": " link units you own in other buildings. Tenant and ownership requests have their own tabs.",
  "إضافة مبنى ووحدة": "Add building and unit",
  "اسم المبنى": "Building name",
  "العنوان": "Address",
  "المنطقة": "Area",
  "رقم الوحدة الأولى": "First unit number",
  "شقة": "Apartment",
  "محل": "Shop",
  "السماح بإدارة طلبات الوحدات": "Allow unit request management",
  "اختياري للبنايات التي يدير مالكها الصيانة العامة.": "Optional for buildings whose owner manages general maintenance.",
  "حفظ المبنى": "Save building",
  "إضافة وحدة إلى مبنى": "Add unit to building",
  "رقم الوحدة": "Unit number",
  "الطابق": "Floor",
  "بعد إضافتها، أرسل رمز البناية ورقم الوحدة لمالك الشقة ليطلب ربطها بحسابه.": "After adding it, send the building and unit codes to the unit owner.",
  "إضافة الوحدة": "Add unit",
  "لم تضف مباني بعد.": "No buildings added yet.",
  "مفعلة": "Enabled",
  "غير مفعلة": "Disabled",
  "الوحدات ورموز انضمامها": "Units and join codes",
  "لا توجد وحدات": "No units",
  "لا توجد وحدات مرتبطة بحسابك من بنايات أخرى.": "No units linked from other buildings.",
  "طلب ملكية شقة أو محل": "Request apartment or shop ownership",
  "أدخل رمز البناية ورمز الوحدة الذي أرسلهما لك صاحب البناية.": "Enter the building and unit codes sent by the building owner.",
  "رمز البناية": "Building code",
  "رمز الوحدة": "Unit code",
  "إرسال طلب ملكية": "Submit ownership request",
  "طلبات الانضمام": "Membership requests",
  "لا توجد طلبات انضمام معلقة.": "No pending membership requests.",
  "موافقة": "Approve",
  "رفض": "Reject",
  "لا توجد طلبات ملكية معلقة.": "No pending ownership requests.",
  "طلبات صيانة": "Maintenance requests",
  "ملفات فنيين بانتظار المراجعة": "Worker profiles awaiting review",
  "جاهز": "Ready",
  "حالة النظام": "System status",
  "إدارة المناقصات والعروض تتم من حساب المالك، والتقييم يرسله المستأجر بعد انتهاء أمر العمل.": "Owners manage tenders and offers; tenants submit feedback after work.",
  "مراجعة الفنيين": "Worker review",
  "مراجعة ملفات الفنيين": "Review worker profiles",
  "لا توجد ملفات بانتظار المراجعة.": "No profiles awaiting review.",
  "غير متوفر": "Unavailable",
  "لم يضف الفني نبذة.": "The worker has not added a bio.",
  "التخصصات:": "Categories:",
  "، ": " , ",
  "غير محددة": "Not specified",
  "المناطق:": "Areas:",
  "اعتماد الملف": "Approve profile",
  "سبب التعديل (اختياري)": "Change reason (optional)",
  "طلب تعديل": "Request changes",
  "إعدادات النظام": "System settings",
  "الإشعارات، التصنيفات، مناطق الخدمة، وإعدادات الدفع.": "Notifications, categories, service areas, and payment settings.",
  "الانضمام إلى وحدة": "Join a unit",
  "أدخل رمز البناية ورمز وحدتك.": "Enter the building and unit codes.",
  "الخطوة 1": "Step 1",
  "إرسال طلب الانضمام": "Submit membership request",
  "بانتظار الموافقة": "Awaiting approval",
  "طلب صيانة": "Maintenance request",
  "صف المشكلة ليتم التعامل معها.": "Describe the problem so it can be handled.",
  "الخطوة 2": "Step 2",
  "عنوان المشكلة": "Problem title",
  "الوصف": "Description",
  "عادية": "Normal",
  "عاجلة": "Urgent",
  "منخفضة": "Low",
  "إرسال الطلب": "Submit request",
  "بعد موافقة المالك على طلب الانضمام، سيظهر هنا نموذج إرسال طلب الصيانة.": "The maintenance request form appears after the owner approves your membership.",
  "لا يوجد": "None",
  "بانتظار مراجعة الإدارة": "Pending administrator review",
  "معتمد ويمكنك استقبال الدعوات": "Approved and eligible for invitations",
  "مطلوب تعديل الملف ثم إعادة الإرسال": "Changes requested; update and resubmit",
  "مرفوض": "Rejected",
  "مسودة": "Draft",
  "متوسط التقييم": "Average rating",
  "التقييمات": "Ratings",
  "تم استلام طلبك. سيظهر الآن في لوحة الإدارة لحين اعتماده.": "Your profile was received and is awaiting administrator approval.",
  "نبذة عن خبرتك": "About your experience",
  "سنوات الخبرة": "Years of experience",
  "التخصصات": "Categories",
  "مناطق الخدمة": "Service areas",
  "إرسال للمراجعة": "Submit for review",
  "لا توجد دعوات مفتوحة حاليًا.": "No open invitations.",
  "تم إرسال عرضك - يمكنك تحديث الحقول التي تريد تغييرها فقط": "Offer submitted; update only the fields you want to change.",
  "قيمة العرض (شيكل)": "Offer amount (ILS)",
  "نطاق العمل": "Scope of work",
  "اكتب بالتفصيل ما الذي سيتضمنه العرض، وما سيتم إصلاحه أو تركيبه.": "Describe what the offer includes and what will be repaired or installed.",
  "ملاحظات أو افتراضات": "Notes or assumptions",
  "المدة المتوقعة": "Expected duration",
  "التاريخ المقترح": "Proposed date",
  "التاريخ المقترح للعمل": "Proposed work date",
  "صالح حتى": "Valid until",
  "إرسال العرض": "Submit offer",
  "تحديث العرض": "Update offer",
  "رفض الدعوة": "Decline invitation",
  "التفاوض والاستفسارات": "Negotiation and questions",
  "اكتب ردًا أو استفسارًا...": "Write a reply or question...",
  "إرسال": "Send",
  "تقييم": "Rating",
  "أعمال مكتملة": "completed jobs",
  "اختيار طريقة الحصول على الفني": "Choose how to find a worker",
  "دعوة فنيين محددين": "Invite selected workers",
  "استقبال عروض من الفنيين المعتمدين": "Receive offers from approved workers",
  "لا يوجد فني معتمد لهذا التخصص للدعوات المحددة. يمكنك اختيار استقبال عروض عامة.": "No approved worker matches this category; you can receive public offers.",
  "الموعد النهائي": "Deadline",
  "إنشاء وإرسال المناقصة": "Create and send tender",
  "الفني: ": "Worker: ",
  "بانتظار عروض الفنيين.": "Awaiting worker offers.",
  "محدّث": "Updated",
  "لم يحدد": "Not specified",
  "ترسية وإنشاء أمر عمل": "Award and create work order",
  "إنهاء العمل وإرساله للتأكيد": "Finish work and send for confirmation",
  "إلغاء الطلب": "Cancel request",
  "قيّم الخدمة": "Rate the service",
  "5 - ممتاز": "5 - Excellent",
  "4 - جيد جدًا": "4 - Very good",
  "3 - جيد": "3 - Good",
  "2 - مقبول": "2 - Fair",
  "1 - ضعيف": "1 - Poor",
  "ملاحظات اختيارية": "Optional comments",
  "إرسال التقييم": "Submit rating",
  "قيّم الفني": "Rate the worker",
  "إرسال تقييم المالك": "Submit owner rating",
  "أضف تعليقًا...": "Add a comment...",
  "تعليق": "Comment",
  "تم إنشاء طلب صيانة جديد": "New maintenance request created",
  "طلب مستأجر جديد": "New tenant request",
  "تم تحديث طلب المستأجر": "Tenant request updated",
  "طلب ملكية وحدة جديد": "New unit ownership request",
  "تم البت في طلب ملكية الوحدة": "Unit ownership request decided",
  "تمت دعوتك إلى مناقصة": "You were invited to a tender",
  "تم إرسال عرض جديد": "New offer submitted",
  "تمت ترسية العرض": "Offer awarded",
  "تم استلام تقييم جديد": "New rating received",
  "تم استلام تقييم جديد من المالك": "New owner rating received",
  "العمل جاهز لتأكيد المستأجر": "Work ready for tenant confirmation",
  "رسالة جديدة حول العرض": "New offer message",
  "تمت الموافقة": "Approved",
  "أُرسل في:": "Submitted:",
  "الحالة:": "Status:",
  "العروض الواردة": "Incoming offers",
  "تقييم المالك:": "Owner rating:",
  "تقييم المستأجر:": "Tenant rating:",
  "تم الرفض": "Rejected",
  "تحديد كمقروء": "Mark as read",
  "تحديث الحالة": "Update status",
  "رمز انضمام البناية:": "Building join code:",
  "إدارة طلبات الوحدات:": "Unit request management:",
  "رمز الوحدة:": "Unit code:",
  "شيكل": "ILS",
  "السعر": "Price",
  "الملاحظات والافتراضات": "Notes and assumptions",
  "SUBMITTED": "Submitted",
  "OPEN": "Open",
  "AWARDED": "Awarded",
  "DECLINED": "Declined",
  "REJECTED": "Rejected",

};

function tx(locale: string | undefined, arabic: string): string {
  return locale === "en" ? englishDashboardText[arabic] ?? "Dashboard" : arabic;
}
function localizedCategory(category: { nameAr: string; nameEn?: string }, locale: string): string {
  return locale === "en" ? category.nameEn || "Service category" : category.nameAr;
}


function getActionMessage(message: string, locale: string): string {
  if (locale === "en") {
    if (message.startsWith("error-")) return "Unable to complete this action. Please check the details and try again.";
    if (message.includes("requested")) return "Request submitted successfully.";
    if (message.includes("exists") || message.includes("already")) return "A request or membership already exists.";
    return "Operation completed successfully.";
  }
  return actionMessages[message] ??
    (message === "membership-requested" ? "تم إرسال طلب الانضمام، وسيظهر الآن لدى مالك الوحدة للموافقة." :
      message === "membership-building-not-found" || message === "ownership-building-not-found" ? "رمز البناية غير صحيح أو البناية غير موجودة." :
        message === "membership-unit-not-found" || message === "ownership-unit-not-found" ? "رقم الوحدة غير موجود داخل هذه البناية." :
          message === "membership-exists" ? "لديك طلب قائم أو عضوية موجودة لهذه الوحدة." :
            message === "ownership-requested" ? "تم إرسال طلب ملكية الوحدة إلى مالك البناية للموافقة." :
              message === "ownership-request-exists" ? "لديك طلب ملكية قيد المراجعة لهذه الوحدة." :
                message === "ownership-already-owned" ? "أنت مالك هذه الوحدة بالفعل." : "تم حفظ العملية بنجاح.");
}

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

  const title = isEnglish
    ? role === Role.OWNER ? "Owner dashboard" : role === Role.TENANT ? "Tenant dashboard" : role === Role.WORKER ? "Worker dashboard" : role === Role.SUPER_ADMIN ? "Admin dashboard" : "Your dashboard"
    : role === Role.OWNER ? tx(locale, "لوحة المالك" ) : role === Role.TENANT ? tx(locale, "لوحة المستأجر" ) : role === Role.WORKER ? tx(locale, "لوحة الفني" ) : role === Role.SUPER_ADMIN ? tx(locale, "لوحة الإدارة" ) : tx(locale, "لوحتك" );
  const actionMessage = message ? getActionMessage(message, locale) : "";
  return (
    <main className="min-h-screen bg-[#f6f8f7] px-5 py-8 text-[#17221d]" dir={isEnglish ? "ltr" : "rtl"}>
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-semibold text-[#176b4d]">{tx(locale, "صيانة" )}</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-1 text-[#52635b]">{tx(locale, "مرحبًا")}, {session.user.name}</p></div>
          <div className="flex items-center gap-3"><a href={`/${locale === "en" ? "ar" : "en"}/dashboard`} className="rounded-full border border-[#c8d7d0] bg-white px-4 py-2 text-sm font-semibold">{locale === "en" ? "العربية" : "English"}</a><LogoutButton locale={locale} /></div>
        </header>
        {actionMessage && <p className="mt-6 rounded-xl bg-[#e3f3e9] px-4 py-3 text-sm font-semibold text-[#176b4d]">{actionMessage}</p>}
        <div className="mt-8">
          {!role && <Card><h2 className="text-xl font-bold">{tx(locale, "اختر دورًا من إعدادات الحساب" )}</h2><p className="mt-2 text-[#52635b]">{tx(locale, "حسابك يحتاج إلى دور قبل البدء في المنصة." )}</p></Card>}
        </div>
        {role === Role.OWNER && <DashboardTabs tabs={[
          { id: "overview", label: isEnglish ? "Overview" : tx(locale, "نظرة عامة" ), content: <div><RoleWorkflowPanel role={role} locale={locale} hasBuildings={buildings.length > 0} hasOwnedUnits={ownedUnits.length > 0} /><OwnerOverviewPanel buildings={buildings} ownedUnits={ownedUnits} requests={requests} ownershipRequests={ownershipRequests} locale={locale} /></div> },
          { id: "memberships", label: `${isEnglish ? "Tenant requests" : tx(locale, "طلبات المستأجرين" )} (${ownerMemberships.length})`, content: <OwnerMembershipPanel memberships={ownerMemberships} locale={locale} /> },
          { id: "ownership", label: `${isEnglish ? "Unit ownership requests" : tx(locale, "طلبات ملكية الوحدات" )} (${ownershipRequests.length})`, content: <OwnerOwnershipPanel requests={ownershipRequests} locale={locale} /> },
          { id: "buildings", label: `${isEnglish ? "My buildings" : tx(locale, "مبانيك" )} (${buildings.length})`, content: <OwnerBuildingsPanel buildings={buildings} locale={locale} /> },
          { id: "units", label: `${isEnglish ? "My units" : tx(locale, "وحداتي" )} (${ownedUnits.length})`, content: <OwnedUnitsPanel units={ownedUnits} locale={locale} /> },
          { id: "workers", label: isEnglish ? "Approved workers" : tx(locale, "الفنيون المعتمدون" ), content: <WorkerDirectoryPanel workers={ownerWorkers} locale={locale} /> },
          { id: "requests", label: `${isEnglish ? "Maintenance requests" : tx(locale, "طلبات الصيانة" )} (${requests.length})`, content: <RequestStatusTabs requests={requests} locale={locale} role={role} workers={ownerWorkers} /> },
          { id: "notifications", label: `${isEnglish ? "Notifications" : tx(locale, "الإشعارات" )} (${unreadNotifications})`, content: notifications.length ? <NotificationList notifications={notifications} locale={locale} /> : <EmptyState text={isEnglish ? "No notifications yet." : tx(locale, "لا توجد إشعارات حاليًا." )} /> },
        ]} />}
        {role === Role.TENANT && <DashboardTabs tabs={[
          { id: "overview", label: isEnglish ? "Overview" : tx(locale, "نظرة عامة" ), content: <div><RoleWorkflowPanel role={role} locale={locale} /><TenantPanel tenancies={tenancies} memberships={memberships} categories={categories} locale={locale} /></div> },
          { id: "workers", label: isEnglish ? "Approved workers" : tx(locale, "الفنيون المعتمدون" ), content: <WorkerDirectoryPanel workers={availableWorkers} locale={locale} /> },
          { id: "requests", label: `${isEnglish ? "My requests" : tx(locale, "طلباتي" )} (${requests.length})`, content: <RequestStatusTabs requests={requests} locale={locale} role={role} workers={availableWorkers} /> },
          { id: "notifications", label: `${isEnglish ? "Notifications" : tx(locale, "الإشعارات" )} (${unreadNotifications})`, content: notifications.length ? <NotificationList notifications={notifications} locale={locale} /> : <EmptyState text={isEnglish ? "No notifications yet." : tx(locale, "لا توجد إشعارات حاليًا." )} /> },
        ]} />}
        {role === Role.WORKER && <DashboardTabs tabs={[
          { id: "overview", label: isEnglish ? "Professional profile" : tx(locale, "الملف المهني" ), content: <div><RoleWorkflowPanel role={role} locale={locale} /><WorkerPanel profile={profile} categories={categories} areas={areas} locale={locale} /></div> },
          { id: "tenders", label: `${isEnglish ? "Tender invitations" : tx(locale, "دعوات المناقصات" )} (${workerProcurements.length})`, content: <WorkerTenderPanel procurements={workerProcurements} locale={locale} /> },
          { id: "requests", label: `${isEnglish ? "Assigned work" : tx(locale, "الأعمال المرتبطة" )} (${requests.length})`, content: <RequestStatusTabs requests={requests} locale={locale} role={role} workers={[]} /> },
          { id: "notifications", label: `${isEnglish ? "Notifications" : tx(locale, "الإشعارات" )} (${unreadNotifications})`, content: notifications.length ? <NotificationList notifications={notifications} locale={locale} /> : <EmptyState text={isEnglish ? "No notifications yet." : tx(locale, "لا توجد إشعارات حاليًا." )} /> },
        ]} />}
        {role === Role.SUPER_ADMIN && <AdminPanel workers={pendingWorkers} locale={locale} requests={requests} notifications={notifications} unreadNotifications={unreadNotifications} />}
      </div>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Card><p className="text-[#52635b]">{text}</p></Card>;
}

function RoleWorkflowPanel({ role, locale, hasBuildings = false, hasOwnedUnits = false }: { role: Role | null; locale: string; hasBuildings?: boolean; hasOwnedUnits?: boolean }) {
  const english = locale === "en";
  const ownerSteps = hasBuildings
    ? english
      ? ["Manage buildings and unit codes.", "Review unit ownership requests.", "Review tenant requests for your owned units.", "Create maintenance tenders, compare offers, negotiate, and award work.", "Close completed work and rate workers."]
      : [tx(locale, "إدارة البنايات ورموز الوحدات." ), tx(locale, "مراجعة طلبات ملكية الوحدات." ), tx(locale, "مراجعة طلبات المستأجرين لوحداتك." ), tx(locale, "إنشاء المناقصات ومقارنة العروض والتفاوض وترسية العمل." ), tx(locale, "إغلاق الأعمال المكتملة وتقييم الفنيين." )]
    : hasOwnedUnits
      ? english
        ? ["Your unit ownership has been approved.", "Review tenant requests for your unit.", "Manage maintenance requests and tender offers for your unit.", "Close completed work and rate workers."]
        : [tx(locale, "تمت الموافقة على ملكية وحدتك." ), tx(locale, "مراجعة طلبات المستأجرين لوحدتك." ), tx(locale, "إدارة طلبات الصيانة والعروض لوحدتك." ), tx(locale, "إغلاق الأعمال المكتملة وتقييم الفنيين." )]
      : english
        ? ["Request ownership using the building code and unit code.", "Wait for the building owner to approve your request.", "After approval, manage your unit and tenant requests."]
        : [tx(locale, "أرسل طلب ملكية باستخدام رمز البناية ورمز الوحدة." ), tx(locale, "انتظر موافقة مالك البناية على الطلب." ), tx(locale, "بعد الموافقة، أدر وحدتك وطلبات المستأجرين." )]
  const steps = role === Role.OWNER ? ownerSteps : role === Role.TENANT
    ? english ? ["Join a unit using its building and unit codes.", "Wait for the unit owner to approve your membership.", "Submit and follow maintenance requests.", "Confirm completed work and rate the worker."] : [tx(locale, "الانضمام إلى وحدة باستخدام رمزي البناية والوحدة." ), tx(locale, "انتظار موافقة مالك الوحدة على طلبك." ), tx(locale, "إرسال ومتابعة طلبات الصيانة." ), tx(locale, "تأكيد انتهاء العمل وتقييم الفني." )]
    : role === Role.WORKER
      ? english ? ["Complete your profile and select categories and service areas.", "Wait for admin approval.", "Review tender invitations and submit or update offers.", "Negotiate with the owner and execute awarded work.", "Move work through progress and tenant confirmation."] : [tx(locale, "إكمال الملف المهني واختيار التخصصات والمناطق." ), tx(locale, "انتظار اعتماد الإدارة." ), tx(locale, "مراجعة دعوات المناقصات وإرسال أو تحديث العروض." ), tx(locale, "التفاوض مع المالك وتنفيذ الأعمال التي تمت ترسيتها." ), tx(locale, "تحديث حالة العمل حتى تأكيد المستأجر." )]
      : english ? ["Review pending worker profiles.", "Monitor maintenance requests and platform activity.", "Manage the platform configuration and notifications."] : [tx(locale, "مراجعة ملفات الفنيين المعلقة." ), tx(locale, "متابعة طلبات الصيانة ونشاط المنصة." ), tx(locale, "إدارة إعدادات المنصة والإشعارات." )]
  return <Card className="mb-6 border-[#b9dcca] bg-[#f1faf4]"><h2 className="text-xl font-bold">{english ? "How your workflow works" : tx(locale, "كيف تعمل المنصة معك" )}</h2><p className="mt-2 text-sm text-[#52635b]">{english ? "Follow these steps for the role associated with your account." : tx(locale, "اتبع هذه الخطوات حسب الدور المرتبط بحسابك." )}</p><ol className="mt-4 grid gap-3 md:grid-cols-2">{steps.map((step, index) => <li key={step} className="flex gap-3 rounded-xl bg-white p-3 text-sm"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#176b4d] font-bold text-white">{index + 1}</span><span>{step}</span></li>)}</ol></Card>;
}

function WorkerDirectoryPanel({ workers, locale }: { workers: DirectoryWorker[]; locale: string }) {
  return <Card><h2 className="text-xl font-bold">{tx(locale, "الفنيون المعتمدون" )}</h2><p className="mt-1 text-sm text-[#52635b]">{tx(locale, "يمكنك مقارنة الخبرة العملية والتقييمات وآراء العملاء قبل اختيار الفني." )}</p>{workers.length === 0 ? <p className="mt-4 text-sm text-[#52635b]">{tx(locale, "لا يوجد فنيون معتمدون حاليًا." )}</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{workers.map((worker) => <div key={worker.id} className="rounded-2xl border border-[#e0e9e4] p-4"><p className="font-bold">{worker.user.name}</p><p className="mt-1 text-sm text-[#52635b]">{worker.user.email}</p><div className="mt-3"><WorkerSummary worker={worker} showComments locale={locale} /></div></div>)}</div>}</Card>;
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
    return { id: tab.id, label: `${tx(locale, tab.label)} (${filtered.length})`, content: filtered.length ? <RequestList requests={filtered} locale={locale} role={role} workers={workers} /> : <EmptyState text={tx(locale, "لا توجد طلبات بهذه الحالة.")} /> };
  })} />;
}

function OwnerOverviewPanel({ buildings, ownedUnits, requests, ownershipRequests, locale }: { buildings: Array<{ id: string }>; ownedUnits: Array<{ id: string }>; requests: DashboardRequest[]; ownershipRequests: Array<{ id: string }>; locale: string }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {[[tx(locale, "البنايات" ), buildings.length], [tx(locale, "وحداتي" ), ownedUnits.length], [tx(locale, "طلبات الصيانة" ), requests.length], [tx(locale, "طلبات الملكية المعلقة" ), ownershipRequests.length]].map(([label, count]) => <Card key={String(label)}><p className="text-sm text-[#52635b]">{label}</p><p className="mt-2 text-3xl font-bold text-[#176b4d]">{count}</p></Card>)}
    <Card className="sm:col-span-2 lg:col-span-4"><h2 className="text-xl font-bold">{tx(locale, "لوحة المالك" )}</h2><p className="mt-2 leading-7 text-[#52635b]">{tx(locale, "من تبويب " )}<strong>{tx(locale, "مبانيك" )}</strong>{tx(locale, " أنشئ البنايات والوحدات، ومن تبويب " )}<strong>{tx(locale, "وحداتي" )}</strong>{tx(locale, " اربط الوحدات التي تملكها في بنايات أخرى. ستجد طلبات المستأجرين وطلبات الملكية في تبويبات مستقلة." )}</p></Card>
  </div>;
}

function OwnerBuildingsPanel({ buildings, locale }: { buildings: Array<{ id: string; name: string; address: string; area: string; joinCode: string; canManageUnitRequests: boolean; units: Array<{ id: string; label: string; joinCode: string; type: string }> }>; locale: string }) {
  return <div><div className="grid items-stretch gap-6 lg:grid-cols-2">
    <Card className="h-full"><h2 className="text-xl font-bold">{tx(locale, "إضافة مبنى ووحدة" )}</h2><form action={createBuilding} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><Input name="name" label={tx(locale, "اسم المبنى")} /><Input name="address" label={tx(locale, "العنوان")} /><Input name="area" label={tx(locale, "المنطقة")} /><Input name="unitLabel" label={tx(locale, "رقم الوحدة الأولى")} required={false} /><select name="unitType" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="APARTMENT">{tx(locale, "شقة" )}</option><option value="SHOP">{tx(locale, "محل" )}</option></select><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="canManageUnitRequests" className="mt-1" /><span><strong>{tx(locale, "السماح بإدارة طلبات الوحدات" )}</strong><span className="block font-normal text-[#52635b]">{tx(locale, "اختياري للبنايات التي يدير مالكها الصيانة العامة." )}</span></span></label><Button>{tx(locale, "حفظ المبنى" )}</Button></form></Card>
    {buildings.length > 0 && <Card className="h-full"><h2 className="text-xl font-bold">{tx(locale, "إضافة وحدة إلى مبنى" )}</h2><form action={createUnit} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><select name="buildingId" required className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}</select><Input name="label" label={tx(locale, "رقم الوحدة")} /><Input name="floor" label={tx(locale, "الطابق")} required={false} /><select name="type" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="APARTMENT">{tx(locale, "شقة" )}</option><option value="SHOP">{tx(locale, "محل" )}</option></select><p className="text-xs text-[#52635b]">{tx(locale, "بعد إضافتها، أرسل رمز البناية ورقم الوحدة لمالك الشقة ليطلب ربطها بحسابه." )}</p><Button>{tx(locale, "إضافة الوحدة" )}</Button></form></Card>}
  </div><div className="mt-6"><OwnerBuildingsList buildings={buildings} locale={locale} /></div></div>;
}

function OwnerBuildingsList({ buildings, locale }: { buildings: Array<{ id: string; name: string; address: string; area: string; joinCode: string; canManageUnitRequests: boolean; units: Array<{ id: string; label: string; joinCode: string; type: string }> }>; locale: string }) {
  return <Card><h2 className="text-xl font-bold">{tx(locale, "مبانيك" )}</h2>{buildings.length === 0 ? <p className="mt-3 text-[#52635b]">{tx(locale, "لم تضف مباني بعد." )}</p> : <ul className="mt-4 grid gap-4 md:grid-cols-2">{buildings.map((building) => <li key={building.id} className="rounded-2xl bg-[#f6f8f7] p-5"><strong>{building.name}</strong><p className="mt-1 text-sm text-[#52635b]">{building.address} · {tx(locale, "رمز انضمام البناية:")} <code>{building.joinCode}</code></p><p className="mt-2 text-sm">{tx(locale, "إدارة طلبات الوحدات:")} {building.canManageUnitRequests ? tx(locale, "مفعلة" ) : tx(locale, "غير مفعلة" )}</p><div className="mt-3 space-y-2 text-sm"><strong>{tx(locale, "الوحدات ورموز انضمامها" )}</strong>{building.units.length ? building.units.map((unit) => <p key={unit.id} className="rounded-xl bg-white px-3 py-2">{unit.label} · {tx(locale, "رمز الوحدة:")} <code>{unit.joinCode}</code></p>) : <p>{tx(locale, "لا توجد وحدات" )}</p>}</div></li>)}</ul>}</Card>;
}

function OwnedUnitsPanel({ units, locale }: { units: Array<{ id: string; label: string; type: string; building: { name: string; address: string } }>; locale: string }) {
  return <div className="grid gap-6 lg:grid-cols-2"><Card><h2 className="text-xl font-bold">{tx(locale, "وحداتي" )}</h2>{units.length === 0 ? <p className="mt-3 text-[#52635b]">{tx(locale, "لا توجد وحدات مرتبطة بحسابك من بنايات أخرى." )}</p> : <ul className="mt-4 grid gap-3">{units.map((unit) => <li key={unit.id} className="rounded-2xl bg-[#f6f8f7] p-4"><strong>{unit.building.name} · الوحدة {unit.label}</strong><p className="mt-1 text-sm text-[#52635b]">{unit.building.address} · {unit.type === "SHOP" ? tx(locale, "محل" ) : tx(locale, "شقة" )}</p></li>)}</ul>}</Card><Card><h2 className="text-xl font-bold">{tx(locale, "طلب ملكية شقة أو محل" )}</h2><p className="mt-2 text-sm leading-6 text-[#52635b]">{tx(locale, "أدخل رمز البناية ورمز الوحدة الذي أرسلهما لك صاحب البناية." )}</p><form action={requestUnitOwnership} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><Input name="joinCode" label={tx(locale, "رمز البناية")} /><Input name="unitCode" label={tx(locale, "رمز الوحدة")} /><Button>{tx(locale, "إرسال طلب ملكية" )}</Button></form></Card></div>;
}

function OwnerMembershipPanel({ memberships, locale }: { memberships: Array<{ id: string; tenant: { name: string; email: string }; unit: { label: string; building: { name: string } } }>; locale: string }) {
  return <Card><h2 className="text-xl font-bold">{tx(locale, "طلبات الانضمام" )}</h2>{memberships.length === 0 ? <p className="mt-3 text-[#52635b]">{tx(locale, "لا توجد طلبات انضمام معلقة." )}</p> : <ul className="mt-4 grid gap-3 md:grid-cols-2">{memberships.map((membership) => <li key={membership.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p><strong>{membership.tenant.name}</strong> · {membership.tenant.email}</p><p className="mt-1 text-sm text-[#52635b]">{membership.unit.building.name} · {membership.unit.label}</p><div className="mt-3 flex gap-2"><form action={decideMembership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="membershipId" value={membership.id} /><input type="hidden" name="decision" value="APPROVED" /><Button>{tx(locale, "موافقة" )}</Button></form><form action={decideMembership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="membershipId" value={membership.id} /><input type="hidden" name="decision" value="REJECTED" /><button className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700">{tx(locale, "رفض" )}</button></form></div></li>)}</ul>}</Card>;
}

function OwnerOwnershipPanel({ requests, locale }: { requests: Array<{ id: string; applicant: { name: string; email: string }; unit: { label: string; building: { name: string } } }>; locale: string }) {
  return <Card><h2 className="text-xl font-bold">{tx(locale, "طلبات ملكية الوحدات" )}</h2>{requests.length === 0 ? <p className="mt-3 text-[#52635b]">{tx(locale, "لا توجد طلبات ملكية معلقة." )}</p> : <ul className="mt-4 grid gap-3 md:grid-cols-2">{requests.map((request) => <li key={request.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p><strong>{request.applicant.name}</strong> · {request.applicant.email}</p><p className="mt-1 text-sm text-[#52635b]">{request.unit.building.name} · الوحدة {request.unit.label}</p><div className="mt-3 flex gap-2"><form action={decideUnitOwnership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="ownershipRequestId" value={request.id} /><input type="hidden" name="decision" value="APPROVED" /><Button>{tx(locale, "موافقة" )}</Button></form><form action={decideUnitOwnership}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="ownershipRequestId" value={request.id} /><input type="hidden" name="decision" value="REJECTED" /><button className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700">{tx(locale, "رفض" )}</button></form></div></li>)}</ul>}</Card>;
}

function AdminPanel({ workers, locale, requests, notifications, unreadNotifications }: { workers: Array<{ id: string; bio: string | null; submittedAt: Date | null; user: { name: string; email: string }; categories: Array<{ category: { nameAr: string } }>; serviceAreas: Array<{ area: { code: string } }> }>; locale: string; requests: DashboardRequest[]; notifications: Array<{ id: string; eventType: string; messageKey: string; createdAt: Date; readAt: Date | null; parameters: unknown }>; unreadNotifications: number }) {
  return <Card>
    <DashboardTabs tabs={[
      {
        id: "overview",
        label: tx(locale, "نظرة عامة" ),
        content: <div><h2 className="text-xl font-bold">{tx(locale, "نظرة عامة" )}</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-[#e9f5ee] p-5"><p className="text-3xl font-bold text-[#0b5c3b]">{requests.length}</p><p className="mt-1 text-sm text-[#52635b]">{tx(locale, "طلبات صيانة" )}</p></div><div className="rounded-2xl bg-[#fff8e8] p-5"><p className="text-3xl font-bold text-[#6b4a00]">{workers.length}</p><p className="mt-1 text-sm text-[#52635b]">{tx(locale, "ملفات فنيين بانتظار المراجعة" )}</p></div><div className="rounded-2xl bg-[#eef2ff] p-5"><p className="text-3xl font-bold text-[#3949ab]">{tx(locale, "جاهز" )}</p><p className="mt-1 text-sm text-[#52635b]">{tx(locale, "حالة النظام" )}</p></div></div><p className="mt-5 text-sm text-[#52635b]">{tx(locale, "إدارة المناقصات والعروض تتم من حساب المالك، والتقييم يرسله المستأجر بعد انتهاء أمر العمل." )}</p></div>,
      },
      {
        id: "workers",
        label: `${tx(locale, "مراجعة الفنيين")} (${workers.length})`,
        content: <div><h2 className="text-xl font-bold">{tx(locale, "مراجعة ملفات الفنيين" )}</h2>{workers.length === 0 ? <p className="mt-3 text-[#52635b]">{tx(locale, "لا توجد ملفات بانتظار المراجعة." )}</p> : <ul className="mt-4 space-y-3">{workers.map((worker) => <li key={worker.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p><strong>{worker.user.name}</strong> · {worker.user.email}</p><p className="mt-1 text-sm text-[#52635b]">{tx(locale, "أُرسل في:")} {worker.submittedAt?.toLocaleDateString(locale === "en" ? "en-US" : "ar-JO") ?? tx(locale, "غير متوفر" )}</p><p className="mt-2 text-sm">{worker.bio || tx(locale, "لم يضف الفني نبذة." )}</p><p className="mt-2 text-sm"><strong>{tx(locale, "التخصصات:" )}</strong> {worker.categories.map((item) => localizedCategory(item.category, locale)).join(tx(locale, "، " )) || tx(locale, "غير محددة" )}</p><p className="mt-1 text-sm"><strong>{tx(locale, "المناطق:" )}</strong> {worker.serviceAreas.map((item) => item.area.code).join(tx(locale, "، " )) || tx(locale, "غير محددة" )}</p><div className="mt-3 flex flex-wrap gap-2"><form action={reviewWorkerProfile}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workerId" value={worker.id} /><input type="hidden" name="decision" value="APPROVED" /><Button>{tx(locale, "اعتماد الملف" )}</Button></form><form action={reviewWorkerProfile} className="flex gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workerId" value={worker.id} /><input type="hidden" name="decision" value="CHANGES_REQUESTED" /><input name="reason" placeholder={tx(locale, "سبب التعديل (اختياري)")} className="rounded-xl border border-[#c8d7d0] px-3 py-2 text-sm" /><Button>{tx(locale, "طلب تعديل" )}</Button></form></div></li>)}</ul>}</div>,
      },
      {
        id: "requests",
        label: `${tx(locale, "طلبات الصيانة")} (${requests.length})`,
        content: <RequestStatusTabs requests={requests} locale={locale} role={Role.SUPER_ADMIN} workers={[]} />,
      },
      {
        id: "settings",
        label: tx(locale, "إعدادات النظام" ),
        content: <div><h2 className="text-xl font-bold">{tx(locale, "إعدادات النظام" )}</h2><p className="mt-3 text-[#52635b]">{tx(locale, "الإشعارات، التصنيفات، مناطق الخدمة، وإعدادات الدفع." )}</p></div>,
      },
      {
        id: "notifications",
        label: `${tx(locale, "الإشعارات")} (${unreadNotifications})`,
        content: notifications.length ? <NotificationList notifications={notifications} locale={locale} /> : <p className="text-[#52635b]">{tx(locale, "لا توجد إشعارات حاليًا." )}</p>,
      },
    ]} />
  </Card>;
}

function TenantPanel({ tenancies, memberships, categories, locale }: { tenancies: Array<{ id: string; unit: { label: string; building: { name: string; joinCode: string } } }>; memberships: Array<{ id: string; state: string; unit: { label: string; building: { name: string } } }>; categories: Array<{ id: string; nameAr: string; nameEn: string }>; locale: string }) {
  return <div className="grid gap-6 lg:grid-cols-2">
    <Card><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{tx(locale, "الانضمام إلى وحدة" )}</h2><p className="mt-1 text-sm text-[#52635b]">{tx(locale, "أدخل رمز البناية ورمز وحدتك." )}</p></div><span className="rounded-full bg-[#eef7f1] px-3 py-1 text-xs font-bold text-[#176b4d]">{tx(locale, "الخطوة 1" )}</span></div><form action={requestMembership} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><Input name="joinCode" label={tx(locale, "رمز البناية")} /><Input name="unitCode" label={tx(locale, "رمز الوحدة")} /><Button>{tx(locale, "إرسال طلب الانضمام" )}</Button></form>{memberships.length > 0 && <ul className="mt-4 space-y-2 border-t border-[#e0e9e4] pt-4 text-sm">{memberships.map((membership) => <li key={membership.id} className="flex items-center justify-between gap-2"><span>{membership.unit.building.name} · {membership.unit.label}</span><span className="font-semibold text-[#52635b]">{membership.state === "PENDING" ? tx(locale, "بانتظار الموافقة" ) : membership.state}</span></li>)}</ul>}</Card>
    {tenancies.length > 0 && <Card><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{tx(locale, "طلب صيانة" )}</h2><p className="mt-1 text-sm text-[#52635b]">{tx(locale, "صف المشكلة ليتم التعامل معها." )}</p></div><span className="rounded-full bg-[#fff8e8] px-3 py-1 text-xs font-bold text-[#8a6200]">{tx(locale, "الخطوة 2" )}</span></div><form action={createMaintenanceRequest} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><select name="unitId" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{tenancies.map((tenancy) => <option key={tenancy.id} value={tenancy.id}>{tenancy.unit.building.name} · {tenancy.unit.label}</option>)}</select><select name="categoryId" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5">{categories.map((category) => <option key={category.id} value={category.id}>{localizedCategory(category, locale)}</option>)}</select><Input name="title" label={tx(locale, "عنوان المشكلة")} /><label className="text-sm font-semibold">{tx(locale, "الوصف" )}<textarea name="description" required className="mt-2 min-h-28 w-full rounded-xl border border-[#c8d7d0] px-3 py-2.5" /></label><select name="urgency" className="rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="NORMAL">{tx(locale, "عادية" )}</option><option value="URGENT">{tx(locale, "عاجلة" )}</option><option value="LOW">{tx(locale, "منخفضة" )}</option></select><Button>{tx(locale, "إرسال الطلب" )}</Button></form></Card>}
    {tenancies.length === 0 && <Card><h2 className="text-xl font-bold">{tx(locale, "طلب صيانة" )}</h2><p className="mt-2 text-sm leading-6 text-[#52635b]">{tx(locale, "بعد موافقة المالك على طلب الانضمام، سيظهر هنا نموذج إرسال طلب الصيانة." )}</p></Card>}
  </div>;
}

function WorkerPanel({
  profile,
  categories,
  areas,
  locale,
}: {
  profile: { bio: string | null; status: string; categories: Array<{ categoryId: string }>; serviceAreas: Array<{ areaId: string }>; tenantFeedbacks: Array<{ rating: number; comment: string | null }>; ownerFeedbacks: Array<{ rating: number; comment: string | null }> } | null;
  categories: Array<{ id: string; nameAr: string; nameEn: string }>;
  areas: Array<{ id: string; code: string }>;
  locale: string;
}) {
  const feedback = [...(profile?.tenantFeedbacks ?? []), ...(profile?.ownerFeedbacks ?? [])];
  const average = feedback.length ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1) : tx(locale, "لا يوجد" );
  return <Card><h2 className="text-xl font-bold">{tx(locale, "الملف المهني" )}</h2><p className="mt-2 text-sm text-[#52635b]">{tx(locale, "الحالة:")} {profile?.status === "PENDING_REVIEW" ? tx(locale, "بانتظار مراجعة الإدارة" ) : profile?.status === "APPROVED" ? tx(locale, "معتمد ويمكنك استقبال الدعوات" ) : profile?.status === "CHANGES_REQUESTED" ? tx(locale, "مطلوب تعديل الملف ثم إعادة الإرسال" ) : profile?.status === "REJECTED" ? tx(locale, "مرفوض" ) : tx(locale, "مسودة" )}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#f6f8f7] p-4"><p className="text-sm text-[#52635b]">{tx(locale, "متوسط التقييم" )}</p><p className="mt-1 text-2xl font-bold text-[#176b4d]">{average} {feedback.length ? "/ 5" : ""}</p></div><div className="rounded-2xl bg-[#f6f8f7] p-4"><p className="text-sm text-[#52635b]">{tx(locale, "التقييمات" )}</p><p className="mt-1 text-2xl font-bold">{feedback.length}</p></div></div>{feedback.length > 0 && <ul className="mt-4 space-y-2">{feedback.map((item, index) => <li key={`${item.rating}-${index}`} className="rounded-xl border border-[#e0e9e4] p-3 text-sm"><strong>{item.rating}/5</strong>{item.comment && <span className="mr-2 text-[#52635b]">{item.comment}</span>}</li>)}</ul>}{profile?.status === "PENDING_REVIEW" && <p className="mt-2 rounded-xl bg-[#fff8e8] px-3 py-2 text-sm text-[#6b4a00]">{tx(locale, "تم استلام طلبك. سيظهر الآن في لوحة الإدارة لحين اعتماده." )}</p>}<form action={submitWorkerProfile} className="mt-4 grid gap-3"><input type="hidden" name="locale" value={locale} /><label className="text-sm font-semibold">{tx(locale, "نبذة عن خبرتك" )}<textarea name="bio" defaultValue={profile?.bio ?? ""} className="mt-2 min-h-28 w-full rounded-xl border border-[#c8d7d0] px-3 py-2.5" /></label><Input name="yearsOfExperience" label={tx(locale, "سنوات الخبرة")} type="number" /><fieldset><legend className="text-sm font-semibold">{tx(locale, "التخصصات" )}</legend><div className="mt-2 grid gap-2">{categories.map((category) => <label key={category.id} className="text-sm"><input type="checkbox" name="categoryIds" value={category.id} defaultChecked={profile?.categories.some((item) => item.categoryId === category.id)} className="ml-2" />{localizedCategory(category, locale)}</label>)}</div></fieldset><fieldset><legend className="text-sm font-semibold">{tx(locale, "مناطق الخدمة" )}</legend><div className="mt-2 grid gap-2">{areas.map((area) => <label key={area.id} className="text-sm"><input type="checkbox" name="areaIds" value={area.id} defaultChecked={profile?.serviceAreas.some((item) => item.areaId === area.id)} className="ml-2" />{area.code}</label>)}</div></fieldset><Button>{tx(locale, "إرسال للمراجعة" )}</Button></form></Card>;
}

function WorkerTenderPanel({ procurements, locale }: { procurements: Array<{ id: string; deadline: Date | null; request: { title: string; description: string; category: { nameAr: string; nameEn: string }; unit: { label: string; building: { name: string } } }; offers: Array<{ id: string; state: string; messages: Array<{ id: string; message: string; author: { name: string } }> }> }>; locale: string }) {
  return <Card><h2 className="text-xl font-bold">{tx(locale, "دعوات المناقصات" )}</h2>{procurements.length === 0 ? <p className="mt-2 text-[#52635b]">{tx(locale, "لا توجد دعوات مفتوحة حاليًا." )}</p> : <ul className="mt-4 space-y-4">{procurements.map((procurement) => { const firstOffer = procurement.offers.length === 0; return <li key={procurement.id} className="rounded-2xl bg-[#f6f8f7] p-4"><p className="font-bold">{procurement.request.title}</p><p className="mt-1 text-sm text-[#52635b]">{localizedCategory(procurement.request.category, locale)} · {procurement.request.unit.building.name} · {procurement.request.unit.label}</p><p className="mt-1 text-sm">{procurement.request.description}</p>{!firstOffer && <p className="mt-2 text-sm font-semibold text-[#176b4d]">{tx(locale, "تم إرسال عرضك - يمكنك تحديث الحقول التي تريد تغييرها فقط" )}</p>}{procurement.offers.map((offer) => <OfferConversation key={offer.id} offerId={offer.id} messages={offer.messages} locale={locale} />)}<form action={submitOffer} className="mt-3 grid gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="procurementId" value={procurement.id} /><Input name="amountShekels" label={tx(locale, "قيمة العرض (شيكل)")} type="number" required={firstOffer} /><label className="text-sm font-semibold">{tx(locale, "نطاق العمل" )}<p className="mt-1 text-xs font-normal text-[#52635b]">{tx(locale, "اكتب بالتفصيل ما الذي سيتضمنه العرض، وما سيتم إصلاحه أو تركيبه." )}</p><textarea name="scopeInclusions" required={firstOffer} className="mt-1 min-h-20 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /></label><Input name="assumptions" label={tx(locale, "ملاحظات أو افتراضات")} required={firstOffer} /><Input name="duration" label={tx(locale, "المدة المتوقعة")} required={firstOffer} /><label className="text-sm font-semibold">{tx(locale, "التاريخ المقترح للعمل" )}<input name="proposedDate" type="date" required={firstOffer} className="mt-1 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /></label><label className="text-sm font-semibold">{tx(locale, "صالح حتى" )}<input name="validUntil" type="date" required={firstOffer} className="mt-1 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /></label><div className="flex flex-wrap gap-2"><Button>{firstOffer ? tx(locale, "إرسال العرض" ) : tx(locale, "تحديث العرض" )}</Button><button formAction={respondTenderInvitation} name="response" value="DECLINED" className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700">{tx(locale, "رفض الدعوة" )}</button></div></form></li>; })}</ul>}</Card>;
}

function OfferConversation({ offerId, messages, locale }: { offerId: string; messages: Array<{ id: string; message: string; author: { name: string } }>; locale: string }) {
  return <div className="mt-3 rounded-xl border border-[#dce8e1] bg-white p-3"><p className="text-sm font-semibold">{tx(locale, "التفاوض والاستفسارات" )}</p>{messages.length > 0 && <ul className="mt-2 space-y-1 text-sm">{messages.map((item) => <li key={item.id}><strong>{item.author.name}:</strong> {item.message}</li>)}</ul>}<form action={sendOfferMessage} className="mt-2 flex gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="offerId" value={offerId} /><input name="message" required placeholder={tx(locale, "اكتب ردًا أو استفسارًا...")} className="min-w-0 flex-1 rounded-xl border border-[#c8d7d0] px-3 py-2" /><Button>{tx(locale, "إرسال" )}</Button></form></div>;
}

type DashboardRequest = {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  version: number;
  category: { id: string; nameAr: string; nameEn: string };
  unit: { label: string; building: { name: string } };
  comments: Array<{ id: string; text: string; author: { name: string } }>;
  workOrders: Array<{ id: string; workerId: string; worker: { user: { name: string } }; tenantFeedback: { id: string; rating: number; comment: string | null } | null; ownerFeedback: { id: string; rating: number; comment: string | null } | null }>;
  procurements: Array<{
    id: string;
    state: string;
    invitations: Array<{ workerId: string; response: string; worker: { user: { name: string } } }>;
    offers: Array<{ id: string; workerId: string; totalAgorot: number; createdAt: Date; updatedAt: Date; updatedFields: string[]; scopeInclusions: string; assumptions: string | null; proposedDate: Date | null; duration: string | null; validUntil: Date; state: string; worker: { user: { name: string } }; messages: Array<{ id: string; message: string; author: { name: string } }> }>;
  }>;
};

type DirectoryWorker = { id: string; user: { name: string; email: string }; categories: Array<{ categoryId: string }>; workOrders: Array<{ id: string; request: { status: RequestStatus } }>; tenantFeedbacks: Array<{ rating: number; comment: string | null }>; ownerFeedbacks: Array<{ rating: number; comment: string | null }> };

function WorkerSummary({ worker, showComments = false, locale }: { worker: DirectoryWorker; showComments?: boolean; locale?: string }) {
  const feedback = [...worker.tenantFeedbacks, ...worker.ownerFeedbacks];
  const average = feedback.length ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1) : tx(locale, "لا يوجد" );
  const completed = worker.workOrders.filter((order) => order.request.status === RequestStatus.CLOSED).length;
  return <span className="text-sm"><strong>{worker.user.name}</strong> · {tx(locale, "متوسط التقييم")} {average}{feedback.length ? "/5" : ""} · {feedback.length} {tx(locale, "تقييم")} · {completed} {tx(locale, "أعمال مكتملة")}{showComments && feedback.filter((item) => item.comment).length > 0 && <span className="mt-2 block border-t border-[#e0e9e4] pt-2 text-[#52635b]">{feedback.filter((item) => item.comment).map((item, index) => <span key={`${item.rating}-${index}`} className="mr-2 inline-block">&quot;{item.comment}&quot;</span>)}</span>}</span>;
}

function RequestList({ requests, locale, role, workers }: { requests: DashboardRequest[]; locale: string; role: Role | null; workers: DirectoryWorker[] }) {
  return <section className="mt-8"><h2 className="mb-4 text-2xl font-bold">{tx(locale, "طلبات الصيانة" )}</h2><div className="grid gap-4">{requests.map((request) => {
    const openProcurement = request.procurements.find((procurement) => procurement.state === "OPEN");
    const matchingWorkers = workers.filter((worker) => worker.categories.some((category) => category.categoryId === request.category.id));
    return <Card key={request.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{request.title}</h3><p className="mt-1 text-sm text-[#52635b]">{request.unit.building.name} · {request.unit.label} · {localizedCategory(request.category, locale)}</p></div><span className="rounded-full bg-[#e3f3e9] px-3 py-1 text-xs font-semibold text-[#176b4d]">{tx(locale, statusLabels[request.status])}</span></div><p className="mt-3 leading-7">{request.description}</p>
      {role === Role.OWNER && request.status === RequestStatus.SUBMITTED && <form action={createProcurement} className="mt-4 rounded-2xl border border-[#dce8e1] p-4"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="requestId" value={request.id} /><p className="font-semibold">{tx(locale, "اختيار طريقة الحصول على الفني" )}</p><select name="procurementMode" className="mt-3 w-full max-w-md rounded-xl border border-[#c8d7d0] px-3 py-2.5"><option value="INVITED">{tx(locale, "دعوة فنيين محددين" )}</option><option value="PUBLIC">{tx(locale, "استقبال عروض من الفنيين المعتمدين" )}</option></select>{matchingWorkers.length === 0 ? <p className="mt-2 text-sm text-[#52635b]">{tx(locale, "لا يوجد فني معتمد لهذا التخصص للدعوات المحددة. يمكنك اختيار استقبال عروض عامة." )}</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{matchingWorkers.map((worker) => <label key={worker.id} className="rounded-xl border border-[#e0e9e4] p-3 text-sm"><input type="checkbox" name="workerIds" value={worker.id} className="ml-2" /><WorkerSummary worker={worker} showComments locale={locale} /></label>)}</div>}<label className="mt-3 block max-w-md text-sm font-semibold">{tx(locale, "الموعد النهائي" )}<input name="deadline" type="date" className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /></label><div className="mt-4"><Button>{tx(locale, "إنشاء وإرسال المناقصة" )}</Button></div></form>}
      {request.workOrders.map((order) => <p key={`worker-${order.id}`} className="mt-3 rounded-xl bg-[#f6f8f7] px-3 py-2 text-sm">{tx(locale, "الفني: " )}<strong>{order.worker.user.name}</strong>{order.tenantFeedback && <span className="mr-3">{tx(locale, "تقييم المستأجر:")} {order.tenantFeedback.rating}/5</span>}{order.ownerFeedback && <span className="mr-3">{tx(locale, "تقييم المالك:")} {order.ownerFeedback.rating}/5</span>}</p>)}
      {role === Role.OWNER && openProcurement && <div className="mt-4 rounded-2xl border border-[#dce8e1] p-4"><p className="font-semibold">{tx(locale, "العروض الواردة")} ({openProcurement.offers.length})</p>{openProcurement.offers.length === 0 ? <p className="mt-2 text-sm text-[#52635b]">{tx(locale, "بانتظار عروض الفنيين." )}</p> : <ul className="mt-2 space-y-3">{openProcurement.offers.map((offer) => { const offerWorker = workers.find((worker) => worker.id === offer.workerId); const isUpdated = offer.updatedAt.getTime() > offer.createdAt.getTime(); const changed = (field: string) => offer.updatedFields.includes(field) ? <span className="mr-2 rounded-full bg-[#fff8e8] px-2 py-1 text-xs font-semibold text-[#8a6200]">{tx(locale, "محدّث" )}</span> : null; return <li key={offer.id} className="rounded-xl bg-[#f6f8f7] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{offer.worker.user.name}{isUpdated && <span className="mr-2 rounded-full bg-[#fff8e8] px-2 py-1 text-xs font-semibold text-[#8a6200]">{tx(locale, "محدّث" )}</span>}</strong><span className="font-semibold text-[#176b4d]">{(offer.totalAgorot / 100).toFixed(2)} {tx(locale, "شيكل")} · {tx(locale, offer.state)}</span></div>{offerWorker && <p className="mt-2"><WorkerSummary worker={offerWorker} showComments locale={locale} /></p>}<dl className="mt-3 grid gap-2 text-[#52635b]"><div><dt className="font-semibold text-[#17221d]">{tx(locale, "السعر")} {changed("price")}</dt><dd>{(offer.totalAgorot / 100).toFixed(2)} {tx(locale, "شيكل")}</dd></div><div><dt className="font-semibold text-[#17221d]">{tx(locale, "نطاق العمل")} {changed("scope")}</dt><dd>{offer.scopeInclusions}</dd></div>{offer.assumptions && <div><dt className="font-semibold text-[#17221d]">{tx(locale, "الملاحظات والافتراضات")} {changed("assumptions")}</dt><dd>{offer.assumptions}</dd></div>}<div><dt className="font-semibold text-[#17221d]">{tx(locale, "المدة المتوقعة")} {changed("duration")}</dt><dd>{offer.duration || tx(locale, "لم يحدد" )}</dd></div><div><dt className="font-semibold text-[#17221d]">{tx(locale, "التاريخ المقترح")} {changed("proposedDate")}</dt><dd>{offer.proposedDate?.toLocaleDateString(locale === "en" ? "en-US" : "ar-JO") || tx(locale, "لم يحدد" )}</dd></div><div><dt className="font-semibold text-[#17221d]">{tx(locale, "صالح حتى")} {changed("validUntil")}</dt><dd>{offer.validUntil.toLocaleDateString(locale === "en" ? "en-US" : "ar-JO")}</dd></div></dl><OfferConversation offerId={offer.id} messages={offer.messages} locale={locale} />{offer.state === "SUBMITTED" && <form action={awardOffer} className="mt-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="offerId" value={offer.id} /><Button>{tx(locale, "ترسية وإنشاء أمر عمل" )}</Button></form>}</li>; })}</ul>}</div>}
      {role === Role.WORKER && request.status === RequestStatus.ASSIGNED && <StatusForm request={request} locale={locale} statuses={["IN_PROGRESS"]} />}
      {role === Role.WORKER && request.status === RequestStatus.IN_PROGRESS && <StatusForm request={request} locale={locale} statuses={["AWAITING_TENANT_CONFIRMATION"]} submitLabel={tx(locale, "إنهاء العمل وإرساله للتأكيد")} />}
      {role === Role.OWNER && request.status === RequestStatus.IN_PROGRESS && <StatusForm request={request} locale={locale} statuses={["CANCELLED"]} submitLabel={tx(locale, "إلغاء الطلب")} />}
      {role === Role.OWNER && request.status === RequestStatus.TENANT_CONFIRMED && <StatusForm request={request} locale={locale} statuses={["CLOSED"]} />}
      {role === Role.OWNER && request.status === RequestStatus.PROCUREMENT && !openProcurement && <StatusForm request={request} locale={locale} statuses={["CANCELLED"]} />}
      {role === Role.OWNER && request.status === RequestStatus.SUBMITTED && <StatusForm request={request} locale={locale} statuses={["REJECTED", "CANCELLED"]} />}
      {role === Role.TENANT && request.status === RequestStatus.SUBMITTED && <StatusForm request={request} locale={locale} statuses={["CANCELLED"]} />}
      {role === Role.TENANT && request.status === RequestStatus.AWAITING_TENANT_CONFIRMATION && request.workOrders.filter((order) => !order.tenantFeedback).map((order) => <form key={order.id} action={submitTenantFeedback} className="mt-4 rounded-2xl border border-[#dce8e1] p-4"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workOrderId" value={order.id} /><p className="font-semibold">{tx(locale, "قيّم الخدمة" )}</p><select name="rating" className="mt-2 rounded-xl border border-[#c8d7d0] px-3 py-2"><option value="5">{tx(locale, "5 - ممتاز" )}</option><option value="4">{tx(locale, "4 - جيد جدًا" )}</option><option value="3">{tx(locale, "3 - جيد" )}</option><option value="2">{tx(locale, "2 - مقبول" )}</option><option value="1">{tx(locale, "1 - ضعيف" )}</option></select><textarea name="comment" placeholder={tx(locale, "ملاحظات اختيارية")} className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /><div className="mt-2"><Button>{tx(locale, "إرسال التقييم" )}</Button></div></form>)}
      {role === Role.OWNER && request.status === RequestStatus.CLOSED && request.workOrders.filter((order) => !order.ownerFeedback).map((order) => <form key={order.id} action={submitOwnerFeedback} className="mt-4 rounded-2xl border border-[#dce8e1] p-4"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="workOrderId" value={order.id} /><p className="font-semibold">{tx(locale, "قيّم الفني" )}</p><select name="rating" className="mt-2 rounded-xl border border-[#c8d7d0] px-3 py-2"><option value="5">{tx(locale, "5 - ممتاز" )}</option><option value="4">{tx(locale, "4 - جيد جدًا" )}</option><option value="3">{tx(locale, "3 - جيد" )}</option><option value="2">{tx(locale, "2 - مقبول" )}</option><option value="1">{tx(locale, "1 - ضعيف" )}</option></select><textarea name="comment" placeholder={tx(locale, "ملاحظات اختيارية")} className="mt-2 w-full rounded-xl border border-[#c8d7d0] px-3 py-2" /><div className="mt-2"><Button>{tx(locale, "إرسال تقييم المالك" )}</Button></div></form>)}
      {request.comments.length > 0 && <ul className="mt-4 space-y-2 border-t border-[#e0e9e4] pt-4 text-sm">{request.comments.map((comment) => <li key={comment.id}><strong>{comment.author.name}:</strong> {comment.text}</li>)}</ul>}<form action={addComment} className="mt-4 flex gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="requestId" value={request.id} /><input name="text" required placeholder={tx(locale, "أضف تعليقًا...")} className="min-w-0 flex-1 rounded-xl border border-[#c8d7d0] px-3 py-2.5" /><input type="hidden" name="audience" value={role === Role.WORKER ? "JOB_PARTICIPANTS" : "TENANT_OWNER"} /><Button>{tx(locale, "تعليق" )}</Button></form></Card>;
  })}</div></section>;
}

function NotificationList({ notifications, locale }: { notifications: Array<{ id: string; eventType: string; messageKey: string; createdAt: Date; readAt: Date | null; parameters: unknown }>; locale: string }) {
  const labels: Record<string, [string, string]> = {
    MAINTENANCE_REQUEST_CREATED: [tx(locale, "تم إنشاء طلب صيانة جديد" ), "New maintenance request"],
    MEMBERSHIP_REQUESTED: [tx(locale, "طلب مستأجر جديد" ), "New tenant request"],
    MEMBERSHIP_DECIDED: [tx(locale, "تم تحديث طلب المستأجر" ), "Tenant request updated"],
    UNIT_OWNERSHIP_REQUESTED: [tx(locale, "طلب ملكية وحدة جديد" ), "New unit ownership request"],
    UNIT_OWNERSHIP_DECIDED: [tx(locale, "تم البت في طلب ملكية الوحدة" ), "Unit ownership request decided"],
    TENDER_INVITED: [tx(locale, "تمت دعوتك إلى مناقصة" ), "You were invited to a tender"],
    TENDER_INVITATION_CREATED: [tx(locale, "تمت دعوتك إلى مناقصة" ), "You were invited to a tender"],
    OFFER_SUBMITTED: [tx(locale, "تم إرسال عرض جديد" ), "New offer submitted"],
    OFFER_AWARDED: [tx(locale, "تمت ترسية العرض" ), "Offer awarded"],
    TENANT_FEEDBACK_SUBMITTED: [tx(locale, "تم استلام تقييم جديد" ), "New tenant feedback received"],
    OWNER_FEEDBACK_SUBMITTED: [tx(locale, "تم استلام تقييم جديد من المالك" ), "New owner feedback received"],
    WORK_COMPLETION_READY: [tx(locale, "العمل جاهز لتأكيد المستأجر" ), "Work ready for tenant confirmation"],
    OFFER_MESSAGE_RECEIVED: [tx(locale, "رسالة جديدة حول العرض" ), "New offer message"],
  };
  const isEnglish = locale === "en";
  return <section className="mt-8"><Card><h2 className="text-xl font-bold">{isEnglish ? "Notifications" : tx(locale, "الإشعارات" )}</h2><ul className="mt-3 space-y-2">{notifications.map((notification) => { const actorName = typeof notification.parameters === "object" && notification.parameters !== null && "actorName" in notification.parameters && typeof notification.parameters.actorName === "string" ? notification.parameters.actorName : null; const decision = typeof notification.parameters === "object" && notification.parameters !== null && "decision" in notification.parameters && typeof notification.parameters.decision === "string" ? notification.parameters.decision : null; const label = labels[notification.eventType]; const title = label ? label[isEnglish ? 1 : 0] : notification.messageKey; const decisionText = notification.eventType === "UNIT_OWNERSHIP_DECIDED" && decision ? (isEnglish ? decision.toLowerCase() : decision === "APPROVED" ? tx(locale, "تمت الموافقة" ) : tx(locale, "تم الرفض" )) : null;   const sentAt = notification.createdAt.toLocaleString(isEnglish ? "en-US" : "ar-JO", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Gaza" }); return <li key={notification.id} className={`flex items-center justify-between gap-3 rounded-xl p-3 text-sm ${notification.readAt ? "bg-[#f6f8f7]" : "bg-[#e9f5ee]"}`}><span><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong>{title}{decisionText && <span className="ml-2 text-[#176b4d]">({decisionText})</span>}</strong>{actorName && <span className="text-[#60756a]">{isEnglish ? `by ${actorName}` : `بواسطة ${actorName}`}</span>}</span><time dateTime={notification.createdAt.toISOString()} className="mt-1 block text-xs text-[#60756a]">{isEnglish ? `Sent ${sentAt}` : `أُرسل في ${sentAt}`}</time></span>{!notification.readAt && <form action={markNotificationRead}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="notificationId" value={notification.id} /><button className="text-xs font-bold text-[#176b4d]">{isEnglish ? "Mark as read" : tx(locale, "تحديد كمقروء" )}</button></form>}</li>; })}</ul></Card></section>;
}

function StatusForm({ request, locale, statuses, submitLabel = tx(locale, "تحديث الحالة" ) }: { request: { id: string; version: number }; locale: string; statuses: string[]; submitLabel?: string }) {
  return <form action={updateMaintenanceStatus} className="mt-4 flex flex-wrap items-center gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="requestId" value={request.id} /><select name="status" className="rounded-xl border border-[#c8d7d0] px-3 py-2 text-sm">{statuses.map((status) => <option key={status} value={status}>{tx(locale, statusLabels[status as RequestStatus])}</option>)}</select><Button>{submitLabel}</Button></form>;
}
