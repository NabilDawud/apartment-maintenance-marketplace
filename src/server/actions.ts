"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CommentAudience,
  MembershipState,
  ProfileStatus,
  RequestStatus,
  Role,
  UnitType,
  Urgency,
} from "@prisma/client";
import { db } from "@/server/db";
import { requireRole, requireSession } from "@/server/session";

function text(formData: FormData, key: string, required = true) {
  const value = formData.get(key);
  if (typeof value !== "string") {
    if (required) throw new Error(`INVALID_${key.toUpperCase()}`);
    return "";
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`INVALID_${key.toUpperCase()}`);
  return trimmed;
}

function localeFrom(formData: FormData) {
  return text(formData, "locale", false) === "en" ? "en" : "ar";
}

function dashboard(formData: FormData, message: string) {
  redirect(`/${localeFrom(formData)}/dashboard?message=${encodeURIComponent(message)}`);
}

function enumValue<T extends string>(value: string, values: readonly T[], key: string): T {
  if (!values.includes(value as T)) throw new Error(`INVALID_${key.toUpperCase()}`);
  return value as T;
}

export async function createBuilding(formData: FormData) {
  const { session } = await requireRole(Role.OWNER);
  const name = text(formData, "name");
  const address = text(formData, "address");
  const area = text(formData, "area");
  const unitLabel = text(formData, "unitLabel", false);
  const unitType = enumValue(text(formData, "unitType", false) || UnitType.APARTMENT, Object.values(UnitType), "unitType");
  const joinCode = randomBytes(5).toString("hex").toUpperCase();

  await db.building.create({
    data: {
      ownerId: session.user.id,
      name,
      address,
      area,
      joinCode,
      ...(unitLabel ? { units: { create: { ownerId: session.user.id, label: unitLabel, type: unitType } } } : {}),
    },
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "building-created");
}

export async function createUnit(formData: FormData) {
  const { session } = await requireRole(Role.OWNER);
  const buildingId = text(formData, "buildingId");
  const label = text(formData, "label");
  const type = enumValue(text(formData, "type"), Object.values(UnitType), "type");
  const building = await db.building.findFirst({ where: { id: buildingId, ownerId: session.user.id, archivedAt: null } });
  if (!building) throw new Error("BUILDING_NOT_FOUND");
  await db.unit.create({ data: { buildingId, ownerId: session.user.id, label, type, floor: text(formData, "floor", false) || null } });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "unit-created");
}

export async function requestMembership(formData: FormData) {
  const { session } = await requireRole(Role.TENANT);
  const joinCode = text(formData, "joinCode").toUpperCase();
  const unitLabel = text(formData, "unitLabel");
  const building = await db.building.findFirst({
    where: { joinCode, archivedAt: null },
    include: { units: { where: { label: unitLabel, archivedAt: null } } },
  });
  const unit = building?.units[0];
  if (!unit) throw new Error("UNIT_NOT_FOUND");
  const existing = await db.membershipRequest.findFirst({
    where: { tenantId: session.user.id, unitId: unit.id, state: { in: [MembershipState.PENDING, MembershipState.APPROVED] } },
  });
  if (existing) throw new Error("MEMBERSHIP_EXISTS");
  await db.membershipRequest.create({ data: { tenantId: session.user.id, unitId: unit.id } });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "membership-requested");
}

