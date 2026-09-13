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
import type { Prisma } from "@prisma/client";
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

function integerValue(formData: FormData, key: string, options: { required?: boolean; min?: number; max?: number } = {}) {
  const value = Number(text(formData, key, options.required ?? true));
  if (!Number.isInteger(value) || (options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max)) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function shekelAmount(formData: FormData, key: string) {
  const raw = text(formData, key);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 100000000 || !/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return Math.round(value * 100);
}

function optionalDate(formData: FormData, key: string) {
  const value = text(formData, key, false);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`INVALID_${key.toUpperCase()}`);
  return date;
}

function endOfDay(date: Date | null) {
  if (date) date.setHours(23, 59, 59, 999);
  return date;
}

type NotificationClient = Pick<typeof db, "notification"> | Prisma.TransactionClient;

async function createNotification(
  client: NotificationClient,
  data: {
    recipientId: string;
    eventType: string;
    resourceId: string;
    messageKey: string;
    parameters?: Prisma.InputJsonValue;
  },
) {
  const deduplicationKey = `${data.eventType}:${data.resourceId}:${data.recipientId}`;
  const existing = await client.notification.findFirst({ where: { deduplicationKey } });
  if (existing) return existing;
  return client.notification.create({
    data: {
      ...data,
      deduplicationKey,
    },
  });
}

