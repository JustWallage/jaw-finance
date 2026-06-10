import { isProduction } from "../lib/env";

interface Env {
  ENVIRONMENT?: string;
}

/** The mock bank only exists for local dev and staging E2E. Fail closed:
 *  unless the environment is explicitly non-production, the entire
 *  /mock-enable-banking subtree does not exist. */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (isProduction(context.env.ENVIRONMENT)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return context.next();
};
