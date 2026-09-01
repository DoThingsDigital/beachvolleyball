import Link from "next/link";

import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

// Audit-Log-Ansicht (Ticket 5.7, K6): wer hat wann was geändert.
// Neueste zuerst, Filter nach Entität; Diff als kompaktes JSON.

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entitaet?: string }>;
}) {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const params = await searchParams;
  const entity = params.entitaet || undefined;

  const [entries, entities] = await Promise.all([
    repos.auditLogs.findManyForAdmin({ entity, take: 100 }),
    repos.auditLogs.listEntities(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Audit-Log</h1>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Entität:</span>
        <Link
          href="/admin/audit"
          className={
            "rounded-full border px-3 py-1 font-semibold " +
            (!entity ? "bg-primary text-primary-foreground border-primary" : "bg-card")
          }
        >
          Alle
        </Link>
        {entities.map(({ entity: e }) => (
          <Link
            key={e}
            href={`/admin/audit?entitaet=${encodeURIComponent(e)}`}
            className={
              "rounded-full border px-3 py-1 font-semibold " +
              (entity === e
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card")
            }
          >
            {e}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">Keine Einträge.</p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="audit-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <span className="font-semibold">{entry.action}</span>{" "}
                  <span className="text-muted-foreground">
                    · {entry.entity} · {entry.entityId.slice(0, 10)}…
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {entry.actor
                    ? (entry.actor.name ?? entry.actor.email)
                    : "System"}{" "}
                  · {formatDateTime(entry.at)}
                </p>
              </div>
              <details>
                <summary className="text-muted-foreground cursor-pointer text-xs">
                  Details
                </summary>
                <pre className="bg-muted/40 mt-1 overflow-x-auto rounded p-2 text-xs">
                  {JSON.stringify(entry.diff, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        Zeigt die letzten 100 Einträge{entity ? ` für ${entity}` : ""}.
      </p>
    </div>
  );
}
