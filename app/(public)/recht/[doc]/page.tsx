import { notFound } from "next/navigation";

import { formatDate } from "@/lib/format";
import { LEGAL_DOCS, type LegalDocKey } from "@/src/content/legal";

// Eine Route für alle Rechtstexte: /recht/agb, /recht/datenschutz, …
export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export default async function RechtstextPage({
  params,
}: {
  params: Promise<{ doc: string }>;
}) {
  const { doc } = await params;
  const legal = LEGAL_DOCS[doc as LegalDocKey];
  if (!legal) notFound();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{legal.title}</h1>
      <p className="text-muted-foreground text-xs">
        Version {legal.version} · Stand {formatDate(new Date(legal.updatedAt))}
      </p>
      <div className="flex flex-col gap-3 text-sm leading-relaxed">
        {legal.body.split("\n\n").map((block, i) =>
          block.startsWith("## ") ? (
            <h2 key={i} className="mt-2 text-lg font-medium">
              {block.slice(3)}
            </h2>
          ) : (
            <p key={i} className="whitespace-pre-line">
              {block}
            </p>
          ),
        )}
      </div>
    </main>
  );
}
