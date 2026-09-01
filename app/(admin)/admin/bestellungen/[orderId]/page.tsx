import Link from "next/link";
import { notFound } from "next/navigation";

import { formatCents, formatDateTime } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { ORDER_STATUS_LABELS } from "../status-labels";
import { RefundForm, ResendInvoiceButton } from "./order-actions";

export default async function AdminBestellungDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const staff = await requireStaff();
  const { orderId } = await params;
  const repos = createRepositories(staff.ctx);
  const order = await repos.orders.findForAdmin(orderId);
  if (!order) notFound();

  const refunded = order.refunds
    .filter((r) => r.status !== "FAILED")
    .reduce((sum, r) => sum + r.amountCents, 0);
  const remaining = order.totalCents - refunded;
  const refundable =
    (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") &&
    remaining > 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/admin/bestellungen" className="text-muted-foreground text-sm underline">
          ← Alle Bestellungen
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          Bestellung {order.number}
        </h1>
        <p className="text-muted-foreground text-sm">
          {formatDateTime(order.createdAt)} · {order.user.email} · Status:{" "}
          <span className="text-foreground font-medium" data-testid="admin-order-status">
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </span>
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Positionen</h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{item.description}</p>
              <p className="text-muted-foreground mt-1">
                Netto {formatCents(item.netCents)} · USt {formatCents(item.taxCents)}{" "}
                · Brutto {formatCents(item.grossCents)}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-right text-sm font-semibold">
          Gesamt {formatCents(order.totalCents)}
          {refunded > 0 ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              · erstattet {formatCents(refunded)}
            </span>
          ) : null}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Zahlungen</h2>
        {order.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Noch keine Zahlung.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {order.payments.map((p) => (
              <li key={p.id} className="flex justify-between rounded-md border p-2">
                <span>
                  {p.method} · {p.providerRef}
                </span>
                <span>
                  {formatCents(p.amountCents)} · {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Rechnungen & Gutschriften</h2>
        {order.invoices.length === 0 ? (
          <p className="text-muted-foreground text-sm">Noch keine Rechnung.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {order.invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <span>
                  {invoice.type === "CREDIT_NOTE" ? "Gutschrift" : "Rechnung"}{" "}
                  <a
                    href={`/admin/bestellungen/rechnung/${invoice.id}`}
                    className="font-medium underline"
                  >
                    {invoice.number}
                  </a>{" "}
                  · {formatCents(invoice.grossCents)}
                </span>
                <ResendInvoiceButton orderId={order.id} invoiceId={invoice.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {order.refunds.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Erstattungen</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {order.refunds.map((r) => (
              <li key={r.id} className="flex justify-between rounded-md border p-2">
                <span>
                  {r.reason}
                  {r.creditNoteInvoice ? ` · ${r.creditNoteInvoice.number}` : ""}
                </span>
                <span>
                  {formatCents(r.amountCents)} · {r.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RefundForm
        orderId={order.id}
        remainingFormatted={formatCents(remaining)}
        disabled={!refundable}
      />
    </div>
  );
}
