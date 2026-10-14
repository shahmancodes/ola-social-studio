"use client";

import { useEffect, useState } from "react";
import styles from "@/app/page.module.css";

const phrases = [
  "a story that moves.",
  "a carousel that lands.",
  "one frame worth saving.",
  "a swipe worth finishing.",
  "Instagram creative from your brief.",
];

export function RotatingHeadline() {
  const [index, setIndex] = useState(phrases.length - 1);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % phrases.length), index === phrases.length - 1 ? 7000 : 3600);
    return () => window.clearInterval(timer);
  }, [index]);

  return <span className={styles.rotatingLine} aria-live="off"><span key={index} className={`${styles.rotatingPhrase} ${index === phrases.length - 1 ? styles.rainbowPhrase : ""}`}>{phrases[index]}</span></span>;
}
