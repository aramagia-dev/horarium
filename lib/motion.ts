"use client";

import { useReducedMotion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";

export { useReducedMotion };

// ── Transitions ──
export const easeTransition: Transition = { duration: 0.22, ease: "easeOut" };
export const fastTransition: Transition = { duration: 0.16, ease: "easeOut" };
export const springTransition: Transition = { type: "spring", stiffness: 300, damping: 30 };

// ── Page / section ──
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: easeTransition },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15, ease: "easeOut" } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: easeTransition },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: easeTransition },
};

// ── Stagger ──
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: easeTransition },
};

// ── Modal / overlay ──
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.15, ease: "easeOut" } },
};

export const drawerVariants: Variants = {
  hidden: { x: "-100%" },
  visible: { x: 0, transition: { type: "spring", stiffness: 320, damping: 32 } },
  exit: { x: "-100%", transition: { duration: 0.2, ease: "easeIn" } },
};

export const subjectPanelVariants: Variants = {
  hidden: { x: 32, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 30 } },
  exit: { x: 32, opacity: 0, transition: { duration: 0.18, ease: "easeIn" } },
};

export const dropdownVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.14, ease: "easeIn" } },
};

// Return no-op variants when reduced motion is preferred (opacity only)
export function withReducedMotion(variants: Variants, reduced: boolean | null): Variants {
  if (!reduced) return variants;
  const out: Variants = {};
  for (const key of Object.keys(variants)) {
    const v = variants[key] as { transition?: unknown };
    out[key] = { opacity: key === "hidden" ? 0 : 1, transition: { duration: 0 } };
    // keep only opacity; strip transforms
    void v;
  }
  return out;
}
