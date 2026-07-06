import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NoteSummary, ShareLinkSummary } from "@note-taking-app/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { generateShareLink, revokeShareLink } from "@/lib/shareApi";

const EXPIRY_OPTIONS = [7, 30, 90] as const;

interface ActiveLink {
  token: string;
  url: string;
  expiresAt: string;
  viewCount: number;
}

interface ShareModalProps {
  note: NoteSummary;
  open: boolean;
  onClose: () => void;
}

export function ShareModal({ note, open, onClose }: ShareModalProps) {
  const queryClient = useQueryClient();
  const [expiresInDays, setExpiresInDays] = useState<(typeof EXPIRY_OPTIONS)[number]>(7);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justGenerated, setJustGenerated] = useState<ShareLinkSummary | null>(null);
  const [justRevoked, setJustRevoked] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () => generateShareLink(note.id, { expiresInDays }),
    onSuccess: (link) => {
      setJustGenerated(link);
      setJustRevoked(false);
      setShowRegenerateConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["note", note.id] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeShareLink(note.id),
    onSuccess: () => {
      setJustRevoked(true);
      setJustGenerated(null);
      setShowRevokeConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["note", note.id] });
    },
  });

  const activeLink: ActiveLink | null = justRevoked
    ? null
    : justGenerated
      ? { ...justGenerated, viewCount: 0 }
      : note.shareLink;

  function handleGenerateClick() {
    if (generateMutation.isPending) {
      return;
    }
    if (activeLink) {
      setShowRegenerateConfirm(true);
    } else {
      generateMutation.mutate();
    }
  }

  function handleConfirmGenerate() {
    if (generateMutation.isPending) {
      return;
    }
    generateMutation.mutate();
  }

  function handleConfirmRevoke() {
    if (revokeMutation.isPending) {
      return;
    }
    revokeMutation.mutate();
  }

  async function handleCopy() {
    if (!activeLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(activeLink.url);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <h2 className="mb-4 text-lg font-semibold">Share note</h2>

      {activeLink && !showRevokeConfirm && (
        <div className="mb-4 flex flex-col gap-2">
          <p className="break-all text-sm">{activeLink.url}</p>
          <p className="text-xs text-muted-foreground">
            Expires {new Date(activeLink.expiresAt).toLocaleDateString()} ·{" "}
            {activeLink.viewCount} views
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setShowRevokeConfirm(true)}
            >
              Revoke
            </Button>
          </div>
        </div>
      )}

      {activeLink && showRevokeConfirm && (
        <div className="mb-4 flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm">Revoke this link? It will stop working immediately.</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmRevoke}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? "Revoking..." : "Confirm revoke"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRevokeConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!activeLink && (
        <p className="mb-4 text-sm text-muted-foreground">This note has no active share link.</p>
      )}

      {!showRevokeConfirm && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {activeLink ? "Generate a new link" : "Generate a link"}
          </p>
          <div className="flex gap-2">
            {EXPIRY_OPTIONS.map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={expiresInDays === days ? "secondary" : "outline"}
                onClick={() => setExpiresInDays(days)}
              >
                {days} days
              </Button>
            ))}
          </div>
          {!showRegenerateConfirm ? (
            <Button type="button" onClick={handleGenerateClick} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? "Generating..." : "Generate"}
            </Button>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <p className="text-sm">This will invalidate the current link. Continue?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleConfirmGenerate}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? "Generating..." : "Confirm"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRegenerateConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
