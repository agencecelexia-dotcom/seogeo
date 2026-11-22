import { AppError } from "@/server/lib/errors";
import {
  externalPublicationsProjectSchema,
  saveExternalPublicationSchema,
  type SaveExternalPublicationInput,
} from "@/types/schemas/external-publications";
import { ExternalPublicationRepository as repository } from "./ExternalPublicationRepository";

async function list(projectId: string) {
  externalPublicationsProjectSchema.parse({ projectId });
  const rows = await repository.list(projectId);
  return { publications: rows.slice(0, 200), truncated: rows.length > 200 };
}
async function save(input: SaveExternalPublicationInput) {
  const { id, revision, projectId, ...content } =
    saveExternalPublicationSchema.parse(input);
  const now = new Date().toISOString();
  if (id && revision !== undefined) {
    const row = await repository.update(projectId, id, revision, {
      ...content,
      updatedAt: now,
    });
    if (!row)
      throw new AppError(
        "CONFLICT",
        "Cette publication a changé ou n’est plus accessible. Rechargez la liste avant de réessayer.",
      );
    return row;
  }
  return repository.insert({
    ...content,
    id: crypto.randomUUID(),
    projectId,
    revision: 0,
    publishedAt: content.status === "published" ? now : null,
    createdAt: now,
    updatedAt: now,
  });
}
export const ExternalPublicationService = { list, save };
