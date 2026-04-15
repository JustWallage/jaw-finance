import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBTag } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const result = await env.DB.prepare(
      "SELECT * FROM tags WHERE user_email = ? ORDER BY path ASC",
    )
      .bind(userEmail)
      .all<DBTag>();

    return Response.json({ tags: result.results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const body = (await context.request.json()) as {
      name: string;
      path: string;
    };

    if (!body.name || !body.path) {
      return Response.json(
        { error: "name and path are required" },
        { status: 400 },
      );
    }

    const sanitizedPath = body.path
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/+/g, "/");

    if (!sanitizedPath) {
      return Response.json({ error: "Invalid path" }, { status: 400 });
    }

    const result = await env.DB.prepare(
      `INSERT INTO tags (user_email, name, path)
       VALUES (?, ?, ?)
       ON CONFLICT(user_email, path) DO UPDATE SET name = excluded.name
       RETURNING *`,
    )
      .bind(userEmail, body.name, sanitizedPath)
      .first<DBTag>();

    return Response.json({ tag: result }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
