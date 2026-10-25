'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Columns3, Layers3, ChartNoAxesCombined, ArrowUpRight, Sparkles, HeartPulse } from 'lucide-react';

const sections = [
  { href: '/', label: 'Comparisons', description: 'Test & compare', icon: Columns3 },
  { href: '/assets', label: 'Assets', description: 'Explore the library', icon: Layers3 },
  { href: '/usage', label: 'Usage', description: 'Generations & spend', icon: ChartNoAxesCombined },
  { href: '/health', label: 'Health', description: 'Workers & model routing', icon: HeartPulse },
];

export function SentinelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [online, setOnline] = useState<boolean>();
  useEffect(() => {
    let live = true;
    async function refresh() {
      try { const response = await fetch('/api/settings', { cache: 'no-store' }); if (!response.ok) throw Error(); const data = await response.json(); if (live) setOnline(data.workerOnline); }
      catch { if (live) setOnline(undefined); }
    }
    void refresh(); const timer = setInterval(refresh, 10000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  return <div className="sentinel">
    <header className="topbar"><Link className="wordmark" href="/">ola<span className="mark-dot"/><span className="lab-name">Sentinel</span></Link><div className="top-status"><span className={`status-dot ${online ? 'online' : ''}`}/><span>{online === undefined ? 'Checking worker' : online ? 'Worker online' : 'Worker offline'}</span><span className="workspace-label">Local workspace</span></div></header>
    <div className="sentinel-shell"><aside className="sentinel-sidebar"><div className="nav-label">PRODUCT WORKSPACE</div><nav aria-label="Sentinel navigation">{sections.map(({ href, label, description, icon: Icon }) => {
      const selected = href === '/' ? pathname === '/' : pathname.startsWith(href) || href === '/assets' && pathname === '/components';
      return <Link key={href} href={href} className={`sentinel-nav ${selected ? 'active' : ''}`} aria-current={selected ? 'page' : undefined}><Icon/><span><strong>{label}</strong><small>{description}</small></span>{selected && <span className="nav-active-dot"/>}</Link>;
    })}</nav><div className="sentinel-sidebar-footer"><Sparkles/><strong>Make Ola better.</strong><p>Explore the building blocks.<br/>Measure what works.</p><a href="/api/ola-study-report">Open latest study <ArrowUpRight/></a></div></aside><div className="sentinel-content">{children}</div></div>
  </div>;
}
