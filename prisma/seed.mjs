import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const categories = [
  ["PLUMBING", "سباكة", "Plumbing"],
  ["ELECTRICAL", "كهرباء", "Electrical"],
  ["HVAC", "تكييف وتدفئة", "HVAC"],
  ["PAINTING", "دهان", "Painting"],
  ["APPLIANCES", "أجهزة منزلية", "Appliances"],
];

const areas = [
  ["NORTH", "الشمال", "North"],
  ["CENTER", "الوسط", "Center"],
  ["SOUTH", "الجنوب", "South"],
];

for (const [code, nameAr, nameEn] of categories) {
  await db.serviceCategory.upsert({
    where: { code },
    update: { nameAr, nameEn, isActive: true },
    create: { code, nameAr, nameEn, displayOrder: categories.findIndex((item) => item[0] === code) },
  });
}

for (const [code, nameAr, nameEn] of areas) {
  await db.serviceArea.upsert({ where: { code }, update: { nameAr, nameEn, isActive: true }, create: { code, nameAr, nameEn } });
}

console.log(`Seeded ${categories.length} categories and ${areas.length} service areas.`);
await db.$disconnect();
