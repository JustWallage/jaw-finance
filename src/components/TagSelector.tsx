import { useState, useRef, useEffect } from "react";
import { X, Trash2, Plus, Tag } from "lucide-react";
import type { DBTag } from "../../db/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TagSelectorProps {
  transactionId: number;
  assignedTags: DBTag[];
  allTags: DBTag[];
  onAssign: (txId: number, tagId: number) => Promise<boolean>;
  onRemove: (txId: number, tagId: number) => Promise<boolean>;
  onDelete: (tagId: number) => Promise<boolean>;
  onCreate: (name: string, path: string) => Promise<DBTag | null>;
  getTagCount: (tagId: number) => Promise<number>;
  onTagsChanged: () => void;
}

export function TagSelector({
  transactionId,
  assignedTags,
  allTags,
  onAssign,
  onRemove,
  onDelete,
  onCreate,
  getTagCount,
  onTagsChanged,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTag, setDeleteTag] = useState<DBTag | null>(null);
  const [deleteCount, setDeleteCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const assignedIds = new Set(assignedTags.map((t) => t.id));
  const unassigned = allTags.filter((t) => !assignedIds.has(t.id));

  async function handleAssign(tag: DBTag) {
    await onAssign(transactionId, tag.id);
    onTagsChanged();
  }

  async function handleRemove(tag: DBTag) {
    await onRemove(transactionId, tag.id);
    onTagsChanged();
  }

  async function handleDeleteClick(tag: DBTag) {
    const count = await getTagCount(tag.id);
    setDeleteCount(count);
    setDeleteTag(tag);
  }

  async function handleDeleteConfirm() {
    if (!deleteTag) return;
    await onDelete(deleteTag.id);
    setDeleteTag(null);
    onTagsChanged();
  }

  async function handleCreate() {
    const path = search.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
    if (!path) return;
    const name = path.includes("/") ? path.split("/").pop()! : path;
    const tag = await onCreate(name, path);
    if (tag) {
      await onAssign(transactionId, tag.id);
      onTagsChanged();
      setSearch("");
    }
  }

  const exactMatch = allTags.some(
    (t) => t.path === search.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/"),
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {assignedTags.map((tag) => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="gap-1 pr-1"
            data-testid={`tag-badge-${tag.path}`}
          >
            <span className="text-xs">{tag.path}</span>
            <button
              className="ml-0.5 rounded-sm p-0.5 hover:bg-muted"
              onClick={() => handleRemove(tag)}
              data-testid={`tag-remove-${tag.path}`}
            >
              <X className="h-3 w-3" />
            </button>
            <button
              className="rounded-sm p-0.5 hover:bg-destructive/20"
              onClick={() => handleDeleteClick(tag)}
              data-testid={`tag-delete-${tag.path}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            data-testid="tag-add-button"
            onClick={() => setOpen(!open)}
          >
            <Tag className="h-3 w-3" />
            Add tag
          </Button>
          {open && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover shadow-md">
              <Command>
                <CommandInput
                  placeholder="Search or create tag..."
                  value={search}
                  onValueChange={setSearch}
                  data-testid="tag-search-input"
                />
                <CommandList>
                  <CommandEmpty>
                    {search.trim() && (
                      <button
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                        onClick={handleCreate}
                        data-testid="tag-create-new"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create &ldquo;{search.trim()}&rdquo;
                      </button>
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {unassigned.map((tag) => (
                      <CommandItem
                        key={tag.id}
                        value={tag.path}
                        onSelect={() => handleAssign(tag)}
                        data-testid={`tag-option-${tag.path}`}
                      >
                        {tag.path}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {search.trim() && !exactMatch && unassigned.length > 0 && (
                    <CommandGroup>
                      <CommandItem
                        value={`__create__${search}`}
                        onSelect={handleCreate}
                        data-testid="tag-create-new"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create &ldquo;{search.trim()}&rdquo;
                      </CommandItem>
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={deleteTag !== null} onOpenChange={(v) => { if (!v) setDeleteTag(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will remove the tag &ldquo;{deleteTag?.path}&rdquo; from{" "}
              <strong>{deleteCount}</strong> transaction{deleteCount !== 1 ? "s" : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              data-testid="tag-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
