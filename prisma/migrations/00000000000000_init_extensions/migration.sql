-- Custom-SQL-Migration (nicht von Prisma generiert).
-- btree_gist wird für das Exclusion-Constraint booking_no_overlap benötigt
-- (docs/02_DATENMODELL.md, "Kritische Constraints"): GiST-Index über
-- "courtId" WITH = zusammen mit tstzrange(...) WITH && geht nur mit btree_gist.
CREATE EXTENSION IF NOT EXISTS btree_gist;
