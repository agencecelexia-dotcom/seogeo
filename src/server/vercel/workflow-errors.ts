/** Shared identity for the legacy Workflow classes and the Node runner. */
export class NonRetryableError extends Error {
  override name = "NonRetryableError";
}