export async function decideMembership(formData: FormData) {
  const { session, role } = await requireRole(Role.OWNER, Role.SUPER_ADMIN);
  const membershipId = text(formData, "membershipId");
  const decision = enumValue(text(formData, "decision"), [MembershipState.APPROVED, MembershipState.REJECTED] as const, "decision");
  const membership = await db.membershipRequest.findUnique({ where: { id: membershipId }, include: { unit: true } });
  if (!membership || (role !== Role.SUPER_ADMIN && membership.unit.ownerId !== session.user.id)) throw new Error("FORBIDDEN");
  await db.$transaction(async (tx) => {
    await tx.membershipRequest.update({ where: { id: membershipId }, data: { state: decision, decidedById: session.user.id, decisionTime: new Date() } });
    if (decision === MembershipState.APPROVED) {
      await tx.tenancy.create({ data: { tenantId: membership.tenantId, unitId: membership.unitId, membershipReqId: membership.id } });
    }
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "membership-decided");
}

export async function submitWorkerProfile(formData: FormData) {
  const { session } = await requireRole(Role.WORKER);
  const bio = text(formData, "bio", false);
  const yearsOfExperience = Number(text(formData, "yearsOfExperience", false) || "0");
  if (!Number.isInteger(yearsOfExperience) || yearsOfExperience < 0 || yearsOfExperience > 80) throw new Error("INVALID_EXPERIENCE");
  const categoryIds = formData.getAll("categoryIds").filter((value): value is string => typeof value === "string");
  const areaIds = formData.getAll("areaIds").filter((value): value is string => typeof value === "string");
  if (!categoryIds.length || !areaIds.length) throw new Error("PROFILE_TAXONOMY_REQUIRED");

  const [categories, areas] = await Promise.all([
    db.serviceCategory.findMany({ where: { id: { in: categoryIds }, isActive: true }, select: { id: true, code: true, nameAr: true } }),
    db.serviceArea.findMany({ where: { id: { in: areaIds }, isActive: true }, select: { id: true, code: true } }),
  ]);
  if (categories.length !== categoryIds.length || areas.length !== areaIds.length) throw new Error("INVALID_PROFILE_TAXONOMY");

  await db.$transaction(async (tx) => {
    const current = await tx.workerProfile.findUnique({ where: { id: session.user.id } });
    const revision = (current?.currentRevision ?? 0) + 1;
    await tx.workerProfile.upsert({
      where: { id: session.user.id },
      create: {
        id: session.user.id,
        bio,
        currentRevision: revision,
        submittedRevision: revision,
        submittedAt: new Date(),
        status: ProfileStatus.PENDING_REVIEW,
        categories: { create: categories.map((category) => ({ categoryId: category.id, yearsOfExperience })) },
        serviceAreas: { create: areas.map((area) => ({ areaId: area.id })) },
      },
      update: {
        bio,
        currentRevision: revision,
        submittedRevision: revision,
        submittedAt: new Date(),
        status: ProfileStatus.PENDING_REVIEW,
        categories: { deleteMany: {}, create: categories.map((category) => ({ categoryId: category.id, yearsOfExperience })) },
        serviceAreas: { deleteMany: {}, create: areas.map((area) => ({ areaId: area.id })) },
      },
    });
    await tx.workerSubmission.create({
      data: {
        workerId: session.user.id,
        revision,
        status: ProfileStatus.PENDING_REVIEW,
        snapshotData: { bio, yearsOfExperience, categories, areas },
      },
    });
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "profile-submitted");
}

export async function reviewWorkerProfile(formData: FormData) {
  const { session } = await requireRole(Role.SUPER_ADMIN);
  const workerId = text(formData, "workerId");
  const decision = enumValue(text(formData, "decision"), [ProfileStatus.APPROVED, ProfileStatus.CHANGES_REQUESTED, ProfileStatus.REJECTED] as const, "decision");
  const profile = await db.workerProfile.findUnique({ where: { id: workerId } });
  if (!profile) throw new Error("PROFILE_NOT_FOUND");
  await db.workerProfile.update({ where: { id: workerId }, data: { status: decision, approvedRevision: decision === ProfileStatus.APPROVED ? profile.submittedRevision : profile.approvedRevision, decisionTime: new Date(), decisionReason: text(formData, "reason", false) || null, reviewedById: session.user.id } });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "profile-reviewed");
}

export async function createMaintenanceRequest(formData: FormData) {
  const { session } = await requireRole(Role.TENANT);
  const unitId = text(formData, "unitId");
  const categoryId = text(formData, "categoryId");
  const title = text(formData, "title");
  const description = text(formData, "description");
  const urgency = enumValue(text(formData, "urgency", false) || Urgency.NORMAL, Object.values(Urgency), "urgency");
  const tenancy = await db.tenancy.findFirst({ where: { id: unitId, tenantId: session.user.id, endedAt: null } });
  if (!tenancy) throw new Error("TENANCY_NOT_FOUND");
  const category = await db.serviceCategory.findFirst({ where: { id: categoryId, isActive: true } });
  if (!category) throw new Error("CATEGORY_NOT_FOUND");
  await db.maintenanceRequest.create({
    data: {
      unitId: tenancy.unitId,
      tenancyId: tenancy.id,
      tenantId: session.user.id,
      createdById: session.user.id,
      categoryId,
      title,
      description,
      urgency,
    },
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "request-created");
}

const transitions: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.SUBMITTED]: [RequestStatus.PROCUREMENT, RequestStatus.CANCELLED, RequestStatus.REJECTED],
  [RequestStatus.PROCUREMENT]: [RequestStatus.ASSIGNED, RequestStatus.CANCELLED],
  [RequestStatus.ASSIGNED]: [RequestStatus.IN_PROGRESS, RequestStatus.CANCELLED],
  [RequestStatus.IN_PROGRESS]: [RequestStatus.AWAITING_TENANT_CONFIRMATION, RequestStatus.CANCELLED],
  [RequestStatus.AWAITING_TENANT_CONFIRMATION]: [RequestStatus.TENANT_CONFIRMED],
  [RequestStatus.TENANT_CONFIRMED]: [RequestStatus.CLOSED],
  [RequestStatus.CLOSED]: [],
  [RequestStatus.CANCELLED]: [],
  [RequestStatus.REJECTED]: [],
};

