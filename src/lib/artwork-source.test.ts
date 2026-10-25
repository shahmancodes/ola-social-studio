import {afterEach,expect,it,vi} from 'vitest';
vi.mock('./internet-assets',()=>({safeRemoteUrl:vi.fn(async(raw:string)=>{const url=new URL(raw);if(url.hostname==='localhost')throw Error('Private host');return url;}),fetchImage:vi.fn()}));
import {inspectArtworkSource} from './directed-artwork';
import {safeRemoteUrl} from './internet-assets';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('extracts actual absolute and relative image URLs plus readable source evidence',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html><meta name="author" content="Source creator"><meta property="og:image" content="/photos/original.jpg?x=1&amp;y=2"><main><h1>Leaf photograph</h1><p>Published by its creator under CC0.</p><a href="https://cdn.example.org/full.png">Original file</a><img src="small.webp"><a href="/license">Terms</a></main></html>',{headers:{'content-type':'text/html'}})));
 const source=await inspectArtworkSource('https://example.org/images/leaf');
 expect(source.imageUrls).toEqual(['https://example.org/photos/original.jpg?x=1&y=2','https://cdn.example.org/full.png','https://example.org/images/small.webp']);expect(source.text).toContain('under CC0');expect(source.metadata.author).toBe('Source creator');
});
it('revalidates a redirected URL before fetching it',async()=>{const fetch=vi.fn(async()=>new Response(null,{status:302,headers:{location:'http://localhost/private'}}));vi.stubGlobal('fetch',fetch);await expect(inspectArtworkSource('https://example.org/image')).rejects.toThrow('Private host');expect(fetch).toHaveBeenCalledTimes(1);expect(safeRemoteUrl).toHaveBeenCalledWith('http://localhost/private');});
it('rejects non-page responses instead of treating guessed URLs as inspected sources',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('bytes',{headers:{'content-type':'image/png'}})));await expect(inspectArtworkSource('https://example.org/image')).rejects.toThrow('readable public page');});
