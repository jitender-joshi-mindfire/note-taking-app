import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NoteSummary } from "@note-taking-app/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { extractPlainText } from "@/lib/tiptapContent";
import { listVersions, restoreVersion } from "@/lib/versionsApi";

interface VersionHistoryModalProps {
  noteId: string;
  open: boolean;
  onClose: () => void;
  onRestored: (note: NoteSummary) => void;
}

export function VersionHistoryModal({ noteId, open, onClose, onRestored }: VersionHistoryModalProps) {
  const queryClient = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const versionsQuery = useQuery({
    queryKey: ["versions", noteId],
    queryFn: () => listVersions(noteId),
    enabled: open,
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => restoreVersion(noteId, versionId),
    onSuccess: (note) => {
      onRestored(note);
      void queryClient.invalidateQueries({ queryKey: ["versions", noteId] });
      onClose();
    },
  });

  const versions = versionsQuery.data ?? [];
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;

  function handleSelect(versionId: string) {
    setSelectedVersionId(versionId);
    setShowRestoreConfirm(false);
  }

  function handleConfirmRestore() {
    if (!selectedVersionId || restoreMutation.isPending) {
      return;
    }
    restoreMutation.mutate(selectedVersionId);
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <h2 className="mb-4 text-lg font-semibold">Version history</h2>

      {versionsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading versions...</p>}

      {versionsQuery.data && versions.length === 0 && (
        <p className="text-sm text-muted-foreground">No retained versions yet.</p>
      )}

      {versions.length > 0 && (
        <div className="flex flex-col gap-4">
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {versions.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  className={`w-full rounded-md border p-2 text-left text-sm ${
                    version.id === selectedVersionId ? "border-primary bg-secondary" : ""
                  }`}
                  onClick={() => handleSelect(version.id)}
                >
                  <span className="font-medium">{version.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selectedVersion && (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <p className="text-sm font-medium">{selectedVersion.title}</p>
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
                {extractPlainText(selectedVersion.content)}
              </p>

              {!showRestoreConfirm ? (
                <Button type="button" size="sm" onClick={() => setShowRestoreConfirm(true)}>
                  Restore
                </Button>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <p className="text-sm">
                    Restore this version? Your current title and content will be replaced.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConfirmRestore}
                      disabled={restoreMutation.isPending}
                    >
                      {restoreMutation.isPending ? "Restoring..." : "Confirm restore"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRestoreConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
