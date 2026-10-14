"use client";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OlaLogo } from "./ola-logo";
import { ArrowRightIcon, ArrowUpRightIcon } from "./ui-icons";
import styles from "./whatsapp-landing.module.css";

type LinkedPhone = { phone: string; linkedAt: string };

const conversationLines = [
  "hey ola, can you make an Instagram Story for tomorrow’s study clinic?",
  "checking the details and your brand voice…",
  "yes. what time is the clinic, and what should students do next?",
  "6 pm HKT. ask them to save their place.",
  "sure, let me work on it.",
  "here’s a single editable Story. the time and CTA are in the safe area.",
  "amazing, thanks ola!",
] as const;

function ReadTicks() {
  return <svg className={styles.readTicks} width="18" height="12" viewBox="0 0 18 12" fill="none" aria-label="read">
    <path d="m1 6.2 3.2 3.1L10.8 2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m6.2 6.2 3.2 3.1L16 2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function MessageTime({ time, shown, read = false }: { time: string; shown: boolean; read?: boolean }) {
  return <small className={`${read ? styles.timeMeta : ""} ${shown ? "" : styles.pendingTime}`} aria-hidden={!shown}>
    {time}{read && <> <ReadTicks /></>}
  </small>;
}

function JoinButton({ mobile = false }: { mobile?: boolean }) {
  return <Link className={`${styles.connectButton} ${styles.joinButton} ${mobile ? styles.mobileJoinButton : styles.desktopJoinButton}`} href="/join" aria-label="join ola.">
    <span className={styles.joinWord}>join</span><OlaLogo decorative className={styles.joinLogo} /><span className={styles.joinPeriod}>.</span>
  </Link>;
}

