import { PrismaClient, Role } from "@prisma/client";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "Demo Admin";
const authUrl = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");

if (!email || !password) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
}

const db = new PrismaClient();

try {
  let user = await db.user.findUnique({ where: { email } });

  if (!user) {
    const response = await fetch(`${authUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: authUrl },
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      throw new Error(`Could not create admin account (${response.status}): ${await response.text()}`);
    }

    user = await db.user.findUnique({ where: { email } });
  }

  if (!user) throw new Error("Admin user was not created");
  await db.user.update({ where: { id: user.id }, data: { role: Role.SUPER_ADMIN, isActive: true } });
  console.log(`Provisioned SUPER_ADMIN: ${email}`);
} finally {
  await db.$disconnect();
}
