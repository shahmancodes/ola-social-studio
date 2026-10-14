"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/app/page.module.css";

export function LandingPrompt({ destination }: { destination: "/join" | "/workspace" }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  return <><form className={styles.promptForm} onSubmit={(event) => { event.preventDefault(); if (brief.trim()) sessionStorage.setItem("content-studio-draft", brief.trim()); router.push(destination); }}>
    <label htmlFor="landing-brief" className="sr-only">What would you like to create?</label>
    <input id="landing-brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Describe an Instagram Story or carousel…" required />
    <button type="submit" aria-label="Start creating"><Image className={styles.promptBrush} src="/ola-paintbrush.svg" alt="" width={34} height={34} unoptimized /></button>
  </form><div className={styles.formatChoices} aria-label="Available formats"><button type="button" onClick={() => setBrief("Create one Instagram Story with a useful study tip for students.")}>Try a Story tip</button><button type="button" onClick={() => setBrief("Create a six-slide Instagram carousel that teaches students one study method with a worked example.")}>Try a carousel guide</button></div><div className={styles.comingSoonList} aria-label="Coming Soon formats">{["Post", "Article", "Presentation", "Design"].map((format) => <button type="button" disabled key={format} aria-label={`${format} Coming Soon`}>{format} <small>Coming Soon</small></button>)}</div></>;
}
