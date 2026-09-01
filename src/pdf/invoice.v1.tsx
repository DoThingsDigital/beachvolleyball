import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

// Rechnungs-Layout v1 (Ticket 3.1, H1/H5): Pflichtangaben § 14 UStG.
// Alle Werte kommen vorformatiert aus dem Service (Snapshots) – das Layout
// rechnet nichts und bleibt damit reproduzierbar.

export type InvoicePdfData = {
  number: string;
  type: "INVOICE" | "CREDIT_NOTE";
  issueDateFormatted: string;
  servicePeriodFormatted: string;
  orderNumber: string;
  relatedInvoiceNumber?: string;
  issuer: {
    name: string;
    legalForm: string;
    street: string;
    zip: string;
    city: string;
    taxNumber?: string | null;
    vatId?: string | null;
    email: string;
    smallBusiness: boolean;
  };
  recipient: {
    name: string;
    street: string;
    zip: string;
    city: string;
    country: string;
  };
  lines: {
    description: string;
    quantity: number;
    netFormatted: string;
    taxRateLabel: string;
    grossFormatted: string;
  }[];
  totals: {
    netFormatted: string;
    taxFormatted: string;
    grossFormatted: string;
    taxRateLabel: string;
  };
  paymentNote: string;
};

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  issuerLine: { fontSize: 8, color: "#555", marginBottom: 4 },
  recipient: { marginTop: 12, marginBottom: 24 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  metaBlock: { fontSize: 9, color: "#333" },
  table: { marginTop: 8 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 4 },
  headRow: { borderBottomWidth: 1, borderBottomColor: "#111", fontFamily: "Helvetica-Bold" },
  colDesc: { flex: 5 },
  colQty: { flex: 1, textAlign: "right" },
  colNet: { flex: 2, textAlign: "right" },
  colTax: { flex: 1.5, textAlign: "right" },
  colGross: { flex: 2, textAlign: "right" },
  totals: { marginTop: 8, alignItems: "flex-end" },
  totalLine: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 2 },
  totalStrong: { fontFamily: "Helvetica-Bold", borderTopWidth: 1, borderTopColor: "#111", marginTop: 2, paddingTop: 4 },
  note: { marginTop: 24, fontSize: 9, color: "#333" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#666",
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    paddingTop: 6,
  },
});

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const title = data.type === "CREDIT_NOTE" ? "Gutschrift" : "Rechnung";
  return (
    <Document
      title={`${title} ${data.number}`}
      author={data.issuer.name}
      creator="dtd-booking"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.issuerLine}>
          {data.issuer.name} · {data.issuer.street} · {data.issuer.zip}{" "}
          {data.issuer.city}
        </Text>
        <View style={styles.recipient}>
          <Text>{data.recipient.name}</Text>
          <Text>{data.recipient.street}</Text>
          <Text>
            {data.recipient.zip} {data.recipient.city}
            {data.recipient.country !== "DE" ? `, ${data.recipient.country}` : ""}
          </Text>
        </View>

        <Text style={styles.title}>
          {title} {data.number}
        </Text>
        <View style={styles.meta}>
          <View style={styles.metaBlock}>
            <Text>Rechnungsdatum: {data.issueDateFormatted}</Text>
            <Text>Leistungszeitraum: {data.servicePeriodFormatted}</Text>
            <Text>Bestellung: {data.orderNumber}</Text>
            {data.relatedInvoiceNumber ? (
              <Text>Zur Rechnung: {data.relatedInvoiceNumber}</Text>
            ) : null}
          </View>
          <View style={styles.metaBlock}>
            {data.issuer.taxNumber ? (
              <Text>Steuernummer: {data.issuer.taxNumber}</Text>
            ) : null}
            {data.issuer.vatId ? <Text>USt-IdNr.: {data.issuer.vatId}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={styles.colDesc}>Leistung</Text>
            <Text style={styles.colQty}>Menge</Text>
            <Text style={styles.colNet}>Netto</Text>
            <Text style={styles.colTax}>USt.</Text>
            <Text style={styles.colGross}>Brutto</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colNet}>{line.netFormatted}</Text>
              <Text style={styles.colTax}>{line.taxRateLabel}</Text>
              <Text style={styles.colGross}>{line.grossFormatted}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalLine}>
            <Text>Summe netto</Text>
            <Text>{data.totals.netFormatted}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>Umsatzsteuer {data.totals.taxRateLabel}</Text>
            <Text>{data.totals.taxFormatted}</Text>
          </View>
          <View style={[styles.totalLine, styles.totalStrong]}>
            <Text>Gesamtbetrag</Text>
            <Text>{data.totals.grossFormatted}</Text>
          </View>
        </View>

        {data.issuer.smallBusiness ? (
          <Text style={styles.note}>
            Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.
          </Text>
        ) : null}
        <Text style={styles.note}>{data.paymentNote}</Text>

        <Text style={styles.footer}>
          {data.issuer.name} {data.issuer.legalForm} · {data.issuer.street} ·{" "}
          {data.issuer.zip} {data.issuer.city} · {data.issuer.email}
        </Text>
      </Page>
    </Document>
  );
}
