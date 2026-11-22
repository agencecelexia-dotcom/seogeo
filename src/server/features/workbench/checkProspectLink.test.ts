import { beforeEach, expect, it, vi } from "vitest";
import { checkProspectLink } from "./checkProspectLink";
import { publicFetch } from "@/server/lib/public-fetch";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";

vi.mock("@/server/lib/public-fetch", () => ({ publicFetch: vi.fn() }));
vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(normalizeAndValidateStartUrl).mockImplementation(
    async (url) => url,
  );
  vi.mocked(publicFetch).mockImplementation(
    async () =>
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
  );
});
it("finds a relative link under the HTML base and retains its disclosure", async () => {
  vi.mocked(publicFetch).mockResolvedValue(
    new Response(
      '<base href="https://site.fr/"><a href="resource#part" rel="nofollow sponsored">Article</a>',
      { headers: { "content-type": "text/html" } },
    ),
  );
  expect(
    await checkProspectLink(
      "https://publication.fr/post",
      "https://site.fr/resource",
    ),
  ).toMatchObject({ status: "present", rel: "nofollow sponsored" });
});
it("checks each redirect destination before making another network request", async () => {
  vi.mocked(publicFetch).mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    }),
  );
  vi.mocked(normalizeAndValidateStartUrl).mockImplementation(async (url) => {
    if (url.includes("127.0.0.1")) throw new Error("Private network refused");
    return url;
  });
  expect(
    await checkProspectLink(
      "https://publication.fr/post",
      "https://site.fr/resource",
    ),
  ).toMatchObject({ status: "error" });
  expect(publicFetch).toHaveBeenCalledTimes(1);
});
it("treats blocked HTML as unknown rather than proof of a lost link", async () => {
  vi.mocked(publicFetch).mockResolvedValue(
    new Response("Denied", {
      status: 403,
      headers: { "content-type": "text/html" },
    }),
  );
  expect(
    await checkProspectLink(
      "https://publication.fr/post",
      "https://site.fr/resource",
    ),
  ).toMatchObject({ status: "error" });
});
it("does not verify a link by reading only a truncated document", async () => {
  vi.mocked(publicFetch).mockResolvedValue(
    new Response("x".repeat(2 * 1024 * 1024 + 1), {
      headers: { "content-type": "text/html" },
    }),
  );
  expect(
    await checkProspectLink(
      "https://publication.fr/post",
      "https://site.fr/resource",
    ),
  ).toMatchObject({ status: "error" });
});
