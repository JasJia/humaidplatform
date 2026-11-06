"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Participants no longer choose a mode — conditions are assigned at random on
 * the server from the entry page. This route only forwards old links.
 */
export default function TaskPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(sessionStorage.getItem("humaid_mode") ? "/instructions" : "/");
  }, [router]);
  return null;
}
