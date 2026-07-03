"use client";
import { useEffect, useRef } from "react";

// Strict LIFO Escape-to-close for every overlay in the app. Each open overlay
// registers on a single module-level stack; ONE global keydown listener closes
// only the TOP entry per Escape press, so overlays always close in reverse of
// the order they opened (drawer -> nested confirm on top: Esc closes the
// confirm first, then the drawer). See ai-context/22-enterprise-revamp-plan.md.

type Entry = { id: number; close: () => void };

let stack: Entry[] = [];
let listening = false;
let seq = 0;

function handleKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  // Don't hijack an in-progress IME composition, and defer to anything that
  // already handled Escape itself (an open Base UI dropdown/select stops
  // propagation + preventDefaults, so it closes before we touch the stack).
  if (e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) return;
  if (e.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.close();
}

function ensureListener() {
  if (listening) return;
  window.addEventListener("keydown", handleKey);
  listening = true;
}

// True while any useEscClose overlay (drawer, menu, popover) is open. Raw
// component keydown handlers (e.g. the inbox "Esc closes the conversation")
// should bail when this is true so Escape resolves the topmost overlay first
// instead of firing an unrelated action underneath it.
export function hasOpenOverlay(): boolean {
  return stack.length > 0;
}

/**
 * Close `onClose` when Escape is pressed while `open`, but only if this overlay
 * is the topmost one. Registration is keyed by a unique id (re-renders don't
 * duplicate it) and cleaned up on close/unmount (no zombie entries). Safe under
 * React StrictMode's double-mount.
 */
export function useEscClose(open: boolean, onClose: () => void) {
  const cbRef = useRef(onClose);
  cbRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = ++seq;
    stack.push({ id, close: () => cbRef.current() });
    ensureListener();
    return () => {
      stack = stack.filter((entry) => entry.id !== id);
    };
  }, [open]);
}
