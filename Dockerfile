# Production-Image (Ticket 0.5): volles Node-Image statt Standalone-Tracing
# (react-pdf/Prisma-Adapter sind Tracing-Stolperfallen; Plattenplatz ist da).
FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build braucht keine erreichbare DB (alle Live-Seiten sind force-dynamic);
# die Dummy-Werte verhindern nur Import-/Init-Fehler zur Buildzeit.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ARG AUTH_SECRET=build-dummy-secret
ENV DATABASE_URL=$DATABASE_URL AUTH_SECRET=$AUTH_SECRET
RUN pnpm prisma generate && pnpm build

ENV NODE_ENV=production
EXPOSE 3000
# Migrationen laufen beim Start in derselben Umgebung wie die App;
# schlägt eine fehl, startet der Container nicht (restart-Loop = Alarm).
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm start"]
