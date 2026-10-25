"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { MousePointer2, Hand, Blocks, Type, Square, ImagePlus, Layers, LayoutTemplate, Copy, Trash2, Lock, Unlock, Eye, EyeOff, ArrowUp, ArrowDown, RotateCw, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Minus, Plus, Scan, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { marqueeSelection, selectionRect, type SelectionRect } from '@/lib/canvas-marquee';
import type { CanvasPreview } from '@/lib/canvas-text';
import { persistedObjects, resizeCanvasObject, snapCanvasMove, resolveCanvasConnectors, canvasLine, type CanvasObject, type PreviewObject } from '@/lib/freeform-canvas';
import type { CopyPage } from '@/lib/composition';
import { editorFontFamily } from '@/lib/editor-appearance';
import { CANVAS_TYPOGRAPHY } from '@/lib/canvas-typography';
import { typographyHtml } from '@/lib/design-typography';
import { lineSegments } from '@/lib/design-primitives';
import { readableInk } from '@/lib/brand-design';
import { TextboxControls } from './textbox-controls';
import textboxControls from './canvas-controls.module.css';
import { resolveTextbox, textboxCss, compositeColor } from '@/lib/textbox-style';
import { CanvasLayoutChoices } from './canvas-layout-choices';
import { ComponentInspector } from './component-inspector';
import { CanvasInsert, type InsertTab } from './canvas-insert';
import { CanvasShortcuts } from './canvas-shortcuts';
import { FontPicker } from './font-picker';
import { EditorFonts } from './editor-fonts';
import styles from './freeform-page-canvas.module.css';

