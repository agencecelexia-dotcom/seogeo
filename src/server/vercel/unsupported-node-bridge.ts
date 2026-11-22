// Every App's optional Worker-to-Node proxy imports this Cloudflare-only API.
// Password authentication on Vercel never uses that proxy. Fail closed if a
// future change accidentally attempts to run it instead of a Node handler.
export function handleAsNodeRequest(): never {
  throw new Error(
    "The Every App Cloudflare Node bridge is unavailable on Vercel.",
  );
}
