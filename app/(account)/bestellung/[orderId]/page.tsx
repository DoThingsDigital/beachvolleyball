import { redirect } from "next/navigation";

import { formatCents, formatDateTime } from "@/lib/format";
import { auth } from "@/src/auth";
import { createRepositories } from "@/src/db/repositories";
import { getPublicShopContext } from "@/src/services/public-context";

const STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Warten auf Zahlung",
  PROCESSING: "Zahlung wird verarbeitet",
  PAID: "Bezahlt",
  CANCELLED: "Storniert",
  FAILED: "Zahlung fehlgeschlagen",
  PARTIALLY_REFUNDED: "Teilweise erstattet",
  REFUNDED: "Erstattet",
};

export default async function BestellungPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const shop = await getPublicShopContext();
  if (!shop) redirect("/");

  const { orderId } = await params;
  const repos = createRepositories(shop.ctx);
  const order = await repos.orders.findForUser(orderId, session.user.id);
  if (!order) {
    redirect("/konto");
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Bestellung {order.number}</h1>
        <p className="text-muted-foreground text-sm">
          {formatDateTime(order.createdAt)} · Status:{" "}
          <span data-testid="order-status" className="text-foreground font-medium">
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {order.items.map((item) => (
          <li key={item.id} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{item.description}</p>
            <p className="text-muted-foreground mt-1">
              Netto {formatCents(item.netCents)} · USt (
              {(item.taxRateBp / 100).toLocaleString("de-DE")} %){" "}
              {formatCents(item.taxCents)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t pt-3 text-sm">
        <span className="font-medium">Gesamt</span>
        <span className="font-semibold" data-testid="order-total">
          {formatCents(order.totalCents)}
        </span>
      </div>

      {order.status === "AWAITING_PAYMENT" ? (
        <p className="text-muted-foreground text-sm">
          Deine Termine sind reserviert. Die Zahlung (SEPA/Karte) wird gerade
          angebunden – Ticket 2.4.
        </p>
      ) : null}
    </main>
  );
}
