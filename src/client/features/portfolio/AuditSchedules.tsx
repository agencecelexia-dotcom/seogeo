import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  getAuditSchedules,
  updateAuditSchedule,
} from "@/serverFunctions/auditSchedules";

export function AuditSchedules({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["audit-schedules"],
    queryFn: () => getAuditSchedules(),
    refetchInterval: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof updateAuditSchedule>[0]["data"]) =>
      updateAuditSchedule({ data }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["audit-schedules"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Audits hebdomadaires</h2>
      <p className="text-sm text-muted-foreground">
        Audit du HTML, jusqu’à 1 000 pages par site, tous les 7 jours après
        activation. Le premier passage démarre au prochain cycle du
        planificateur. Les résultats ne modifient pas vos sites.
      </p>
      {query.isError ? (
        <p role="alert">Impossible de charger les programmations.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => {
            const schedule = query.data?.find(
              (row) => row.schedule.projectId === project.id,
            )?.schedule;
            return (
              <article
                key={project.id}
                className="space-y-3 rounded-xl border bg-card p-5"
              >
                <h3 className="font-semibold">{project.name}</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!query.isSuccess || mutation.isPending}
                    checked={schedule?.enabled ?? false}
                    onChange={(event) =>
                      mutation.mutate({
                        projectId: project.id,
                        enabled: event.target.checked,
                        maxPages: 1000,
                      })
                    }
                  />{" "}
                  Programmer un audit par semaine
                </label>
                {schedule ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Prochain passage :{" "}
                      {new Date(schedule.nextRunAt).toLocaleString("fr-FR", {
                        timeZone: "Europe/Paris",
                      })}{" "}
                      (Paris)
                    </p>
                    <p className="text-sm">
                      {schedule.lastOutcome ?? "Aucun audit planifié exécuté."}
                    </p>
                  </>
                ) : null}
                <Link
                  to="/p/$projectId/audit"
                  params={{ projectId: project.id }}
                  className="text-sm text-primary underline"
                >
                  Voir les audits
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
