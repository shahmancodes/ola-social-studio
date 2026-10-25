import type { ReactNode } from 'react';
import '@fontsource-variable/manrope';
import './style.css';
import { SentinelShell } from './sentinel-shell';
import { SEMANTIC_COMPONENT_CSS } from '@ola/lib/semantic-components';
export const metadata = { title: 'Ola Sentinel', description: 'Improve Ola with comparisons, a shared asset library, and generation analytics.' };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en"><body><style>{SEMANTIC_COMPONENT_CSS}</style><SentinelShell>{children}</SentinelShell></body></html>; }
