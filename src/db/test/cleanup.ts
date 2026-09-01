import { prisma } from "../client";

// Gemeinsames Aufräumen für Integrationstests (nur Test-DB!):
// FK-sichere Reihenfolge, damit jede Testdatei mit leeren Fachtabellen startet.
export async function cleanupTestDb() {
  await prisma.booking.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.block.deleteMany({});
  await prisma.refund.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.invoiceSequence.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.priceRule.deleteMany({});
  await prisma.clubMembership.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.season.deleteMany({});
  await prisma.club.deleteMany({});
  await prisma.venue.deleteMany({});
  await prisma.legalEntity.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.organisation.deleteMany({});
  await prisma.emailLog.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { startsWith: "int-test-" } } });
}
