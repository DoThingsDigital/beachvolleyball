import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

// Vereinsnutzungs-Report v1 (Ticket 6.3, L3): Sportamt-tauglicher Export.
// Alle Werte kommen vorformatiert aus dem Service; die abgedruckten
// Definitionen sind Teil des Berichts (DoD).

export type VereinsnutzungPdfData = {
  venueName: string;
  issuerName: string;
  periodFormatted: string;
  generatedAtFormatted: string;
  rows: { label: string; hours: string }[];
  quotas: { label: string; value: string }[];
  definitions: string[];
};

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#333", marginBottom: 16 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingVertical: 4,
  },
  headRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#111",
    fontFamily: "Helvetica-Bold",
  },
  colLabel: { flex: 5 },
  colValue: { flex: 2, textAlign: "right" },
  definition: { fontSize: 9, color: "#333", marginBottom: 3 },
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

export function VereinsnutzungPdf({ data }: { data: VereinsnutzungPdfData }) {
  return (
    <Document
      title={`Vereinsnutzung ${data.periodFormatted}`}
      author={data.issuerName}
      creator="dtd-booking"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Vereinsnutzungs-Report</Text>
        <Text style={styles.subtitle}>
          {data.venueName} · Zeitraum {data.periodFormatted} · erstellt am{" "}
          {data.generatedAtFormatted}
        </Text>

        <Text style={styles.sectionTitle}>Feldstunden</Text>
        <View>
          <View style={[styles.row, styles.headRow]}>
            <Text style={styles.colLabel}>Kennzahl</Text>
            <Text style={styles.colValue}>Feldstunden</Text>
          </View>
          {data.rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.colLabel}>{row.label}</Text>
              <Text style={styles.colValue}>{row.hours}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Quoten</Text>
        <View>
          {data.quotas.map((q) => (
            <View key={q.label} style={styles.row}>
              <Text style={styles.colLabel}>{q.label}</Text>
              <Text style={styles.colValue}>{q.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Definitionen</Text>
        <View>
          {data.definitions.map((d) => (
            <Text key={d} style={styles.definition}>
              • {d}
            </Text>
          ))}
        </View>

        <Text style={styles.footer}>
          {data.issuerName} · maschinell erstellt mit dtd-booking · Basis:
          Belegungsdaten zum Erstellzeitpunkt
        </Text>
      </Page>
    </Document>
  );
}
