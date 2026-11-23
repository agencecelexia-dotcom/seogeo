import { createFileRoute } from "@tanstack/react-router";
import { seogeoPublicPage } from "@/server/features/public-pages/seogeo";

export const Route = createFileRoute("/privacy")({
  server: { handlers: { GET: () => seogeoPublicPage("privacy") } },
});
