import { createFileRoute } from "@tanstack/react-router";
import { seogeoPublicPage } from "@/server/features/public-pages/seogeo";

export const Route = createFileRoute("/terms")({
  server: { handlers: { GET: () => seogeoPublicPage("terms") } },
});
