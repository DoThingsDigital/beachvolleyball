import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { findCustomers } from "@/src/db/customers";

export default async function KundenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const customers = await findCustomers(staff.ctx, params.q || undefined);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Kunden</h1>

      <form className="flex items-end gap-2" method="get">
        <div className="flex flex-col gap-1">
          <label htmlFor="kunden-q" className="text-sm">
            Suche (Name/E-Mail)
          </label>
          <Input id="kunden-q" name="q" defaultValue={params.q ?? ""} className="w-64" />
        </div>
        <Button type="submit" size="sm" variant="outline">
          Suchen
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b font-medium">
              <th className="p-2">E-Mail</th>
              <th className="p-2">Name</th>
              <th className="p-2">Rolle</th>
              <th className="p-2">Seit</th>
              <th className="p-2">Hinweise</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((m) => (
              <tr key={m.id} className="hover:bg-accent/50 border-b">
                <td className="p-2">
                  <Link
                    href={`/admin/kunden/${m.user.id}`}
                    className="font-medium underline"
                  >
                    {m.user.email}
                  </Link>
                </td>
                <td className="p-2">{m.user.name ?? "–"}</td>
                <td className="p-2">{m.role}</td>
                <td className="p-2">{formatDate(m.user.createdAt)}</td>
                <td className="p-2">
                  {m.user.sepaBlocked ? "SEPA gesperrt" : ""}
                  {m.user.anonymizedAt ? " anonymisiert" : ""}
                </td>
              </tr>
            ))}
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-foreground p-4">
                  Keine Kunden gefunden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
