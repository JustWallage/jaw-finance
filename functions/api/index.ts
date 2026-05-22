import type { EBEnv } from "../lib/enable-banking";

export const onRequestGet: PagesFunction<EBEnv> = () => {
  return new Response(null, {
    status: 302,
    headers: { Location: "/app" },
  });
};
