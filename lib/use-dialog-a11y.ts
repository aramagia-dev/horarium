"use client";

import { useEffect, useRef } from "react";

export function useDialogA11y(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus first input/textarea/select if available, else first focusable — avoids stealing focus to close button
    const raf = window.requestAnimationFrame(() => {
      const focusable = getFocusable(node);
      if (focusable.length === 0) return;
      const preferred = focusable.find((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      (preferred ?? focusable[0])?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = getFocusable(node);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // prevent body scroll already handled, but ensure aria-hidden? not needed
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      // Only restore if focus is still inside dialog (avoid stealing focus while user types in next view)
      const active = document.activeElement as HTMLElement | null;
      if (active && node.contains(active)) {
        previouslyFocused?.focus();
      } else if (!active || active === document.body) {
        previouslyFocused?.focus();
      }
    };
  }, [open]);

  return ref;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true");
}
