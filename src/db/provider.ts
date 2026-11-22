import { env } from "cloudflare:workers";

type DatabaseProvider = "d1" | "postgres";

export function isVercelDatabaseRuntime(): boolean {
  return (
    Reflect.get(env, "RUNTIME_PLATFORM") === "vercel" ||
    (typeof process !== "undefined" &&
      process.env.RUNTIME_PLATFORM === "vercel")
  );
}

export function getDatabaseProvider(): DatabaseProvider {
  const provider = Reflect.get(env, "DATABASE_PROVIDER");
  if (isVercelDatabaseRuntime()) {
    if (provider && provider !== "postgres")
      throw new Error(
        "The Vercel runtime requires DATABASE_PROVIDER=postgres.",
      );
    return "postgres";
  }

  if (provider === "postgres") {
    return "postgres";
  }

  if (provider === "d1" || provider === undefined || provider === "") {
    return "d1";
  }

  throw new Error(
    `Unsupported DATABASE_PROVIDER "${String(provider)}". Expected "d1" or "postgres".`,
  );
}

// Workers retain Hyperdrive. The explicit Vercel runtime uses its marketplace
// pooled DATABASE_URL; no database secret is exposed to client bundles.
export function getPostgresConnectionString() {
  if (isVercelDatabaseRuntime()) {
    const value: unknown =
      (typeof process !== "undefined" ? process.env.DATABASE_URL : undefined) ??
      Reflect.get(env, "DATABASE_URL");
    if (
      typeof value !== "string" ||
      !/^postgres(?:ql)?:\/\//.test(value.trim())
    )
      throw new Error(
        "The Vercel runtime requires a PostgreSQL DATABASE_URL from its database integration.",
      );
    return value.trim();
  }
  const hyperdrive = Reflect.get(env, "HYPERDRIVE") as
    | { connectionString?: string }
    | undefined;
  const hyperdriveUrl = hyperdrive?.connectionString?.trim();
  if (hyperdriveUrl) {
    return hyperdriveUrl;
  }

  throw new Error(
    "DATABASE_PROVIDER=postgres requires a HYPERDRIVE binding (in local dev, its localConnectionString).",
  );
}
