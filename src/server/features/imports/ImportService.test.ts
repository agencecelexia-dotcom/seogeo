import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportService } from "./ImportService";
import { ImportRepository } from "./ImportRepository";
import type { ImportInput } from "@/shared/data-imports";

vi.mock("./ImportRepository", () => ({
  ImportRepository: { findBatch: vi.fn(), insert: vi.fn(), list: vi.fn() },
}));

function input(overrides: Partial<ImportInput> = {}): ImportInput {
  return {
    projectId: "site-1",
    source: "gsc_generative",
    fileName: "pages.csv",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-21",
    csv: "Pages,Impressions\nhttps://example.fr/services,12",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(ImportRepository.findBatch).mockResolvedValue(null);
  vi.mocked(ImportRepository.insert).mockResolvedValue({
    id: "00000000-0000-0000-0000-000000000001",
    rowCount: 1,
  });
});

describe("structured report imports", () => {
  it("previews French quoted CSV and removes identical observations", async () => {
    const result = await ImportService.preview(
      input({
        csv: '\uFEFFPages;Impressions\n"https://example.fr/services";"1 234"\n"https://example.fr/services";"1 234"',
      }),
      "example.fr",
    );
    expect(result).toMatchObject({
      errors: [],
      validRows: 1,
      duplicates: 1,
      totalRows: 2,
    });
    expect(result.rows[0]).toMatchObject({
      kind: "geo",
      value: 1234,
      periodStart: "2026-11-01",
      periodEnd: "2026-11-21",
    });
    expect(ImportRepository.insert).not.toHaveBeenCalled();
  });

  it("rejects conflicting values at the same export granularity without writing", async () => {
    await expect(
      ImportService.commit(
        input({
          csv: "Pages,Impressions\nhttps://example.fr/services,12\nhttps://example.fr/services,13",
        }),
        "example.fr",
        "user-1",
      ),
    ).rejects.toThrow("valeurs différentes");
    expect(ImportRepository.insert).not.toHaveBeenCalled();
  });

  it("refuses data from a different site and invalid dates", async () => {
    const otherSite = await ImportService.preview(
      input({ csv: "Pages,Impressions\nhttps://example.fr.evil.test/,12" }),
      "example.fr",
    );
    expect(otherSite.errors[0]?.message).toContain("n’appartient pas");
    const invalidDate = await ImportService.preview(
      input({ periodStart: "2026-02-30" }),
      "example.fr",
    );
    expect(invalidDate.errors[0]?.message).toContain("Date invalide");
  });

  it("keeps dates, device and country dimensions instead of merging aggregate reports", async () => {
    const result = await ImportService.preview(
      input({
        csv: "Date,Country,Device,Impressions\n2026-11-02,France,Mobile,0\n2026-11-02,France,Desktop,7",
      }),
      "example.fr",
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toMatchObject([
      {
        periodStart: "2026-11-02",
        periodEnd: "2026-11-02",
        device: "Mobile",
        country: "France",
        value: 0,
      },
      { device: "Desktop", value: 7 },
    ]);
    expect(result.rows[0]?.rowKey).not.toBe(result.rows[1]?.rowKey);
  });

  it("imports backlink evidence as declared data, never as a verified live link", async () => {
    await ImportService.commit(
      input({
        source: "backlinks",
        csv: 'Source URL,Target URL,Anchor,Rel\nhttps://partner.fr/a,https://www.example.fr/,"Entreprise, travaux",nofollow',
      }),
      "example.fr",
      "user-1",
    );
    expect(ImportRepository.insert).toHaveBeenCalledOnce();
    const rows = vi.mocked(ImportRepository.insert).mock.calls[0]?.[1];
    expect(rows?.[0]).toMatchObject({
      kind: "backlink",
      sourceUrl: "https://partner.fr/a",
      targetUrl: "https://www.example.fr/",
      anchor: "Entreprise, travaux",
      rel: "nofollow",
      firstSeen: null,
      lastSeen: null,
    });
    expect(rows?.[0]?.rowKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("deduplicates the same contents under another file name and row order", async () => {
    const first = input({
      csv: "Pages,Impressions\nhttps://example.fr/a,1\nhttps://example.fr/b,2",
    });
    await ImportService.commit(first, "example.fr", "user-1");
    const firstFingerprint = vi.mocked(ImportRepository.insert).mock
      .calls[0]?.[2];
    await ImportService.commit(
      {
        ...first,
        fileName: "renamed.csv",
        csv: "Pages,Impressions\nhttps://example.fr/b,2\nhttps://example.fr/a,1",
      },
      "example.fr",
      "user-1",
    );
    expect(vi.mocked(ImportRepository.insert).mock.calls[1]?.[2]).toBe(
      firstFingerprint,
    );
  });

  it("does not write an already imported file", async () => {
    vi.mocked(ImportRepository.findBatch).mockResolvedValue({
      id: "existing",
      projectId: "site-1",
      source: "gsc_generative",
      fileName: "old.csv",
      fingerprint: "hash",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-21",
      rowCount: 1,
      status: "complete",
      createdByUserId: "user-1",
      createdAt: "2026-11-22",
      completedAt: "2026-11-22",
    });
    expect(await ImportService.commit(input(), "example.fr", "user-1")).toEqual(
      { id: "existing", rowCount: 1, duplicate: true },
    );
    expect(ImportRepository.insert).not.toHaveBeenCalled();
  });

  it("rejects blank counters and dangerous link schemes", async () => {
    const empty = await ImportService.preview(
      input({ csv: "Pages,Impressions\nhttps://example.fr/services," }),
      "example.fr",
    );
    expect(empty.errors[0]?.message).toContain("Compteur entier");
    const unsafe = await ImportService.preview(
      input({
        source: "backlinks",
        csv: "Source URL,Target URL\njavascript:alert(1),https://example.fr/",
      }),
      "example.fr",
    );
    expect(unsafe.errors[0]?.message).toContain("HTTP(S)");
  });
});
