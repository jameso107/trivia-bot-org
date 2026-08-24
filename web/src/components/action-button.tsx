"use client";

// Tactile submit for server-action forms (owner request 2026-08-24: invisible
// clicks on "Run now" queued accidental duplicate runs). Presses down via the
// global :active rule, then reads busy — spinner + label swap + disabled —
// until the action round-trips.
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function ActionButton({
  children,
  pendingText = "Working…",
  className = "",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-busy={pending} className={className}>
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