export async function createBuilding(formData: FormData) {
  const { session } = await requireRole(Role.OWNER);
  const name = text(formData, "name");
  const address = text(formData, "address");
  const area = text(formData, "area");
  const unitLabel = text(formData, "unitLabel", false);
  const unitType = enumValue(text(formData, "unitType", false) || UnitType.APARTMENT, Object.values(UnitType), "unitType");
  const canManageUnitRequests = formData.get("canManageUnitRequests") === "on";
  const joinCode = randomBytes(5).toString("hex").toUpperCase();

  await db.building.create({
    data: {
      ownerId: session.user.id,
      name,
      address,
      area,
      joinCode,
      canManageUnitRequests,
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

export async function requestUnitOwnership(formData: FormData) {
  const { session } = await requireRole(Role.OWNER);
  const joinCode = text(formData, "joinCode").toUpperCase();
  const unitLabel = text(formData, "unitLabel");
  const building = await db.building.findFirst({
    where: { joinCode, archivedAt: null },
    include: { units: { where: { label: unitLabel, archivedAt: null }, include: { owner: true } } },
  });
  if (!building) return dashboard(formData, "ownership-building-not-found");
  const unit = building.units[0];
  if (!unit) return dashboard(formData, "ownership-unit-not-found");
  if (unit.ownerId === session.user.id) return dashboard(formData, "ownership-already-owned");
  const pending = await db.unitOwnershipRequest.findFirst({ where: { applicantId: session.user.id, unitId: unit.id, state: MembershipState.PENDING } });
  if (pending) return dashboard(formData, "ownership-request-exists");
  const request = await db.unitOwnershipRequest.create({ data: { applicantId: session.user.id, unitId: unit.id } });
  await createNotification(db, {
    recipientId: building.ownerId,
    eventType: "UNIT_OWNERSHIP_REQUESTED",
    resourceId: request.id,
    messageKey: "unitOwnershipRequested",
    parameters: { actorName: session.user.name, unitLabel: unit.label, buildingName: building.name },
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "ownership-requested");
}

export async function decideUnitOwnership(formData: FormData) {
  const { session, role } = await requireRole(Role.OWNER, Role.SUPER_ADMIN);
  const requestId = text(formData, "ownershipRequestId");
  const decision = enumValue(text(formData, "decision"), [MembershipState.APPROVED, MembershipState.REJECTED] as const, "decision");
  const request = await db.unitOwnershipRequest.findUnique({ where: { id: requestId }, include: { unit: { include: { building: true } } } });
  if (!request || (role !== Role.SUPER_ADMIN && request.unit.building.ownerId !== session.user.id) || request.state !== MembershipState.PENDING) throw new Error("FORBIDDEN");
  await db.$transaction(async (tx) => {
    await tx.unitOwnershipRequest.update({ where: { id: requestId }, data: { state: decision, decidedById: session.user.id, decisionTime: new Date() } });
    if (decision === MembershipState.APPROVED) {
      await tx.unit.update({ where: { id: request.unitId }, data: { ownerId: request.applicantId } });
      await tx.unitOwnershipRequest.updateMany({ where: { unitId: request.unitId, id: { not: requestId }, state: MembershipState.PENDING }, data: { state: MembershipState.REJECTED, decidedById: session.user.id, decisionTime: new Date(), decisionReason: "وحدة مرتبطة بمالك آخر" } });
    }
    await createNotification(tx, {
      recipientId: request.applicantId,
      eventType: "UNIT_OWNERSHIP_DECIDED",
      resourceId: requestId,
      messageKey: "unitOwnershipDecided",
      parameters: { decision },
    });
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "ownership-decided");
}

export async function requestMembership(formData: FormData) {
  const { session } = await requireRole(Role.TENANT);
  const joinCode = text(formData, "joinCode").toUpperCase();
  const unitLabel = text(formData, "unitLabel");
  const building = await db.building.findFirst({
    where: { joinCode, archivedAt: null },
    include: { units: { where: { label: unitLabel, archivedAt: null } } },
  });
  if (!building) {
    dashboard(formData, "membership-building-not-found");
    return;
  }
  const unit = building.units[0];
  if (!unit) {
    dashboard(formData, "membership-unit-not-found");
  }
  const existing = await db.membershipRequest.findFirst({
    where: { tenantId: session.user.id, unitId: unit.id, state: { in: [MembershipState.PENDING, MembershipState.APPROVED] } },
  });
  if (existing) {
    dashboard(formData, "membership-exists");
  }
  const membership = await db.membershipRequest.create({ data: { tenantId: session.user.id, unitId: unit.id } });
  await createNotification(db, {
    recipientId: unit.ownerId,
    eventType: "MEMBERSHIP_REQUESTED",
    resourceId: membership.id,
    messageKey: "membershipRequested",
    parameters: { actorName: session.user.name, unitLabel: unit.label },
  });
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
  const tenancy = await db.tenancy.findFirst({ where: { id: unitId, tenantId: session.user.id, endedAt: null }, include: { unit: true } });
  if (!tenancy) throw new Error("TENANCY_NOT_FOUND");
  const category = await db.serviceCategory.findFirst({ where: { id: categoryId, isActive: true } });
  if (!category) throw new Error("CATEGORY_NOT_FOUND");
  const request = await db.maintenanceRequest.create({
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
  await createNotification(db, {
    recipientId: tenancy.unit.ownerId,
    eventType: "MAINTENANCE_REQUEST_CREATED",
    resourceId: request.id,
    messageKey: "maintenanceRequestCreated",
    parameters: { requestTitle: request.title, actorName: session.user.name },
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "request-created");
}

export async function createProcurement(formData: FormData) {
  const { session } = await requireRole(Role.OWNER);
  const requestId = text(formData, "requestId");
  const mode = enumValue(text(formData, "procurementMode", false) || "INVITED", ["INVITED", "PUBLIC"] as const, "procurementMode");
  const workerIds = [...new Set(formData.getAll("workerIds").filter((value): value is string => typeof value === "string" && Boolean(value.trim())))];
  if (mode === "INVITED" && !workerIds.length) throw new Error("WORKERS_REQUIRED");
  const request = await db.maintenanceRequest.findUnique({
    where: { id: requestId },
    include: { unit: { include: { building: true } }, category: true, procurements: { where: { state: "OPEN" } } },
  });
  if (!request || request.unit.ownerId !== session.user.id) throw new Error("FORBIDDEN");
  if (request.status !== RequestStatus.SUBMITTED && request.status !== RequestStatus.PROCUREMENT) throw new Error("INVALID_REQUEST_STATUS");
  if (request.procurements.length) throw new Error("PROCUREMENT_ALREADY_OPEN");

  const workers = await db.workerProfile.findMany({
    where: {
      ...(mode === "INVITED" ? { id: { in: workerIds } } : {}),
      status: ProfileStatus.APPROVED,
      categories: { some: { categoryId: request.categoryId } },
    },
    select: { id: true },
  });
  if (mode === "INVITED" && workers.length !== workerIds.length) throw new Error("INVALID_WORKER_SELECTION");
  const deadline = optionalDate(formData, "deadline");
  if (deadline) deadline.setHours(23, 59, 59, 999);
  if (deadline && deadline <= new Date()) throw new Error("INVALID_DEADLINE");
  const budgetText = text(formData, "budget", false);
  const budget = budgetText ? Number(budgetText) : null;
  if (budget !== null && (!Number.isInteger(budget) || budget < 0)) throw new Error("INVALID_BUDGET");

  await db.$transaction(async (tx) => {
    const roundNumber = (await tx.procurement.aggregate({ where: { requestId }, _max: { roundNumber: true } }))._max.roundNumber ?? 0;
    const procurement = await tx.procurement.create({
      data: {
        requestId,
        roundNumber: roundNumber + 1,
        mode,
        state: "OPEN",
        sanitizedBrief: text(formData, "brief", false) || request.description,
        categorySnapshot: request.category.code,
        areaSnapshot: request.unit.building.area,
        deadline,
        budget,
        openedAt: new Date(),
        invitations: { create: workers.map((worker) => ({ workerId: worker.id })) },
      },
    });
    if (request.status === RequestStatus.SUBMITTED) {
      await tx.maintenanceRequest.update({ where: { id: requestId }, data: { status: RequestStatus.PROCUREMENT, version: { increment: 1 } } });
    }
    await Promise.all(
      workers.map((worker) =>
        createNotification(tx, {
          recipientId: worker.id,
          eventType: "TENDER_INVITATION_CREATED",
          resourceId: procurement.id,
          messageKey: "tenderInvitationReceived",
          parameters: { requestTitle: request.title, actorName: session.user.name },
        }),
      ),
    );
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "procurement-created");
}

export async function submitOffer(formData: FormData) {
  const { session } = await requireRole(Role.WORKER);
  const procurementId = text(formData, "procurementId");
  const totalAgorot = shekelAmount(formData, "amountShekels");
  const scopeInclusions = text(formData, "scopeInclusions");
  const assumptions = text(formData, "assumptions", false) || null;
  const duration = text(formData, "duration", false) || null;
  const proposedDate = optionalDate(formData, "proposedDate");
  const validUntil = endOfDay(optionalDate(formData, "validUntil"));
  if (!validUntil || validUntil <= new Date()) throw new Error("INVALID_VALID_UNTIL");

  const procurement = await db.procurement.findUnique({
    where: { id: procurementId },
    include: { request: { include: { unit: true } }, invitations: { where: { workerId: session.user.id } } },
  });
  if (!procurement || procurement.state !== "OPEN" || (procurement.mode !== "PUBLIC" && !procurement.invitations.length)) throw new Error("PROCUREMENT_NOT_AVAILABLE");
  const profile = await db.workerProfile.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!profile || profile.status !== ProfileStatus.APPROVED) throw new Error("PROFILE_NOT_APPROVED");

  await db.$transaction(async (tx) => {
    const existing = await tx.offer.findUnique({ where: { procurementId_workerId: { procurementId, workerId: session.user.id } } });
    await tx.offer.upsert({
      where: { procurementId_workerId: { procurementId, workerId: session.user.id } },
      create: { procurementId, workerId: session.user.id, totalAgorot, scopeInclusions, assumptions, proposedDate, duration, validUntil },
      update: { totalAgorot, scopeInclusions, assumptions, proposedDate, duration, validUntil, state: "SUBMITTED", version: { increment: 1 } },
    });
    await tx.tenderInvitation.updateMany({
      where: { procurementId, workerId: session.user.id },
      data: { response: "OFFERED" },
    });
    if (!existing) {
      await createNotification(tx, {
        recipientId: procurement.request.unit.ownerId,
        eventType: "OFFER_SUBMITTED",
        resourceId: procurementId,
        messageKey: "workerOfferSubmitted",
        parameters: { requestTitle: procurement.request.title },
      });
    }
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "offer-submitted");
}

export async function respondTenderInvitation(formData: FormData) {
  const { session } = await requireRole(Role.WORKER);
  const procurementId = text(formData, "procurementId");
  const response = enumValue(text(formData, "response"), ["DECLINED"] as const, "response");
  const invitation = await db.tenderInvitation.findUnique({
    where: { procurementId_workerId: { procurementId, workerId: session.user.id } },
    include: { procurement: true },
  });
  if (!invitation || invitation.procurement.state !== "OPEN") throw new Error("INVITATION_NOT_AVAILABLE");
  if (invitation.response === "OFFERED") throw new Error("OFFER_ALREADY_SUBMITTED");
  await db.tenderInvitation.update({ where: { id: invitation.id }, data: { response } });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "invitation-answered");
}

export async function sendOfferMessage(formData: FormData) {
  const { session, role } = await requireRole(Role.OWNER, Role.WORKER);
  const offerId = text(formData, "offerId");
  const message = text(formData, "message");
  const offer = await db.offer.findUnique({
    where: { id: offerId },
    include: { worker: { include: { user: true } }, procurement: { include: { request: { include: { unit: true } } } } },
  });
  if (!offer || offer.procurement.state !== "OPEN") throw new Error("OFFER_NOT_AVAILABLE");
  const isOwner = offer.procurement.request.unit.ownerId === session.user.id;
  const isWorker = offer.workerId === session.user.id;
  if ((role === Role.OWNER && !isOwner) || (role === Role.WORKER && !isWorker)) throw new Error("FORBIDDEN");
  const recipientId = isOwner ? offer.workerId : offer.procurement.request.unit.ownerId;
  await db.$transaction(async (tx) => {
    await tx.offerMessage.create({ data: { offerId, authorId: session.user.id, message } });
    await createNotification(tx, {
      recipientId,
      eventType: "OFFER_MESSAGE_RECEIVED",
      resourceId: offerId,
      messageKey: "offerMessageReceived",
      parameters: { actorName: session.user.name },
    });
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "offer-message-sent");
}

export async function awardOffer(formData: FormData) {
  const { session } = await requireRole(Role.OWNER);
  const offerId = text(formData, "offerId");
  const offer = await db.offer.findUnique({
    where: { id: offerId },
    include: {
      worker: { include: { user: true } },
      procurement: { include: { request: { include: { unit: { include: { building: true } } } } } },
    },
  });
  if (!offer || offer.procurement.request.unit.ownerId !== session.user.id) throw new Error("FORBIDDEN");
  if (offer.state !== "SUBMITTED" || offer.procurement.state !== "OPEN") throw new Error("OFFER_NOT_AVAILABLE");

  await db.$transaction(async (tx) => {
    const current = await tx.procurement.findUnique({
      where: { id: offer.procurementId },
      include: { request: { include: { unit: { include: { building: true } } } } },
    });
    if (!current || current.state !== "OPEN") throw new Error("PROCUREMENT_NOT_AVAILABLE");
    await tx.offer.update({ where: { id: offer.id }, data: { state: "ACCEPTED" } });
    await tx.offer.updateMany({ where: { procurementId: offer.procurementId, id: { not: offer.id }, state: "SUBMITTED" }, data: { state: "NOT_SELECTED" } });
    await tx.procurement.update({ where: { id: offer.procurementId }, data: { state: "AWARDED", awardedAt: new Date(), closedAt: new Date() } });
    const requestUpdate = await tx.maintenanceRequest.updateMany({
      where: { id: current.requestId, status: { in: [RequestStatus.SUBMITTED, RequestStatus.PROCUREMENT] } },
      data: { status: RequestStatus.ASSIGNED, version: { increment: 1 } },
    });
    if (!requestUpdate.count) throw new Error("REQUEST_CHANGED");
    const workOrder = await tx.workOrder.create({
      data: {
        requestId: current.requestId,
        acceptedOfferId: offer.id,
        workerId: offer.workerId,
        amountAgorot: offer.totalAgorot,
        currency: offer.currency,
        scope: offer.scopeInclusions,
        schedule: offer.proposedDate?.toISOString() ?? null,
        duration: offer.duration,
        offerVersion: offer.version,
        locationSnapshot: `${current.request.unit.building.name} · ${current.request.unit.label} · ${current.request.unit.building.address}`,
      },
    });
    await createNotification(tx, {
      recipientId: offer.workerId,
      eventType: "WORK_ORDER_AWARDED",
      resourceId: workOrder.id,
      messageKey: "workOrderAwarded",
      parameters: { requestTitle: current.request.title },
    });
    await createNotification(tx, {
      recipientId: current.request.tenantId,
      eventType: "WORK_ORDER_AWARDED",
      resourceId: workOrder.id,
      messageKey: "workerAssigned",
      parameters: { requestTitle: current.request.title },
    });
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "offer-awarded");
}

export async function submitTenantFeedback(formData: FormData) {
  const { session } = await requireRole(Role.TENANT);
  const workOrderId = text(formData, "workOrderId");
  const rating = integerValue(formData, "rating", { min: 1, max: 5 });
  const comment = text(formData, "comment", false) || null;
  const workOrder = await db.workOrder.findUnique({
    where: { id: workOrderId },
    include: { request: true, tenantFeedback: true },
  });
  if (!workOrder || workOrder.request.tenantId !== session.user.id) throw new Error("FORBIDDEN");
  if (!([RequestStatus.AWAITING_TENANT_CONFIRMATION, RequestStatus.TENANT_CONFIRMED, RequestStatus.CLOSED] as RequestStatus[]).includes(workOrder.request.status)) {
    throw new Error("FEEDBACK_NOT_AVAILABLE");
  }
  if (workOrder.tenantFeedback) throw new Error("FEEDBACK_EXISTS");
  await db.$transaction(async (tx) => {
    await tx.tenantFeedback.create({ data: { workOrderId, tenantId: session.user.id, workerId: workOrder.workerId, rating, comment } });
    if (workOrder.request.status === RequestStatus.AWAITING_TENANT_CONFIRMATION) {
      await tx.maintenanceRequest.updateMany({
        where: { id: workOrder.requestId, version: workOrder.request.version },
        data: { status: RequestStatus.TENANT_CONFIRMED, version: { increment: 1 } },
      });
    }
    await createNotification(tx, {
      recipientId: workOrder.workerId,
      eventType: "TENANT_FEEDBACK_SUBMITTED",
      resourceId: workOrderId,
      messageKey: "tenantFeedbackReceived",
      parameters: { rating },
    });
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "feedback-submitted");
}

export async function submitOwnerFeedback(formData: FormData) {
  const { session } = await requireRole(Role.OWNER);
  const workOrderId = text(formData, "workOrderId");
  const rating = integerValue(formData, "rating", { min: 1, max: 5 });
  const comment = text(formData, "comment", false) || null;
  const workOrder = await db.workOrder.findUnique({
    where: { id: workOrderId },
    include: { request: { include: { unit: true } }, ownerFeedback: true },
  });
  if (!workOrder || workOrder.request.unit.ownerId !== session.user.id) throw new Error("FORBIDDEN");
  if (workOrder.request.status !== RequestStatus.CLOSED) throw new Error("FEEDBACK_NOT_AVAILABLE");
  if (workOrder.ownerFeedback) throw new Error("FEEDBACK_EXISTS");
  await db.$transaction(async (tx) => {
    await tx.ownerFeedback.create({
      data: { workOrderId, ownerId: session.user.id, workerId: workOrder.workerId, rating, comment },
    });
    await createNotification(tx, {
      recipientId: workOrder.workerId,
      eventType: "OWNER_FEEDBACK_SUBMITTED",
      resourceId: workOrderId,
      messageKey: "ownerFeedbackReceived",
      parameters: { rating },
    });
  });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "feedback-submitted");
}

export async function listNotifications(limit = 50) {
  const session = await requireSession();
  return db.notification.findMany({
    where: { recipientId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

export async function markNotificationRead(formData: FormData) {
  const session = await requireSession();
  const notificationId = text(formData, "notificationId");
  await db.notification.updateMany({ where: { id: notificationId, recipientId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath(`/${localeFrom(formData)}/dashboard`);
  dashboard(formData, "notification-read");
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
  await db.$transaction(async (tx) => {
    const result = await tx.maintenanceRequest.updateMany({
      where: { id: request.id, version: request.version },
      data: { status: nextStatus, version: { increment: 1 } },
    });
    if (!result.count) throw new Error("REQUEST_CHANGED");
    if (nextStatus === RequestStatus.AWAITING_TENANT_CONFIRMATION) {
      await createNotification(tx, {
        recipientId: request.tenantId,
        eventType: "WORK_COMPLETION_READY",
        resourceId: request.id,
        messageKey: "workCompletionReady",
        parameters: { requestTitle: request.title },
      });
    }
  });
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
