#!/bin/sh
# Läuft nur beim ersten Start des Volumes (docker-entrypoint-initdb.d).
# Legt die Test-Datenbank für Integrationstests an (src/services/, Sprint 1+).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ${POSTGRES_DB}_test OWNER $POSTGRES_USER;
EOSQL
