/** Fail-closed: only explicitly known non-production environments are
 *  treated as such. An unset or unknown ENVIRONMENT counts as production. */
export function isProduction(environment?: string): boolean {
  return environment !== "local" && environment !== "staging";
}