export async function updateMaintenanceStatus(formData: FormData) {
  const { session, role } = await requireRole(Role.TENANT, Role.OWNER, Role.WORKER, Role.SUPER_ADMIN);
  const requestId = text(formData, "requestId");
  const nextStatus = enumValue(text(formData, "status"), Object.values(RequestStatus), "status");
  const request = await db.maintenanceRequest.findUnique({
    where: { id: requestId },
    include: { unit: true, workOrders: { select: { workerId: true } } },
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");
  const isTenant = request.tenantId === session.user.id;
  const isOwner = request.unit.ownerId === session.user.id;
  const isWorker = request.workOrders.some((order) => order.workerId === session.user.id);
  if (role !== Role.SUPER_ADMIN && !isTenant && !isOwner && !isWorker) throw new Error("FORBIDDEN");
  const allowed =
    role === Role.SUPER_ADMIN ||
    (isTenant && ([RequestStatus.CANCELLED, RequestStatus.TENANT_CONFIRMED] as RequestStatus[]).includes(nextStatus)) ||
    (isOwner && ([RequestStatus.PROCUREMENT, RequestStatus.ASSIGNED, RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.CLOSED] as RequestStatus[]).includes(nextStatus)) ||
    (isWorker && ([RequestStatus.IN_PROGRESS, RequestStatus.AWAITING_TENANT_CONFIRMATION] as RequestStatus[]).includes(nextStatus));
  if (!allowed || (role !== Role.SUPER_ADMIN && !transitions[request.status].includes(nextStatus))) throw new Error("INVALID_STATUS_TRANSITION");
  const result = await db.maintenanceRequest.updateMany({
    where: { id: request.id, version: request.version },
    data: { status: nextStatus, version: { increment: 1 } },
  });
  if (!result.count) throw new Error("REQUEST_CHANGED");
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "status-updated");
}

export async function addComment(formData: FormData) {
  const session = await requireSession();
  const requestId = text(formData, "requestId");
  const commentText = text(formData, "text");
  const audience = enumValue(text(formData, "audience", false) || CommentAudience.TENANT_OWNER, Object.values(CommentAudience), "audience");
  const request = await db.maintenanceRequest.findUnique({
    where: { id: requestId },
    include: { unit: true, workOrders: { select: { workerId: true } } },
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");
  const canComment =
    session.user.id === request.tenantId ||
    session.user.id === request.unit.ownerId ||
    request.workOrders.some((order) => order.workerId === session.user.id) ||
    (session.user as typeof session.user & { role?: Role }).role === Role.SUPER_ADMIN;
  if (!canComment) throw new Error("FORBIDDEN");
  if (audience === CommentAudience.JOB_PARTICIPANTS && !request.workOrders.some((order) => order.workerId === session.user.id) && session.user.id !== request.unit.ownerId && session.user.id !== request.tenantId) {
    throw new Error("FORBIDDEN");
  }
  await db.comment.create({ data: { requestId, authorId: session.user.id, text: commentText, audience } });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "comment-added");
}
