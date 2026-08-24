"use client";

// Silent polling: re-renders the server component tree so live pages (org
// chart) move on their own during a demo. Interval-only state changes.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
