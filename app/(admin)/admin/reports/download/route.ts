import { NextResponse } from "next/server";

import { requireStaff } from "@/src/auth/guards";
import { DomainError } from "@/src/domain/errors";
import {
  auslastungCsv,
  buildAuslastungReport,
  buildUmsatzReport,
  buildVereinsnutzungReport,
  umsatzCsv,
  vereinsnutzungCsv,
  vereinsnutzungPdf,
  type OccupancyGroupBy,
} from "@/src/services/reports";

// Report-Downloads (Tickets 6.1–6.3): CSV/PDF per Route Handler
// (Konvention: Route Handler nur für Webhooks und Downloads).

const GROUPS: OccupancyGroupBy[] = ["day", "weekday", "court", "hour"];

export async function GET(req: Request): Promise<Response> {
  const staff = await requireStaff();
  const url = new URL(req.url);
  const report = url.searchParams.get("report") ?? "";
  const venueId = url.searchParams.get("venue") ?? "";
  const dateFrom = url.searchParams.get("von") ?? "";
  const dateTo = url.searchParams.get("bis") ?? "";

  try {
    if (report === "vereinsnutzung") {
      if (url.searchParams.get("format") === "pdf") {
        const { buffer, filename } = await vereinsnutzungPdf(staff.ctx, {
          venueId,
          dateFrom,
          dateTo,
        });
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }
      const data = await buildVereinsnutzungReport(staff.ctx, {
        venueId,
        dateFrom,
        dateTo,
      });
      return csvResponse(
        vereinsnutzungCsv(data),
        `Vereinsnutzung_${dateFrom}_${dateTo}.csv`,
      );
    }

    if (report === "auslastung") {
      const groupParam = url.searchParams.get("gruppierung") ?? "day";
      const groupBy = GROUPS.includes(groupParam as OccupancyGroupBy)
        ? (groupParam as OccupancyGroupBy)
        : "day";
      const data = await buildAuslastungReport(staff.ctx, {
        venueId,
        dateFrom,
        dateTo,
        groupBy,
      });
      return csvResponse(
        auslastungCsv(data),
        `Auslastung_${groupBy}_${dateFrom}_${dateTo}.csv`,
      );
    }

    if (report === "umsatz") {
      const data = await buildUmsatzReport(staff.ctx, {
        venueId,
        dateFrom,
        dateTo,
      });
      return csvResponse(umsatzCsv(data), `Umsatz_${dateFrom}_${dateTo}.csv`);
    }

    return NextResponse.json({ error: "Unbekannter Report." }, { status: 400 });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
