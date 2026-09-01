import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-Server und `next build` nutzen getrennte Verzeichnisse, damit ein
  // Build nie den laufenden Dev-Server zerschießt (CSS-404s / kaputtes HTML).
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