const handles=['nw','n','ne','e','se','s','sw','w'];
const label=(o:CanvasObject)=>o.component?o.component.kind.replace(/([A-Z])/g,' $1'):o.kind==='text'?(o.text?.replaceAll('\n',' ').slice(0,45)||'Empty text'):o.kind==='rect'?'Shape':o.kind==='line'?(o.connector?'Connector':o.arrow?'Arrow':'Line'):'Image';
function NumberField({label,value,onChange,min,max,step=1}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number}) {
  return <label className={styles.number}><span>{label}</span><input aria-label={label} type="number" key={value} defaultValue={Math.round(value*100)/100} min={min} max={max} step={step} onBlur={e=>{if(!e.target.value.trim())return;const v=Number(e.target.value);if(Number.isFinite(v)&&(min===undefined||v>=min)&&(max===undefined||v<=max))onChange(v);else e.target.value=String(value);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
}
function TextContent({object,editing,onFinish,onCancel,onSize}:{object:PreviewObject;editing:boolean;onFinish:(text:string)=>void;onCancel:()=>void;onSize?:(height:number)=>void}) {
  const ref=useRef<HTMLDivElement>(null), cancel=useRef(false);
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    if(editing){cancel.current=false;el.textContent=object.text??'';el.focus();const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}
    else el.innerHTML=typographyHtml(object.text??'',object.typography,object.accentColor);
  // Keep native selection and composition intact during an edit session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[editing,editing?null:object.text,editing?null:JSON.stringify(object.typography)]);
  return <div ref={ref} data-canvas-text={object.id} role="textbox" aria-label={`Edit ${label(object)}`} aria-multiline="true" aria-readonly={!editing} contentEditable={editing?'plaintext-only':false} suppressContentEditableWarning
    style={{...CANVAS_TYPOGRAPHY,...textboxCss(object.textbox),position:'relative',width:'100%',minHeight:object.height,fontFamily:editorFontFamily(object)??object.fontFamily,fontSize:object.fontSize,fontWeight:object.bold?700:400,fontStyle:object.italic?'italic':'normal',textDecoration:object.underline?'underline':'none',color:object.color,textAlign:object.align,lineHeight:object.typography?.leading??1.15,letterSpacing:`${object.typography?.tracking??0}em`,textWrap:object.typography?.wrap??'wrap',outline:'none',userSelect:editing?'text':'none',cursor:editing?'text':'inherit'}}
    onPointerDown={e=>{if(editing)e.stopPropagation();}} onBlur={e=>{if(editing&&!cancel.current){onSize?.(e.currentTarget.offsetHeight);onFinish(e.currentTarget.innerText.replaceAll('\r\n','\n'));}}} onKeyDown={e=>{
      if(!editing||e.nativeEvent.isComposing)return;e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();cancel.current=true;onCancel();}
      else if((e.key==='Enter'||e.key.toLowerCase()==='s')&&(e.metaKey||e.ctrlKey)){e.preventDefault();e.currentTarget.blur();}
    }}/>
}

export function FreeformPageCanvas({preview,page,projectId,companyId,assets,fonts,disabled,commentMode,busy,onObjects,onPageChange,onLayout,onSelect,onEditingChange,onUndo,onRedo,focusIds=[],story=false}:{
  projectId:string;story?:boolean;preview:CanvasPreview;page:CopyPage;companyId:string;assets:Array<{id:string;name:string}>;fonts:Array<{id:string;name:string}>;
  disabled:boolean;commentMode:boolean;busy:boolean;onObjects:(objects:CanvasObject[],group?:string)=>void;
  onPageChange:(page:CopyPage)=>void;onLayout:(page:CopyPage)=>void;onSelect:(object:CanvasObject,index:number)=>void;
  onEditingChange?:(v:boolean)=>void;onUndo?:()=>void;onRedo?:()=>void;focusIds?:string[];
}) {
  const root=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null);
  const [selected,setSelected]=useState<string[]>([]),[editing,setEditing]=useState<string|null>(null);
  const [panel,setPanel]=useState<'design'|'layers'|'layout'|'insert'>('design'),[inspector,setInspector]=useState(true),[insertTab,setInsertTab]=useState<InsertTab>('components');
  const [componentFocused,setComponentFocused]=useState(false);
  const componentEditingChange=useCallback((value:boolean)=>setComponentFocused(value),[]);
  const [safeArea,setSafeArea]=useState(false);
  const [marquee,setMarquee]=useState<SelectionRect|null>(null);
  const marqueeGesture=useRef<{pointerId:number;start:{x:number;y:number};clientX:number;clientY:number;previous:string[];additive:boolean;dragged:boolean}|null>(null);
  const [hand,setHand]=useState(false),[space,setSpace]=useState(false),[zoom,setZoom]=useState<number|null>(null),[available,setAvailable]=useState({width:800,height:700});
  const [transient,setTransient]=useState<PreviewObject[]|null>(null),[guides,setGuides]=useState<Array<{axis:'x'|'y';value:number}>>([]);
  const gesture=useRef<{kind:string;startX:number;startY:number;objects:PreviewObject[];ids:string[];target:PreviewObject;scale:number;scrollX:number;scrollY:number;group:string}|null>(null);
  const previewMap=new Map(preview.objects?.map(o=>[o.id,o]));
  const sources=new Map(preview.objects?.filter(o=>o.kind==='image').map(o=>[o.sourceId,o.url]));
  const palette=preview.palette??{background:preview.color,alternate:'#EEEEEE',ink:'#111111',dark:'#111111',accent:'#7252CE'};
  const stored=page.editorAppearance?.freeform?.objects??preview.objects??[];
  const objects:PreviewObject[]=resolveCanvasConnectors(transient??stored.map(o=>({...o,url:o.component?previewMap.get(o.id)?.url:o.referenceId?`/api/content/${projectId}/images/${o.referenceId}`:o.assetId?`/api/companies/${companyId}/assets/${o.assetId}`:previewMap.get(o.id)?.url??sources.get(o.sourceId),textbox:resolveTextbox(o.typography?.box,palette,Math.min(preview.width,preview.height)/1080),typography:o.kind==='text'?{wrap:preview.balanced?'balance':'wrap',...o.typography}:o.typography})));
  // Cropped bytes come from the shared server renderer; retain its result once current.
  for(const o of objects)if(o.crop&&JSON.stringify(o.crop)===JSON.stringify(previewMap.get(o.id)?.crop)&&previewMap.get(o.id)?.url)o.url=previewMap.get(o.id)!.url;
  const objectsRef=useRef(objects);objectsRef.current=objects;
  const fit=Math.max(.08,Math.min((available.width-80)/preview.width,(available.height-80)/preview.height));
  const scale=zoom??fit;
  const selection=objects.filter(o=>selected.includes(o.id)),one=selection.length===1?selection[0]:undefined;
  const editable=selection.filter(o=>!o.locked),blocked=disabled||commentMode;
  useLayoutEffect(()=>{const el=viewport.current;if(!el)return;const ro=new ResizeObserver(([entry])=>setAvailable({width:entry.contentRect.width,height:entry.contentRect.height}));ro.observe(el);return()=>ro.disconnect();},[]);
  useEffect(()=>{onEditingChange?.(!!editing||componentFocused);return()=>onEditingChange?.(false);},[editing,componentFocused,onEditingChange]);
  const focusKey=focusIds.join('|');
  useEffect(()=>{if(focusKey){const ids=objectsRef.current.filter(o=>focusIds.includes(o.id)||o.source&&focusIds.includes(o.source)).map(o=>o.id);setSelected(ids);setPanel('design');setInspector(true);}},[focusKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const release=()=>setSpace(false);window.addEventListener('keyup',release);window.addEventListener('blur',release);return()=>{window.removeEventListener('keyup',release);window.removeEventListener('blur',release);};},[]);
  function commit(next:PreviewObject[],group?:string){onObjects(persistedObjects(next),group);}
  function patch(patch:Partial<CanvasObject>,ids=editable.map(o=>o.id),group?:string){commit(objectsRef.current.map(o=>ids.includes(o.id)?{...o,...patch}:o),group);}
  function remove(){commit(objectsRef.current.filter(o=>!editable.some(s=>s.id===o.id)));setSelected([]);}
  function duplicate(){const ids=new Map(selection.map(o=>[o.id,crypto.randomUUID()]));const added=selection.map(o=>({...o,id:ids.get(o.id)!,connector:o.connector?{from:ids.get(o.connector.from)??o.connector.from,to:ids.get(o.connector.to)??o.connector.to}:undefined,custom:true,locked:false,x:o.x+24,y:o.y+24,source:undefined,copyId:undefined}));commit([...objectsRef.current,...added]);setSelected(added.map(o=>o.id));}
  function reorder(direction:number){const list=[...objectsRef.current];const indices=list.flatMap((o,i)=>selected.includes(o.id)&&!o.locked?[i]:[]);for(const i of direction>0?indices.reverse():indices){const to=i+direction;if(to>=0&&to<list.length&&!selected.includes(list[to].id))[list[i],list[to]]=[list[to],list[i]];}commit(list);}
  function add(kind:CanvasObject['kind'],assetId?:string){if(blocked||objects.length>=400)return;const id=crypto.randomUUID();const o:PreviewObject={id,kind,x:preview.width*.2,y:preview.height*.3,width:preview.width*.6,height:kind==='text'?100:280,rotation:0,custom:true,
    ...(kind==='text'?{text:'Your text here',fontSize:48,fontFamily:'OlaBody',color:palette.ink,align:'left',typography:{wrap:'wrap'}}:kind==='rect'?{fill:palette.accent,radius:16}:{assetId})};commit([...objectsRef.current,o]);setSelected([id]);setPanel('design');setInspector(true);root.current?.focus({preventScroll:true});}
  function insert(value:Partial<CanvasObject>,aspect=1,keepLibrary=false){
    if(blocked||objectsRef.current.length>=400)return;
    const width=Math.max(1,Math.min(preview.width*.65,preview.height*.55*aspect)),height=value.kind==='line'&&value.lineAxis==='horizontal'?1:Math.max(1,Math.min(20000,width/aspect)),id=crypto.randomUUID();
    commit([...objectsRef.current,{id,kind:'image',x:(preview.width-width)/2,y:(preview.height-height)/2,width,height,rotation:0,custom:true,...(value.kind==='rect'?{fill:palette.accent}:{color:palette.accent,strokeWidth:3}),...value}]);setSelected([id]);if(!keepLibrary)setPanel('design');setInspector(true);
  }
  function connectSelection(){
    const targets=selection.filter(o=>o.kind!=='line'&&!o.hidden);
    if(blocked||targets.length!==2)return;
    insert({kind:'line',connector:{from:targets[0].id,to:targets[1].id},arrow:'end',route:'elbow'},2);
  }
  function pointerDown(e:PointerEvent<HTMLElement>,object:PreviewObject,kind='move'){
    if(e.button!==0)return;
    if(hand||space){panStart(e);return;}
    if(editing===object.id)return;
    e.stopPropagation();
    if(commentMode){setSelected([object.id]);onSelect(object,objects.findIndex(o=>o.id===object.id));return;}
    if(disabled)return;
    e.preventDefault();root.current?.focus({preventScroll:true});
    const ids=e.shiftKey?(selected.includes(object.id)?selected.filter(id=>id!==object.id):[...selected,object.id]):selected.includes(object.id)?selected:[object.id];
    setSelected(ids);setPanel('design');if(object.component)setInspector(true);
    if(object.locked||!ids.includes(object.id)||object.connector&&ids.length===1)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current={kind,startX:e.clientX,startY:e.clientY,objects:objectsRef.current,ids:kind==='move'?ids.filter(id=>!objects.find(o=>o.id===id)?.locked):[object.id],target:object,scale,scrollX:0,scrollY:0,group:crypto.randomUUID()};
  }
  function backgroundPointerDown(e:PointerEvent<HTMLDivElement>){
    if(e.button!==0||!e.isPrimary||(e.target as HTMLElement).closest('[data-object-id],button,[contenteditable="plaintext-only"]'))return;
    if(hand||space){panStart(e);return;}
    if(blocked)return;
    const board=root.current?.querySelector('[data-artboard]')?.getBoundingClientRect();if(!board)return;
    e.preventDefault();root.current?.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);
    marqueeGesture.current={pointerId:e.pointerId,start:{x:(e.clientX-board.left)/scale,y:(e.clientY-board.top)/scale},clientX:e.clientX,clientY:e.clientY,previous:selected,additive:e.shiftKey,dragged:false};
    if(!e.shiftKey)setSelected([]);
    setPanel('design');
  }
  function panStart(e:PointerEvent<HTMLElement>){if(e.button!==0||!viewport.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={kind:'pan',startX:e.clientX,startY:e.clientY,objects:objectsRef.current,ids:[],target:objectsRef.current[0],scale,scrollX:viewport.current.scrollLeft,scrollY:viewport.current.scrollTop,group:''};}
  function pointerMove(e:PointerEvent<HTMLElement>,finish=false){
    const box=marqueeGesture.current;
    if(box){
      if(e.pointerId!==box.pointerId)return;
      const board=root.current?.querySelector('[data-artboard]')?.getBoundingClientRect();if(!board)return;
      box.dragged ||= Math.hypot(e.clientX-box.clientX,e.clientY-box.clientY)>=3;
      if(box.dragged){
        const rect=selectionRect(box.start,{x:(e.clientX-board.left)/scale,y:(e.clientY-board.top)/scale});
        setMarquee(rect);setSelected(marqueeSelection(objectsRef.current,rect,box.additive?box.previous:[]));
      }
      if(finish){marqueeGesture.current=null;setMarquee(null);}
      return;
    }
    const g=gesture.current;if(!g)return;
    if(g.kind==='pan'){viewport.current!.scrollLeft=g.scrollX-(e.clientX-g.startX);viewport.current!.scrollTop=g.scrollY-(e.clientY-g.startY);if(finish)gesture.current=null;return;}
    let dx=(e.clientX-g.startX)/g.scale,dy=(e.clientY-g.startY)/g.scale;
    if(Math.hypot(dx,dy)<2/g.scale&&!transient){if(finish)gesture.current=null;return;}
    let next:PreviewObject[];
    if(g.kind==='move'){
      if(!e.altKey&&g.target.rotation===0){const snapped=snapCanvasMove({...g.target,x:g.target.x+dx,y:g.target.y+dy},g.objects.filter(o=>!g.ids.includes(o.id)),preview.width,preview.height,5/g.scale);dx=snapped.object.x-g.target.x;dy=snapped.object.y-g.target.y;setGuides(snapped.guides);}else setGuides([]);
      next=g.objects.map(o=>g.ids.includes(o.id)?{...o,x:o.x+dx,y:o.y+dy}:o);
    }else if(g.kind==='rotate'){
      const el=root.current!.querySelector('[data-artboard]')!.getBoundingClientRect(),cx=el.left+(g.target.x+g.target.width/2)*g.scale,cy=el.top+(g.target.y+g.target.height/2)*g.scale;
      let angle=Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI+90;if(angle>180)angle-=360;if(e.shiftKey)angle=Math.round(angle/15)*15;
      next=g.objects.map(o=>o.id===g.target.id?{...o,rotation:Math.round(angle)}:o);
    }else next=g.objects.map(o=>o.id===g.target.id?{...o,...resizeCanvasObject(g.target,g.kind,dx,dy)}:o);
    setTransient(next);
    if(finish){commit(next,g.group);gesture.current=null;setTransient(null);setGuides([]);}
  }
  function cancelGesture(){if(marqueeGesture.current)setSelected(marqueeGesture.current.previous);marqueeGesture.current=null;setMarquee(null);gesture.current=null;setTransient(null);setGuides([]);}
  function keyDown(e:React.KeyboardEvent){
    const element=e.target as HTMLElement;if(!e.currentTarget.contains(element)||element.closest('input,textarea,select,button,summary,a,[contenteditable="plaintext-only"]'))return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?onRedo?.():onUndo?.();return;}
    if(blocked)return;
    if(e.key.toLowerCase()==='v'&&!e.metaKey&&!e.ctrlKey){setHand(false);return;}
    if(e.key===' '){e.preventDefault();setSpace(true);return;}
    if(e.key==='Escape'){cancelGesture();setSelected([]);return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){e.preventDefault();setSelected(objects.filter(o=>!o.locked&&!o.hidden).map(o=>o.id));return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();return;}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();return;}
    if(e.key==='Enter'&&one?.kind==='text'&&!one.locked){e.preventDefault();setEditing(one.id);return;}
    if(e.key.startsWith('Arrow')&&editable.length){e.preventDefault();const amount=e.shiftKey?10:1;commit(objects.map(o=>editable.includes(o)?{...o,x:o.x+(e.key==='ArrowLeft'?-amount:e.key==='ArrowRight'?amount:0),y:o.y+(e.key==='ArrowUp'?-amount:e.key==='ArrowDown'?amount:0)}:o),'nudge-'+selected.join(','));}
  }
  const button=(title:string,Icon:typeof Type,action:()=>void,inactive=false,pressed?:boolean)=><button type="button" title={title} aria-label={title} aria-pressed={pressed} disabled={inactive} onClick={action}><Icon size={16}/></button>;
  return <div ref={root} className={styles.editor} tabIndex={0} onKeyDown={keyDown} aria-label="Design editor">
    <EditorFonts companyId={companyId} fonts={fonts}/><style>{preview.fontCss}</style>
    <div className={styles.tools} role="toolbar" aria-label="Canvas tools">
      {button('Select (V)',MousePointer2,()=>setHand(false),false,!hand)}{button('Pan (hold Space)',Hand,()=>setHand(true),false,hand)}<span className={styles.divider}/>
      <button disabled={blocked} onClick={()=>add('text')}><Type size={16}/> Text</button><button disabled={blocked||objects.length>=400} aria-pressed={panel==='insert'&&insertTab==='shapes'} onClick={()=>{setInsertTab('shapes');setPanel('insert');setInspector(true);}}><Square size={16}/> Shapes</button>
      <button disabled={blocked||objects.length>=400} aria-pressed={panel==='insert'&&insertTab==='components'} onClick={()=>{setInsertTab('components');setPanel('insert');setInspector(true);}}><Blocks size={16}/> Insert</button>
      <button disabled={blocked||objects.length>=400} aria-pressed={panel==='insert'&&insertTab==='uploads'} onClick={()=>{setInsertTab('uploads');setPanel('insert');setInspector(true);}}><ImagePlus size={16}/> Image</button>

      <button disabled={blocked} onClick={()=>{setPanel('layout');setInspector(true);}}><LayoutTemplate size={16}/> Layout</button>
      <div className={styles.spacer}/>{story&&<button aria-pressed={safeArea} onClick={()=>setSafeArea(v=>!v)}>Safe area</button>}{button('Zoom out',Minus,()=>setZoom(Math.max(.08,scale/1.2)))}<button className={styles.zoom} title="Fit page" onClick={()=>setZoom(null)}>{Math.round(scale*100)}%</button>{button('Zoom in',Plus,()=>setZoom(Math.min(3,scale*1.2)))}{button('Fit page',Scan,()=>setZoom(null))}{button(inspector?'Hide properties':'Show properties',inspector?PanelLeftClose:PanelLeftOpen,()=>setInspector(v=>!v))}
    </div>
    <div className={styles.workarea} data-inspector={inspector||undefined}>
      <div ref={viewport} className={styles.viewport} data-hand={hand||space||undefined} onPointerDown={backgroundPointerDown} onPointerMove={e=>pointerMove(e)} onPointerUp={e=>pointerMove(e,true)} onPointerCancel={cancelGesture} onLostPointerCapture={()=>{if(marqueeGesture.current)cancelGesture();}}>
        <div className={styles.desk} style={{minWidth:preview.width*scale+100,minHeight:preview.height*scale+100}}>
          <div data-artboard className={styles.artboard} style={{width:preview.width*scale,height:preview.height*scale,background:page.visualOverrides?.background??preview.color}}>
            <div className={styles.document} style={{width:preview.width,height:preview.height,transform:`scale(${scale})`}}>
              {objects.map((object,index)=>object.hidden?null:<div key={object.id} data-object-id={object.id} data-selected={selected.includes(object.id)||undefined} data-locked={object.locked||undefined} className={styles.object} role="button" aria-label={`Select ${label(object)}`} tabIndex={-1}
                style={{left:object.x,top:object.y,width:object.width,height:object.height,transform:`rotate(${object.rotation}deg)`,zIndex:index,cursor:object.locked?'default':editing===object.id?'text':'move','--handle':`${9/scale}px`,'--border':`${1.5/scale}px`} as CSSProperties}
                onClick={e=>{if(e.detail===0){setSelected([object.id]);setPanel('design');if(object.component)setInspector(true);if(commentMode)onSelect(object,index);else root.current?.focus({preventScroll:true});}}} onPointerDown={e=>pointerDown(e,object)} onPointerMove={e=>pointerMove(e)} onPointerUp={e=>{pointerMove(e,true);e.stopPropagation();}} onPointerCancel={cancelGesture}
                onDoubleClick={e=>{if(!blocked&&!object.locked&&object.component){e.stopPropagation();setSelected([object.id]);setPanel('design');setInspector(true);}else if(!blocked&&!object.locked&&object.kind==='text'){e.stopPropagation();setEditing(object.id);setSelected([object.id]);}}}>
                {object.kind==='text'?<TextContent object={object} editing={editing===object.id} onFinish={text=>{patch({text},[object.id],`text-${object.id}-${Date.now()}`);setEditing(null);}} onCancel={()=>setEditing(null)}/>:object.kind==='rect'?<div style={{width:'100%',height:'100%',background:object.fill,borderRadius:object.radius}}/>:object.kind==='image'?object.url?<img draggable={false} src={object.url} alt=""/>:<div className={styles.pendingObject}>Preparing component…</div>:<svg width="100%" height="100%" viewBox={`0 0 ${object.width} ${object.height}`} overflow="visible">{lineSegments(canvasLine(object)).map((s,i)=><line key={i} x1={s.x} y1={s.y} x2={s.x2} y2={s.y2} stroke={object.color??palette.accent} strokeWidth={object.strokeWidth??2} strokeLinecap="round"/>)}</svg>}
              </div>)}
            </div>
            {/* Handles stay above every layer and remain the same screen size at any zoom. */}
            {selection.filter(o=>!o.hidden).map(o=><div className={styles.selection} key={o.id} style={{left:o.x*scale,top:o.y*scale,width:o.width*scale,height:o.height*scale,transform:`rotate(${o.rotation}deg)`}}>
              {!blocked&&!o.locked&&selection.length===1&&!o.connector&&editing!==o.id&&<>{handles.map(h=><button key={h} data-handle={h} aria-label={`Resize ${h}`} onPointerDown={e=>pointerDown(e,o,h)} onPointerMove={e=>pointerMove(e)} onPointerUp={e=>{pointerMove(e,true);e.stopPropagation();}} onPointerCancel={cancelGesture}/>)}<button className={styles.rotate} aria-label="Rotate object" onPointerDown={e=>pointerDown(e,o,'rotate')} onPointerMove={e=>pointerMove(e)} onPointerUp={e=>{pointerMove(e,true);e.stopPropagation();}} onPointerCancel={cancelGesture}><RotateCw size={12}/></button></>}
            </div>)}
            {marquee&&<div aria-hidden="true" data-marquee className={styles.marquee} style={{left:marquee.x*scale,top:marquee.y*scale,width:marquee.width*scale,height:marquee.height*scale}}/>}
            {safeArea&&<div className={styles.safeArea}><span>Story safe area</span></div>}
            {guides.map((g,i)=><div key={i} className={styles.guide} style={g.axis==='x'?{left:g.value*scale,top:0,height:'100%',width:1}:{top:g.value*scale,left:0,width:'100%',height:1}}/>)}
          </div>
        </div>
      </div>
      {inspector&&<aside className={styles.inspector} aria-label="Object properties">
        <div className={styles.tabs}>{(['design','layers','layout'] as const).map(tab=><button key={tab} aria-pressed={panel===tab} onClick={()=>setPanel(tab)}>{tab==='layers'&&<Layers size={13}/>} {tab[0].toUpperCase()+tab.slice(1)}</button>)}</div>
        {panel==='insert'?<CanvasInsert key={insertTab} initialTab={insertTab} projectId={projectId} companyId={companyId} assets={assets} disabled={blocked||objects.length>=400} onInsert={(value,aspect)=>insert(value,aspect,true)} onDone={()=>setPanel('design')}/>:panel==='layers'?<div className={styles.layers}>{[...objects].reverse().map(o=><div className={styles.layer} key={o.id} data-selected={selected.includes(o.id)||undefined}><button className={styles.layerName} onClick={e=>{setSelected(e.shiftKey?[...new Set([...selected,o.id])]:[o.id]);root.current?.focus({preventScroll:true});}}>{o.kind==='text'?<Type size={14}/>:o.kind==='image'?<ImagePlus size={14}/>:<Square size={14}/>}<span>{label(o)}</span></button>{button(o.hidden?'Show object':'Hide object',o.hidden?EyeOff:Eye,()=>patch({hidden:!o.hidden},[o.id]),blocked)}{button(o.locked?'Unlock object':'Lock object',o.locked?Lock:Unlock,()=>patch({locked:!o.locked},[o.id]),blocked)}</div>)}</div>
        :panel==='layout'?<div className={styles.section}><h3>Choose a layout</h3><p>Rearrange the generated design. Your text edits and added objects stay. You can undo the change.</p><fieldset disabled={blocked||busy}><CanvasLayoutChoices page={page} onChange={onLayout}/></fieldset></div>
        :!selection.length?<div className={styles.section}><h3>Your canvas</h3><p>Drag on empty canvas space to select multiple objects. Drag any selected object to move them together. Double-click text to write.</p><label className={styles.color}>Page color<input type="color" aria-label="Page color" disabled={blocked} value={page.visualOverrides?.background??preview.color} onChange={e=>onPageChange({...page,visualOverrides:{...page.visualOverrides,background:e.target.value}})}/></label><CanvasShortcuts/></div>
        :<><div className={styles.section}><h3>{one?one.kind==='text'?'Text':label(one):`${selection.length} objects`}</h3><div className={styles.actions}>{button('Duplicate',Copy,duplicate,blocked)}{button('Delete',Trash2,remove,blocked||!editable.length)}{button('Bring forward',ArrowUp,()=>reorder(1),blocked||!editable.length)}{button('Send backward',ArrowDown,()=>reorder(-1),blocked||!editable.length)}{button(one?.locked?'Unlock':'Lock',one?.locked?Unlock:Lock,()=>patch({locked:!selection.every(o=>o.locked)},selected),blocked)}</div></div>
          {selection.filter(o=>o.kind!=='line'&&!o.hidden).length===2&&<button disabled={blocked||objects.length>=400} onClick={connectSelection}>Connect objects</button>}{one&&<fieldset disabled={blocked||one.locked} className={styles.fields}>
            {one.component&&<div className={styles.section}><h3>Component settings</h3><ComponentInspector key={one.id} component={one.component} companyId={companyId} accent={palette.accent} onEditingChange={componentEditingChange} onChange={(component,group)=>patch({component},[one.id],`component-${one.id}-${group}`)}/></div>}
            {!one.connector&&<div className={styles.section}><h3>Position & size</h3><div className={styles.grid}>{(['x','y','width','height'] as const).map(k=><NumberField key={k} label={{x:'X',y:'Y',width:'Width',height:'Height'}[k]} value={one[k]} min={k==='width'||k==='height'?16:-20000} max={20000} onChange={v=>patch({[k]:v})}/>)}<NumberField label="Rotation" value={one.rotation} min={-360} max={360} onChange={v=>patch({rotation:v})}/></div></div>}
            {one.kind==='text'&&<div className={styles.section}><h3>Typography</h3><FontPicker fonts={fonts} value={one} onChange={v=>patch(v)}/><div className={styles.grid}><NumberField label="Font size" value={one.fontSize??48} min={1} max={1000} onChange={v=>patch({fontSize:v})}/><label className={styles.color}>Color<input type="color" aria-label="Text color" value={one.color??'#111111'} onChange={e=>patch({color:e.target.value})}/></label></div><div className={styles.actions}>{button('Bold',Bold,()=>patch({bold:!one.bold}),false,one.bold)}{button('Italic',Italic,()=>patch({italic:!one.italic}),false,one.italic)}{button('Underline',Underline,()=>patch({underline:!one.underline}),false,one.underline)}<span className={styles.divider}/>{(['left','center','right'] as const).map((a,i)=><button key={a} aria-label={`Align ${a}`} aria-pressed={one.align===a} onClick={()=>patch({align:a})}>{i===0?<AlignLeft size={15}/>:i===1?<AlignCenter size={15}/>:<AlignRight size={15}/>}</button>)}</div><div className={styles.grid}><NumberField label="Line height" value={one.typography?.leading??1.15} min={.95} max={1.65} step={.05} onChange={v=>patch({typography:{...one.typography,leading:v}})}/><NumberField label="Tracking" value={one.typography?.tracking??0} min={-.06} max={.16} step={.005} onChange={v=>patch({typography:{...one.typography,tracking:v}})}/></div><div className={textboxControls.toolbar} style={{position:'relative',display:'block',padding:0,border:0,boxShadow:'none',minWidth:0}}><TextboxControls inline target={one} appearance={{box:one.typography?.box}} onStyle={value=>{const next=resolveTextbox(value.box,palette,Math.min(preview.width,preview.height)/1080);const surface=next?.fill?compositeColor(next.fill,next.fillOpacity,palette.background):palette.background;patch({typography:{...one.typography,box:value.box},color:readableInk(surface,one.color??palette.ink),accentColor:readableInk(surface,one.accentColor??palette.accent)});}}/></div></div>}
            {one.kind==='rect'&&<div className={styles.section}><h3>Appearance</h3><label className={styles.color}>Fill<input type="color" aria-label="Shape fill" value={one.fill??palette.accent} onChange={e=>patch({fill:e.target.value})}/></label><NumberField label="Corner radius" value={one.radius??0} min={0} max={10000} onChange={v=>patch({radius:v})}/></div>}

            {one.kind==='line'&&<div className={styles.section}><h3>Line</h3><label className={styles.color}>Color<input type="color" aria-label="Line color" value={one.color??palette.accent} onChange={e=>patch({color:e.target.value})}/></label><NumberField label="Stroke width" value={one.strokeWidth??2} min={.1} max={100} step={.5} onChange={v=>patch({strokeWidth:v})}/><label>Arrowheads<select aria-label="Arrowheads" value={one.arrow??'none'} onChange={e=>patch({arrow:e.target.value==='none'?undefined:e.target.value as CanvasObject['arrow']})}><option value="none">None</option><option value="end">End</option><option value="start">Start</option><option value="both">Both</option></select></label><label>Path<select aria-label="Line path" value={one.route??'straight'} onChange={e=>patch({route:e.target.value as CanvasObject['route']})}><option value="straight">Straight</option><option value="elbow">Elbow</option></select></label>{one.connector&&<button onClick={()=>patch({connector:undefined})}>Detach connector</button>}</div>}

            {one.kind==='image'&&!one.component&&<div className={styles.section}><h3>Image</h3><label>Replace image<select aria-label="Replace image" value={one.assetId??''} onChange={e=>{if(e.target.value)patch({assetId:e.target.value,referenceId:undefined,crop:undefined});}}><option value="">Original image</option>{assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><NumberField label="Crop zoom" value={1/(one.crop?.width??1)} min={1} max={10} step={.1} onChange={v=>{const size=1/v;patch({crop:{x:(1-size)/2,y:(1-size)/2,width:size,height:size}});}}/>{one.crop&&<><NumberField label="Crop X" value={one.crop.x} min={0} max={1-one.crop.width} step={.01} onChange={v=>patch({crop:{...one.crop!,x:v}})}/><NumberField label="Crop Y" value={one.crop.y} min={0} max={1-one.crop.height} step={.01} onChange={v=>patch({crop:{...one.crop!,y:v}})}/><button onClick={()=>patch({crop:undefined})}>Reset crop</button></>}</div>}
          </fieldset>}
        </>}
      </aside>}
    </div>

    <div className={styles.status}><span>{editing?'Editing text · Esc to cancel · ⌘ / Ctrl + Enter to finish':commentMode?'Select an object to discuss it with Ola':marquee?'Drag to select · Shift adds to selection':selection.length?`${selection.length} selected · Drag any selected object to move${selection.length>1?' together':''}`:'Drag on empty canvas space to select multiple objects'}</span><span>{busy?'Updating preview…':`${preview.width} × ${preview.height}`}</span></div>
  </div>;
}