function LaunchConversation({ guest }: { guest: boolean }) {
  const [phase, setPhase] = useState(0);
  const [lines, setLines] = useState<string[]>(["", "", "", "", "", "", ""]);
  const [completed, setCompleted] = useState(-1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLines([...conversationLines]);
      setCompleted(6);
      setPhase(7);
      return;
    }

    let active = true;
    const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    async function typeLine(index: number, speed = 27) {
      const content = conversationLines[index];
      for (let length = 1; length <= content.length; length++) {
        await pause(speed);
        if (!active) return false;
        setLines((current) => current.map((line, position) => position === index ? content.slice(0, length) : line));
      }
      setCompleted(index);
      return true;
    }
    async function play() {
      await pause(350);
      if (!await typeLine(0)) return;
      await pause(430);
      if (!active) return;
      setPhase(1);
      if (!await typeLine(1, 22)) return;
      await pause(600);
      for (let length = conversationLines[1].length - 1; length >= 0; length--) {
        await pause(10);
        if (!active) return;
        setLines((current) => current.map((line, position) => position === 1 ? conversationLines[1].slice(0, length) : line));
      }
      await pause(180);
      if (!active) return;
      setPhase(2);
      if (!await typeLine(2)) return;
      await pause(500);
      if (!active) return;
      setPhase(3);
      if (!await typeLine(3)) return;
      await pause(500);
      if (!active) return;
      setPhase(4);
      if (!await typeLine(4)) return;
      await pause(600);
      if (!active) return;
      setPhase(5);
      if (!await typeLine(5)) return;
      await pause(650);
      if (!active) return;
      setPhase(6);
      await pause(950);
      if (!active) return;
      setPhase(7);
      await typeLine(6);
    }
    void play();
    return () => { active = false; };
  }, []);

  return <div className={styles.conversation} data-phase={phase}>
    <div className={`${styles.messageRow} ${styles.fromYou}`} data-message="opening">
      <div className={styles.bubble}>{lines[0]}{phase === 0 && completed < 0 && <span className={styles.typingCursor} aria-hidden="true" />}<MessageTime time="10:24" shown={completed >= 0} read /></div>
    </div>
    {phase === 1 && <div className={`${styles.messageRow} ${styles.fromOla}`}>
      <span className={styles.olaAvatar}><OlaLogo decorative className={styles.olaAvatarLogo} /></span>
      <div className={`${styles.bubble} ${styles.thinkingBubble}`}><span className={styles.sender}>ola</span>{lines[1]}<span className={styles.typingCursor} aria-hidden="true" /></div>
    </div>}
    {phase >= 2 && <div className={`${styles.messageRow} ${styles.fromOla}`} data-message="choice">
      <span className={styles.olaAvatar}><OlaLogo decorative className={styles.olaAvatarLogo} /></span>
      <div className={styles.bubble}><span className={styles.sender}>ola</span>{lines[2]}{phase === 2 && completed < 2 && <span className={styles.typingCursor} aria-hidden="true" />}<MessageTime time="10:25" shown={completed >= 2} /></div>
    </div>}
    {phase >= 3 && <div className={`${styles.messageRow} ${styles.fromYou}`} data-message="answer">
      <div className={styles.bubble}>{lines[3]}{phase === 3 && completed < 3 && <span className={styles.typingCursor} aria-hidden="true" />}<MessageTime time="10:25" shown={completed >= 3} read /></div>
    </div>}
    {phase >= 4 && <div className={`${styles.messageRow} ${styles.fromOla}`} data-message="work">
      <span className={styles.olaAvatar}><OlaLogo decorative className={styles.olaAvatarLogo} /></span>
      <div className={styles.bubble}><span className={styles.sender}>ola</span>{lines[4]}{phase === 4 && completed < 4 && <span className={styles.typingCursor} aria-hidden="true" />}<MessageTime time="10:25" shown={completed >= 4} /></div>
    </div>}
    {phase >= 5 && <div className={`${styles.messageRow} ${styles.fromOla}`}>
      <span className={styles.olaAvatar}><OlaLogo decorative className={styles.olaAvatarLogo} /></span>
      <div className={`${styles.bubble} ${styles.posterMessage}`}><span className={styles.sender}>ola</span>{lines[5]}{phase === 5 && completed < 5 && <span className={styles.typingCursor} aria-hidden="true" />}{phase >= 6 && <Image src="/clinic-story-preview.svg" alt="Example Instagram Story for a fictional study clinic" width={540} height={960} unoptimized />}<MessageTime time="10:27" shown={phase >= 6} /></div>
    </div>}
    {phase >= 7 && <div className={`${styles.messageRow} ${styles.fromYou}`}>
      <div className={styles.bubble}>{lines[6]}{completed < 6 && <span className={styles.typingCursor} aria-hidden="true" />}<MessageTime time="10:28" shown={completed >= 6} read /></div>
    </div>}
    {guest && completed >= 6 && <JoinButton mobile />}
  </div>;
}

