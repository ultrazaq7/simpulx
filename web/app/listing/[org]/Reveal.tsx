"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Fade + rise an element as it scrolls into view. Pure IntersectionObserver, no
// animation library -- the microsite must stay light and fast. Respects
// prefers-reduced-motion (renders instantly for users who ask for less motion).

export default function Reveal({
  children, delay = 0, className = "", as: Tag = "div",
}: { children: ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: `opacity .6s cubic-bezier(.16,1,.3,1) ${delay}ms, transform .6s cubic-bezier(.16,1,.3,1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}
