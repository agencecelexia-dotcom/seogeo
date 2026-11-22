import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  aiEngineUsesModelApi,
  type AiTrend,
  type AiTrendMetric,
} from "@/shared/ai-visibility";
import { EngineLabel } from "./EngineLabel";
import { trendSeries, VisibilityTrendChart } from "./VisibilityTrendChart";
import {
  AiQueryError,
  aiTrendQueryOptions,
  DEFAULT_AI_TREND_DAYS,
} from "./shared";

const periods = [
  { value: "7", icon: null, label: "7 j" },
  { value: "28", icon: null, label: "28 j" },
  { value: "90", icon: null, label: "90 j" },
];

const rate = (value: number | null) =>
  value === null ? "—" : `${Math.round(value)}%`;

function notice(trend: AiTrend, collecting: boolean) {
  const { days } = trend;
  switch (trend.comparison) {
    case "incomplete":
      return "Moins de 90 % des réponses prévues ont été collectées sur une période : aucune variation n’est affichée. Un échec de collecte ne compte jamais comme une perte de visibilité.";
    case "scope_changed":
      return "Aucune question et aucun moteur ne disposent de réponses pour le même marché et la même marque sur les deux périodes. Le périmètre a changé : la comparaison est indisponible.";
    case "no_data":
      return collecting
        ? "Collecte des réponses en cours. La visibilité apparaîtra à la fin de l’analyse."
        : `Aucune analyse terminée au cours des ${days} derniers jours.`;
    default:
      return null;
  }
}

/** The trend panel inside the Prompt tracking card, laid out like rank tracking's overview. */
export function VisibilityTrend({
  projectId,
  collecting,
}: {
  projectId: string;
  collecting: boolean;
}) {
  const [days, setDays] = useState(DEFAULT_AI_TREND_DAYS);
  const query = useQuery(aiTrendQueryOptions(projectId, days));
  const trend = query.data;
  const mixedMethods = Boolean(
    trend?.engines.some((row) => aiEngineUsesModelApi(row.engine)) &&
    trend.engines.some((row) => !aiEngineUsesModelApi(row.engine)),
  );
  const message = trend && notice(trend, collecting);
  // Incomplete collection and a changed scope need attention; missing history does not.
  const warning =
    trend?.comparison === "incomplete" || trend?.comparison === "scope_changed";
  return (
    <div className="px-4 pt-2 pb-6">
      <section className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            Visibilité sur le panel observé
          </h2>
          <SegmentedToggle
            showLabels
            items={periods}
            value={String(days)}
            onChange={(next) =>
              setDays(next === "90" ? 90 : next === "28" ? 28 : 7)
            }
          />
        </div>
        {query.isError && (
          <AiQueryError
            error={query.error}
            retry={() => {
              void query.refetch();
            }}
          />
        )}
        {query.isPending && <Skeleton className="h-[220px] w-full" />}
        {trend && (
          <>
            {trend.current.coverage.runs > 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  {trend.current.coverage.answered} réponses exploitables sur{" "}
                  {trend.current.coverage.expected} prévues ;{" "}
                  {trend.current.coverage.failed} échecs et{" "}
                  {trend.current.coverage.noAnswer} réponses vides. Les erreurs
                  sont exclues des taux. Les variations comparent les mêmes
                  questions sans marque, marchés et moteurs.
                </p>
                {mixedMethods ? (
                  <p className="text-sm text-muted-foreground">
                    Les réponses des API de modèles et les observations Web sont
                    présentées par moteur, sans taux global commun.
                  </p>
                ) : (
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {trendSeries.map((series) => (
                        <span
                          key={series.key}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                        >
                          <span
                            className="size-2 rounded-sm"
                            style={{ backgroundColor: series.color }}
                          />
                          {series.label}
                        </span>
                      ))}
                    </div>
                    <VisibilityTrendChart trend={trend} />
                  </div>
                )}
                <TrendSummary trend={trend} />
              </>
            )}
            {message && (
              <Alert variant={warning ? "warning" : "info"}>
                {warning ? <TriangleAlert /> : <Info />}
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Change({ metric }: { metric: AiTrendMetric }) {
  if (metric.change === null) return null;
  const up = metric.change > 0;
  const down = metric.change < 0;
  return (
    <span
      className={cn(
        "text-sm whitespace-nowrap tabular-nums",
        up && "text-success",
        down && "text-destructive",
        !up && !down && "text-muted-foreground",
      )}
    >
      {up ? "▲ " : down ? "▼ " : ""}
      {Math.abs(metric.change).toFixed(1)} pts
    </span>
  );
}

/** Rates remain per engine so different collection methods stay identifiable. */
function TrendSummary({ trend }: { trend: AiTrend }) {
  const rows = trend.engines.map((row) => ({
    key: row.engine,
    label: <EngineLabel engine={row.engine} />,
    mentions: row.mentions,
    citations: row.citations,
  }));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead className="text-right">Mentions de marque</TableHead>
          <TableHead className="text-right">Citations du site</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>{row.label}</TableCell>
            {[row.mentions, row.citations].map((metric, index) => (
              <TableCell key={index} className="text-right">
                <span className="flex items-baseline justify-end gap-2 tabular-nums">
                  <span className="font-medium">{rate(metric.current)}</span>
                  <Change metric={metric} />
                </span>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
