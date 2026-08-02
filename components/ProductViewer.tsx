'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SpinIndicator } from './SpinIndicator'

type Props = {mode:'spin'|'model'|'static';heroImage:string;alt:string;spinImages?:string[];imagePath?:string;modelPath?:string;frameCount?:number}

export default function ProductViewer({mode,heroImage,alt,spinImages,imagePath,modelPath,frameCount=24}:Props) {
  const frames=useMemo(()=>spinImages?.length?spinImages:Array.from({length:frameCount},(_,i)=>imagePath?.replace('{index}',String(i+1).padStart(2,'0'))||heroImage),[spinImages,imagePath,frameCount,heroImage])
  const [frame,setFrame]=useState(0); const [used,setUsed]=useState(false); const [turn,setTurn]=useState(0); const drag=useRef<{x:number;frame:number;turn:number}|null>(null)
  useEffect(()=>{if(mode!=='spin'||used)return; const id=window.setInterval(()=>setFrame(v=>(v+1)%frames.length),260); return()=>clearInterval(id)},[mode,used,frames.length])
  const down=(x:number)=>{setUsed(true);drag.current={x,frame,turn}}
  const move=(x:number)=>{if(!drag.current)return; const delta=x-drag.current.x; if(mode==='spin')setFrame((drag.current.frame+Math.round(delta/12)+frames.length*20)%frames.length); if(mode==='model')setTurn(drag.current.turn+delta*.35)}
  const up=()=>{drag.current=null}
  return <div className="product-viewer" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);down(e.clientX)}} onPointerMove={e=>move(e.clientX)} onPointerUp={up} onPointerCancel={up}>
    <div className="product-halo" />
    {mode==='model'?<div className="model-stage" style={{transform:`translateY(-4px) rotateY(${turn}deg)`}} data-model={modelPath}><span className="model-orbit"/><img src={heroImage} alt={alt}/><small>GLB · STUDIO LIGHT</small></div>:<img draggable={false} className="viewer-image" src={mode==='spin'?frames[frame]:heroImage} alt={alt}/>}
    <SpinIndicator visible={!used&&mode!=='static'}/>
    <div className="viewer-badge">{mode==='spin'?`${String(frame+1).padStart(2,'0')} / ${frames.length} · 360°`:mode==='model'?'3D · DRAG':'PRODUCT VIEW'}</div>
  </div>
}
