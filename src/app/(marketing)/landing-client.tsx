"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Looping hero video. The clip's last frame doesn't match its first, so two
 * copies cross-fade at the loop point (per the Sellix prompt). Reduced motion
 * holds the poster frame.
 */
export function LoopVideo({ src, poster, className }: { src: string; poster: string; className?: string }) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const A = a.current, B = b.current;
    if (!A || !B) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      A.pause();
      return;
    }
    const FADE = 0.9;
    let cur = A, nxt = B, swapping = false;
    const play = (v: HTMLVideoElement) => v.play().catch(() => {});
    const tick = () => {
      if (swapping || !cur.duration || cur.duration - cur.currentTime > FADE) return;
      swapping = true;
      const out = cur;
      nxt.currentTime = 0;
      play(nxt);
      nxt.classList.add("is-active");
      out.classList.remove("is-active");
      [cur, nxt] = [nxt, cur];
      window.setTimeout(() => { out.pause(); out.currentTime = 0; swapping = false; }, FADE * 1000 + 100);
    };
    play(A);
    A.addEventListener("timeupdate", tick);
    B.addEventListener("timeupdate", tick);
    return () => { A.removeEventListener("timeupdate", tick); B.removeEventListener("timeupdate", tick); };
  }, []);

  const common = { muted: true, playsInline: true, preload: "auto", poster, "aria-hidden": true, disablePictureInPicture: true } as const;
  return (
    <>
      <video ref={a} className={`mk-video is-active ${className ?? ""}`} autoPlay loop {...common}><source src={src} type="video/mp4" /></video>
      <video ref={b} className={`mk-video ${className ?? ""}`} loop {...common}><source src={src} type="video/mp4" /></video>
    </>
  );
}

/** Adds `.in` to its child wrapper once scrolled into view (runs once). */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`mk-reveal ${shown ? "in" : ""} ${className ?? ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
