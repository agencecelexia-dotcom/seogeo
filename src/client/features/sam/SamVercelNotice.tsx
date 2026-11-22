import { Link } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { GateCard } from "@/client/components/GateCard";
import { Button } from "@/client/components/ui/button";

export function SamVercelNotice() {
  return (
    <GateCard
      icon={Brain}
      tone="warning"
      title="Utiliser votre assistant via MCP"
      description={
        <p>
          L’agent SAM intégré n’est pas disponible dans cette version Vercel.
          Connectez Codex, Claude ou votre autre assistant au MCP privé pour
          utiliser les outils SEO, les rapports et les données de vos sites.
        </p>
      }
      actions={
        <Button nativeButton={false} render={<Link to="/ai" />}>
          Configurer le MCP
        </Button>
      }
    />
  );
}
