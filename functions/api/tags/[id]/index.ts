import { getUserEmail, type EBEnv } from "../../../lib/enable-banking";
import type { DBTag } from "../../../../db/types";

export const onRequestDelete: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const tagId = (context.params as { id: string }).id;

    const tag = await env.DB.prepare(
      "SELECT id FROM tags WHERE id = ? AND user_email = ?",
    )
      .bind(tagId, userEmail)
      .first<{ id: number }>();

    if (!tag) {
      return Response.json({ error: "Tag not found" }, { status: 404 });
    }

    // Delete tag (CASCADE removes transaction_tags rows)
    await env.DB.prepare("DELETE FROM tags WHERE id = ? AND user_email = ?")
      .bind(tagId, userEmail)
      .run();

    return Response.json({ deleted: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};

/**
 * PATCH /api/tags/:id — supports renaming and status changes.
 * Body: { new_name?: string; status?: 'confirmed' | 'unconfirmed' | 'rejected' }
 *
 * Rename: updates the tag's name + path AND rewrites the path of all descendants.
 * Errors if any target path collides with an existing tag for this user.
 *
 * Status='rejected': sets status AND deletes all transaction_tags links for this tag.
 */
export const onRequestPatch: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const tagId = Number((context.params as { id: string }).id);
    const body = (await context.request.json()) as {
      new_name?: string;
      status?: "confirmed" | "unconfirmed" | "rejected";
    };

    const tag = await env.DB.prepare(
      "SELECT * FROM tags WHERE id = ? AND user_email = ?",
    )
      .bind(tagId, userEmail)
      .first<DBTag>();

    if (!tag) {
      return Response.json({ error: "Tag not found" }, { status: 404 });
    }

    if (body.new_name !== undefined) {
      const newName = body.new_name.trim();
      if (!newName || newName.includes("/")) {
        return Response.json(
          { error: "new_name must be non-empty and contain no '/'" },
          { status: 400 },
        );
      }
      const segments = tag.path.split("/");
      segments[segments.length - 1] = newName;
      const newPath = segments.join("/");

      if (newPath !== tag.path) {
        // Find all descendants
        const descendants = await env.DB.prepare(
          "SELECT id, path FROM tags WHERE user_email = ? AND path LIKE ?",
        )
          .bind(userEmail, tag.path + "/%")
          .all<{ id: number; path: string }>();

        const updates: { id: number; oldPath: string; newPath: string }[] = [
          { id: tag.id, oldPath: tag.path, newPath },
        ];
        for (const d of descendants.results) {
          updates.push({
            id: d.id,
            oldPath: d.path,
            newPath: newPath + d.path.slice(tag.path.length),
          });
        }

        // Collision check: any new path that matches an existing tag id != updated ids
        const updatedIds = new Set(updates.map((u) => u.id));
        for (const u of updates) {
          const collision = await env.DB.prepare(
            "SELECT id FROM tags WHERE user_email = ? AND path = ?",
          )
            .bind(userEmail, u.newPath)
            .first<{ id: number }>();
          if (collision && !updatedIds.has(collision.id)) {
            return Response.json(
              {
                error: `Rename would collide with existing tag '${u.newPath}'`,
              },
              { status: 409 },
            );
          }
        }

        for (const u of updates) {
          const segs = u.newPath.split("/");
          await env.DB.prepare(
            "UPDATE tags SET path = ?, name = ? WHERE id = ?",
          )
            .bind(u.newPath, segs[segs.length - 1], u.id)
            .run();
        }
      }
    }

    if (body.status !== undefined) {
      await env.DB.prepare("UPDATE tags SET status = ? WHERE id = ?")
        .bind(body.status, tagId)
        .run();

      if (body.status === "rejected") {
        await env.DB.prepare("DELETE FROM transaction_tags WHERE tag_id = ?")
          .bind(tagId)
          .run();
      }
    }

    const updated = await env.DB.prepare("SELECT * FROM tags WHERE id = ?")
      .bind(tagId)
      .first<DBTag>();

    return Response.json({ tag: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
