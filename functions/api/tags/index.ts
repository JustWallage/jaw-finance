import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import type { DBTag } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const url = new URL(context.request.url);
    const status = url.searchParams.get("status");

    let query = "SELECT * FROM tags WHERE user_email = ?";
    const binds: string[] = [userEmail];
    if (status) {
      query += " AND status = ?";
      binds.push(status);
    } else {
      query += " AND status != 'rejected'";
    }
    query += " ORDER BY path ASC";

    const result = await env.DB.prepare(query)
      .bind(...binds)
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

    const existing = await env.DB.prepare(
      "SELECT id, status FROM tags WHERE user_email = ? AND path = ?",
    )
      .bind(userEmail, sanitizedPath)
      .first<{ id: number; status: string }>();

    if (existing && existing.status === "rejected") {
      return Response.json(
        { error: "Tag is rejected; un-reject first" },
        { status: 409 },
      );
    }

    const result = await env.DB.prepare(
      `INSERT INTO tags (user_email, name, path, source, status, reasoning)
       VALUES (?, ?, ?, 'user', 'confirmed', NULL)
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
