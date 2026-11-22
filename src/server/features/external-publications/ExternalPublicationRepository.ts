import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalPublications } from "@/db/schema";
import type { ExternalPublication } from "@/types/schemas/external-publications";

type PublicationInsert = typeof externalPublications.$inferInsert;
type PublicationChange = Omit<
  PublicationInsert,
  "id" | "projectId" | "revision" | "createdAt" | "publishedAt"
>;
async function list(projectId: string): Promise<ExternalPublication[]> {
  return db
    .select()
    .from(externalPublications)
    .where(eq(externalPublications.projectId, projectId))
    .orderBy(
      desc(externalPublications.updatedAt),
      desc(externalPublications.id),
    )
    .limit(201);
}
async function insert(input: PublicationInsert): Promise<ExternalPublication> {
  const [row] = await db.insert(externalPublications).values(input).returning();
  return row;
}
async function update(
  projectId: string,
  id: string,
  revision: number,
  input: PublicationChange,
): Promise<ExternalPublication | null> {
  const [row] = await db
    .update(externalPublications)
    .set({
      ...input,
      revision: revision + 1,
      // This is when the user first declared the publication published, not
      // an independently verified date scraped from its host.
      publishedAt:
        input.status === "published"
          ? sql`coalesce(${externalPublications.publishedAt}, ${input.updatedAt})`
          : externalPublications.publishedAt,
    })
    .where(
      and(
        eq(externalPublications.projectId, projectId),
        eq(externalPublications.id, id),
        eq(externalPublications.revision, revision),
      ),
    )
    .returning();
  return row ?? null;
}
export const ExternalPublicationRepository = { list, insert, update };
