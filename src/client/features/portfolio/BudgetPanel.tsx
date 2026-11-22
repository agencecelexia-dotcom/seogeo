import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  type getMonitoringOverview,
  updateUsageBudget,
} from "@/serverFunctions/monitoring";

const euro = (micros: number) =>
  (micros / 1_000_000).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
type Overview = Awaited<ReturnType<typeof getMonitoringOverview>>;
export function BudgetPanel({ data }: { data: Overview }) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["monitoring"] });
  const onError = (error: Error) => toast.error(error.message);
  const budget = useMutation({
    mutationFn: (input: Parameters<typeof updateUsageBudget>[0]["data"]) =>
      updateUsageBudget({ data: input }),
    onSuccess: () => {
      toast.success("Budget enregistré");
      void refresh();
    },
    onError,
  });
  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">Budget des services</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["data", "ai"] as const).map((category) => {
          const period = data.budget.periods.find(
            (row) => row.category === category,
          );
          const limit =
            category === "data"
              ? data.budget.config.dataLimitMicros
              : data.budget.config.aiLimitMicros;
          const committed = period?.committedMicros ?? 0;
          return (
            <div key={category} className="space-y-2 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                {category === "data" ? "Données SEO / GEO" : "Génération IA"}
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {euro(committed)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  engagés / {euro(limit)}
                </span>
              </p>
              <progress
                aria-label={`Budget ${category}`}
                value={Math.min(committed, Math.max(limit, 1))}
                max={Math.max(limit, 1)}
                className="h-2 w-full accent-primary"
              />
            </div>
          );
        })}
      </div>
      <form
        key={data.budget.config.updatedAt}
        className="grid items-end gap-4 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          budget.mutate({
            dataLimitEur: Number(form.get("data")),
            aiLimitEur: Number(form.get("ai")),
            usdToEur: Number(form.get("rate")),
            suspended: form.get("paused") === "on",
          });
        }}
      >
        <label className="space-y-2 text-sm">
          Plafond données (€ / mois)
          <Input
            name="data"
            type="number"
            min="0"
            max="500"
            step="0.01"
            required
            defaultValue={data.budget.config.dataLimitMicros / 1_000_000}
          />
        </label>
        <label className="space-y-2 text-sm">
          Plafond IA (€ / mois)
          <Input
            name="ai"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            defaultValue={data.budget.config.aiLimitMicros / 1_000_000}
          />
        </label>
        <label className="space-y-2 text-sm">
          Conversion de planification : 1 USD en EUR
          <Input
            name="rate"
            type="number"
            min="0.1"
            max="5"
            step="0.01"
            required
            defaultValue={data.budget.config.usdToEur}
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            name="paused"
            type="checkbox"
            defaultChecked={data.budget.config.suspended}
          />{" "}
          Suspendre les nouvelles opérations payantes
        </label>
        <Button type="submit" disabled={budget.isPending}>
          Enregistrer le budget
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Les montants engagés incluent les réservations en cours et les coûts
        incertains. Période mensuelle en UTC. Conversion fixe pour la
        planification : les factures des fournisseurs restent la référence.
        Hébergement, taxes et prépaiements sont à prévoir séparément ; repère
        initial : 15 € de données + 5 € d’IA + 15 € d’hébergement + 10 € de
        marge.
      </p>
    </section>
  );
}
