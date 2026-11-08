"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { logEvent, flushEvents, startEventStreaming } from "@/lib/event-logger";

const IDLE_AFTER_MS = 60_000;

/** Short, readable label for a clicked element. */
function describe(el: Element): string {
  const text = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || "").trim();
  return text.replace(/\s+/g, " ").slice(0, 80);
}

/**
 * Site-wide participant activity tracker (participant pages only; the admin
 * dashboard is excluded). Records page views and dwell time, tab switches and
 * window focus, copy / cut / paste, every button or link click, and idle
 * periods. Events are streamed to the server by lib/event-logger.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const pageStart = useRef<number>(Date.now());
  const hiddenAt = useRef<number | null>(null);
  const lastActivity = useRef<number>(Date.now());
  const idle = useRef(false);

  const isParticipantPage = !pathname.startsWith("/humaidadmin2026");

  // Page views and time on page.
  useEffect(() => {
    if (!isParticipantPage) return;
    startEventStreaming();
    pageStart.current = Date.now();
    logEvent("page_view", { page: pathname, viewport: `${window.innerWidth}x${window.innerHeight}` });
    return () => {
      logEvent("page_leave", { page: pathname, durationMs: Date.now() - pageStart.current });
      flushEvents(false);
    };
  }, [pathname, isParticipantPage]);

  // Global listeners (registered once).
  useEffect(() => {
    if (!isParticipantPage) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        logEvent("tab_hidden", {});
        flushEvents(true);
      } else {
        const away = hiddenAt.current ? Date.now() - hiddenAt.current : null;
        hiddenAt.current = null;
        logEvent("tab_visible", { awayMs: away });
      }
    };
    const onBlur = () => logEvent("window_blur", {});
    const onFocus = () => logEvent("window_focus", {});
    const onPageHide = () => {
      logEvent("page_unload", { durationMs: Date.now() - pageStart.current });
      flushEvents(true);
    };

    const clipboard = (kind: "copy" | "cut" | "paste") => (e: ClipboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const field = target?.closest("textarea, input") ? "text_field" : "page";
      let text = "";
      if (kind === "paste") text = e.clipboardData?.getData("text") ?? "";
      else text = window.getSelection()?.toString() ?? "";
      logEvent(kind, { field, charCount: text.length, preview: text.slice(0, 300) });
    };
    const onCopy = clipboard("copy");
    const onCut = clipboard("cut");
    const onPaste = clipboard("paste");

    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest("button, a, [role=button], input[type=checkbox], input[type=radio]") : null;
      if (!el) return;
      const href = el.tagName === "A" ? (el as HTMLAnchorElement).href : undefined;
      logEvent("click", {
        element: el.tagName.toLowerCase(),
        label: describe(el),
        ...(href ? { href, external: !href.startsWith(window.location.origin) } : {}),
      });
    };

    const onSelect = () => {
      const sel = window.getSelection()?.toString() ?? "";
      if (sel.length >= 20) logEvent("text_selected", { charCount: sel.length, preview: sel.slice(0, 120) });
    };

    const markActive = () => {
      lastActivity.current = Date.now();
      if (idle.current) {
        idle.current = false;
        logEvent("idle_end", {});
      }
    };
    const idleTimer = setInterval(() => {
      if (!idle.current && document.visibilityState === "visible" && Date.now() - lastActivity.current > IDLE_AFTER_MS) {
        idle.current = true;
        logEvent("idle_start", { afterMs: IDLE_AFTER_MS });
      }
    }, 5_000);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseup", onSelect);
    ["mousemove", "keydown", "scroll", "click", "touchstart"].forEach((t) =>
      window.addEventListener(t, markActive, { passive: true })
    );

    return () => {
      clearInterval(idleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseup", onSelect);
      ["mousemove", "keydown", "scroll", "click", "touchstart"].forEach((t) =>
        window.removeEventListener(t, markActive)
      );
    };
  }, [isParticipantPage]);

  return null;
}
