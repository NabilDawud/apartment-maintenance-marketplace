import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";

export const auth = betterAuth({
    database: prismaAdapter(db, {
        provider: "postgresql", 
    }),
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              role: ["OWNER", "TENANT", "WORKER"].includes(String(user.role)) ? user.role : "TENANT",
            },
          }),
        },
      },
    },
    emailAndPassword: {  
        enabled: true
    },
    // Custom user fields
    user: {
      additionalFields: {
          role: {
              type: "string",
              required: false,
          },
          locale: {
              type: "string",
              required: true,
              defaultValue: "ar",
          },
          isActive: {
              type: "boolean",
              required: true,
              defaultValue: true,
          }
      }
    }
});
