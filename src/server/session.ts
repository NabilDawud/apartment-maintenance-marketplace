import { headers } from "next/headers";
import { auth } from "@/server/auth";
import type { Role } from "@prisma/client";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export function getSessionRole(session: Session): Role | null {
  const role = (session.user as typeof session.user & { role?: Role | null }).role;
  return role ?? null;
}

export async function requireRole(...roles: Role[]) {
  const session = await requireSession();
  const role = getSessionRole(session);
  if (!role || !roles.includes(role)) {
    throw new Error("FORBIDDEN");
  }
  return { session, role };
}
