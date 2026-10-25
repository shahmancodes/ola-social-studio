import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from '@/lib/data-directory';
export async function GET() {
  return new Response(await fs.readFile(path.join(ROOT_DIR, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')), { headers: { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=86400' } });
}
