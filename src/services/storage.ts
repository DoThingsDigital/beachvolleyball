import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Dokumentenspeicher (Rechnungs-PDFs). v1: lokales Dateisystem;
// S3-kompatibler Speicher (Hetzner/R2, NF6) kommt mit dem Staging-Setup –
// gleiche Schnittstelle, anderer Treiber.

function baseDir(): string {
  return process.env.INVOICE_STORAGE_DIR ?? path.join(process.cwd(), "storage", "invoices");
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Speichert ein PDF unter einem eindeutigen Schlüssel; existiert der
 *  Schlüssel bereits, wird NICHT überschrieben (Rechnungen sind unveränderlich). */
export async function storeInvoicePdf(
  key: string,
  buffer: Buffer,
): Promise<{ pdfKey: string; pdfSha256: string }> {
  const filePath = path.join(baseDir(), key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer, { flag: "wx" });
  return { pdfKey: key, pdfSha256: sha256(buffer) };
}

export function readInvoicePdf(key: string): Promise<Buffer> {
  return readFile(path.join(baseDir(), key));
}
