/**
 * Seed default goals and categories for new users.
 * Run: npm run db:seed (after db:migrate)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  "Work",
  "Personal",
  "Newsletters",
  "Promotions",
  "Low-priority",
  "Other",
];

const DEFAULT_GOALS = [
  { title: "Clear inbox", description: "Process and triage emails daily" },
  { title: "Follow up on open loops", description: "Close pending threads" },
];

async function main() {
  console.log("Seed script: default categories and goals are applied per-user during setup.");
  console.log("This script can be extended to seed shared defaults if needed.");
  console.log("Default categories:", DEFAULT_CATEGORIES.join(", "));
  console.log("Default goals:", DEFAULT_GOALS.map((g) => g.title).join(", "));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
