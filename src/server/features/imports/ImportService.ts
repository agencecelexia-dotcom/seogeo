import { AppError } from "@/server/lib/errors";
import { ImportRepository } from "./ImportRepository";
import { importFingerprint, parseImport } from "./parseImport";
import { importInputSchema, type ImportInput } from "@/shared/data-imports";

async function preview(input: ImportInput, projectDomain: string) {
  const parsed = parseImport(input, projectDomain);
  const fingerprint = await importFingerprint(input, parsed.rows);
  const existing = parsed.errors.length
    ? null
    : await ImportRepository.findBatch(input.projectId, fingerprint);
  return {
    ...parsed,
    rows: parsed.rows.slice(0, 20),
    validRows: parsed.rows.length,
    alreadyImported: Boolean(existing),
    existingBatchId: existing?.id ?? null,
  };
}

async function commit(
  rawInput: ImportInput,
  projectDomain: string,
  userId: string,
) {
  const input = importInputSchema.parse(rawInput);
  const parsed = parseImport(input, projectDomain);
  if (parsed.errors.length)
    throw new AppError(
      "VALIDATION_ERROR",
      parsed.errors
        .map((error) => `Ligne ${error.row} : ${error.message}`)
        .join("\n"),
    );
  const fingerprint = await importFingerprint(input, parsed.rows);
  const existing = await ImportRepository.findBatch(
    input.projectId,
    fingerprint,
  );
  if (existing)
    return { id: existing.id, rowCount: existing.rowCount, duplicate: true };
  // Fixed-width keys keep URL/query text out of PostgreSQL's B-tree limit.
  const rows = await Promise.all(
    parsed.rows.map(async (row) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(row.rowKey),
      );
      return {
        ...row,
        rowKey: Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      };
    }),
  );
  try {
    return {
      ...(await ImportRepository.insert(input, rows, fingerprint, userId)),
      duplicate: false,
    };
  } catch (error) {
    // Two tabs can commit the same preview. The unique fingerprint and atomic
    // transaction choose one winner; return its result instead of duplicating.
    const winner = await ImportRepository.findBatch(
      input.projectId,
      fingerprint,
    );
    if (winner)
      return { id: winner.id, rowCount: winner.rowCount, duplicate: true };
    throw error;
  }
}

export const ImportService = { preview, commit, list: ImportRepository.list };
