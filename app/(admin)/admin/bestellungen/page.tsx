import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, formatDateTime } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { getSelectedVenue } from "../_lib/selected-venue";
import { ORDER_STATUS_LABELS } from "./status-labels";

export default async function BestellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  const params = await searchParams;

  const orders = await repos.orders.findManyForAdmin({
    venueId: venue?.id,
    status: params.status || undefined,
    query: params.q || undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Bestellungen</h1>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-q" className="text-sm">
            Suche (Nummer/E-Mail)
          </label>
          <Input
            id="filter-q"
            name="q"
            defaultValue={params.q ?? ""}
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-status" className="text-sm">
            Status
          </label>
          <select
            id="filter-status"
            name="status"
            defaultValue={params.status ?? ""}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">Alle</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" variant="outline">
          Filtern
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b font-medium">
              <th className="p-2">Nummer</th>
              <th className="p-2">Datum</th>
              <th className="p-2">Kunde</th>
              <th className="p-2 text-right">Betrag</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-accent/50 border-b">
                <td className="p-2">
                  <Link
                    href={`/admin/bestellungen/${order.id}`}
                    className="font-medium underline"
                  >
                    {order.number}
                  </Link>
                </td>
                <td className="p-2">{formatDateTime(order.createdAt)}</td>
                <td className="p-2">{order.user.email}</td>
                <td className="p-2 text-right">{formatCents(order.totalCents)}</td>
                <td className="p-2">
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-foreground p-4">
                  Keine Bestellungen gefunden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
