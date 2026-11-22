import {
  AI_ENGINE_LABELS,
  aiEngineUsesModelApi,
  type AiEngine,
} from "@/shared/ai-visibility";
import { EngineIcon } from "./EngineIcon";

export function EngineLabel({
  engine,
  label = AI_ENGINE_LABELS[engine],
}: {
  engine: AiEngine;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
      <EngineIcon
        engine={engine}
        className="size-4 shrink-0"
        aria-hidden="true"
      />
      {label}
      {aiEngineUsesModelApi(engine) && (
        <span
          className="rounded border px-1 text-xs text-muted-foreground"
          title="Réponse via l’API du modèle ; elle ne reproduit pas nécessairement l’application grand public."
        >
          API modèle
        </span>
      )}
    </span>
  );
}
