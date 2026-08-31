// Mandanten-Kontext für alle Fachzugriffe (CLAUDE.md Invariante 3):
// Repositories nehmen einen TenantContext; kein Query ohne organisationId.
export type TenantContext = {
  organisationId: string;
};
