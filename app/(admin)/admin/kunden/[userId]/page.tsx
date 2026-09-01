import Link from "next/link";
import { notFound } from "next/navigation";

import { formatCents, formatDate, formatWeekday } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { findCustomerDetail } from "@/src/db/customers";

import { ORDER_STATUS_LABELS } from "../../bestellungen/status-labels";
import { CancelSubscriptionForm, NotesForm } from "./customer-forms";

export default async function KundenDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const staff = await requireStaff();
  const { userId } = await params;
  const membership = await findCustomerDetail(staff.ctx, userId);
  if (!membership) notFound();
  const user = membership.user;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/admin/kunden" className="text-muted-foreground text-sm underline">
          ← Alle Kunden
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {user.name ?? user.email}
        </h1>
        <p className="text-muted-foreground text-sm">
          {user.email}
          {user.phone ? ` · ${user.phone}` : ""} · Rolle {membership.role} ·
          Kunde seit {formatDate(user.createdAt)}
          {user.sepaBlocked ? " · SEPA GESPERRT" : ""}
        </p>
        {user.billingStreet ? (
          <p className="text-muted-foreground text-sm">
            Rechnungsadresse: {user.billingStreet}, {user.billingZip}{" "}
            {user.billingCity}, {user.billingCountry}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Keine Rechnungsadresse hinterlegt.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Dauerplätze</h2>
        {user.subscriptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Keine Dauerplätze.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {user.subscriptions.map((sub) => (
              <li key={sub.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {sub.court.name} · {formatWeekday(sub.weekday)} {sub.startTime}{" "}
                  Uhr ({sub.durationMin} min) · {sub.season.name}
                </p>
                <p className="text-muted-foreground mt-1">
                  {formatCents(sub.totalCents)} · Status {sub.status}
                  {sub.cancelReason ? ` (${sub.cancelReason})` : ""}
                </p>
                {sub.status === "ACTIVE" || sub.status === "PENDING" ? (
                  <CancelSubscriptionForm userId={user.id} subscriptionId={sub.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Bestellungen</h2>
        {user.orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">Keine Bestellungen.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {user.orders.map((order) => (
              <li key={order.id} className="flex justify-between rounded-md border p-2">
                <Link
                  href={`/admin/bestellungen/${order.id}`}
                  className="underline"
                >
                  {order.number}
                </Link>
                <span>
                  {formatCents(order.totalCents)} ·{" "}
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">SEPA-Mandate</h2>
        {user.sepaMandates.length === 0 ? (
          <p className="text-muted-foreground text-sm">Keine Mandate.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {user.sepaMandates.map((m) => (
              <li key={m.id} className="flex justify-between rounded-md border p-2">
                <span>
                  {m.mandateRef} · IBAN ····{m.ibanLast4}
                </span>
                <span>
                  {m.status} · {formatDate(m.signedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NotesForm userId={user.id} notes={user.notes ?? ""} />
    </div>
  );
}