export function WhatsAppLanding({ displayNumber, ready, guest = false }: { displayNumber: string; ready: boolean; guest?: boolean }) {
  const [links, setLinks] = useState<LinkedPhone[] | null>(null);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const knownPhones = useRef<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (guest) return;
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/whatsapp/pair", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not check your connection.");
        const result = await response.json() as { links: LinkedPhone[] };
        if (!active) return;
        setLinks(result.links);
        if (code && result.links.some((link) => !knownPhones.current.has(link.phone))) {
          setCode("");
          setJustConnected(true);
          setError("");
        }
      } catch {
        if (active) setError((current) => current || "Could not check your connection. Please refresh the page.");
      }
    }
    void refresh();
    const timer = code ? window.setInterval(refresh, 4000) : undefined;
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [code, guest]);

  useEffect(() => {
    if (!code) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [code, expiresAt]);

  useEffect(() => {
    if (code && secondsLeft === 0) {
      setCode("");
      setError("That code expired. Generate a new one to continue.");
    }
  }, [code, secondsLeft]);

  async function generateCode() {
    if (!ready) return;
    setBusy(true);
    setError("");
    setJustConnected(false);
    knownPhones.current = new Set((links ?? []).map((link) => link.phone));
    try {
      const response = await fetch("/api/whatsapp/pair", { method: "POST" });
      const result = await response.json() as { code?: string; expiresInMinutes?: number; error?: string };
      if (!response.ok || !result.code) throw new Error(result.error ?? "Could not create a pairing code.");
      const duration = (result.expiresInMinutes ?? 10) * 60;
      setCode(result.code);
      setExpiresAt(Date.now() + duration * 1000);
      setSecondsLeft(duration);
      setCopied(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a pairing code."); }
    finally { setBusy(false); }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setCopied(true); }
    catch { setError("Copying failed. Select the code above and copy it manually."); }
  }

  const connected = Boolean(links?.length);
  const chatNumber = displayNumber.replace(/\D/g, "");
  const chatHref = code && chatNumber ? `https://wa.me/${chatNumber}?text=${encodeURIComponent(code)}` : "";
  const timeLeft = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><span className={styles.greenDot} /> OLA ON WHATSAPP</p>
        <h1>Your next idea starts with a message<span>.</span></h1>
        {guest ? <JoinButton /> : <Button variant="outline" className={styles.connectButton} type="button" onClick={() => dialogRef.current?.showModal()}><Image src="/whatsapp-glyph-green.svg" alt="" width={23} height={23} unoptimized /><span>Connect your number</span></Button>}
      </div>

      <div className={styles.heroVisual} aria-label="Illustrative conversation with Ola on WhatsApp">
        <LaunchConversation guest={guest} />
      </div>
    </section>

    {!guest && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="whatsapp-dialog-title" onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
      <Button variant="ghost" size="icon-sm" className={styles.closeDialog} type="button" aria-label="Close" onClick={() => dialogRef.current?.close()}>×</Button>
      <Image className={styles.dialogLogo} src="/whatsapp-glyph-green.svg" alt="" width={44} height={44} unoptimized />
      <h2 id="whatsapp-dialog-title">Connect your number.</h2>
      <p className={styles.dialogIntro}>Link your WhatsApp number to Ola with a private code.</p>
      {ready ? <>
        {links === null && <p className={styles.muted}>Checking your connection…</p>}
        {connected && <div className={styles.linkedNumbers}><span>LINKED TO YOUR ACCOUNT</span>{links?.map((link) => <strong key={link.phone}>+{link.phone}</strong>)}</div>}
        {justConnected && <p className={styles.successMessage} role="status">Connected. You can message Ola now.</p>}
        {!code && <Button variant="outline" className={styles.generateButton} type="button" onClick={() => void generateCode()} disabled={busy}>{busy ? "Generating…" : connected ? "Connect another number" : "Generate pairing code"}<ArrowRightIcon size={18} /></Button>}
        {code && <div className={styles.codePanel}><span>YOUR PRIVATE CODE</span><div className={styles.codeRow}><strong>{code}</strong><Button variant="outline" type="button" onClick={() => void copyCode()}>{copied ? "Copied" : "Copy"}</Button></div><small>Expires in {timeLeft}. Send the code to {displayNumber} from the number you want to link.</small>{chatHref && <a href={chatHref} target="_blank" rel="noopener noreferrer"><Image src="/whatsapp-glyph-green.svg" alt="" width={17} height={17} unoptimized /> Open WhatsApp <ArrowUpRightIcon size={16} /></a>}</div>}
        {!code && <p className={styles.dialogHint}>Send your code to {displayNumber} from your WhatsApp number. Ola will confirm when it is linked.</p>}
      </> : <p className={styles.unavailable}>Ola’s WhatsApp number is not available yet. You can connect here when the channel is ready.</p>}
      {error && <p className={styles.errorMessage} role="alert">{error}</p>}
    </dialog>}
  </main>;
}
