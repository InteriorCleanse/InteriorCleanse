'use client'
import {useEffect,useRef,useState,type ReactNode} from 'react'

type Props={url:string;className?:string;lazyLoad?:boolean;fallback?:ReactNode}

/** Renders a Spline scene on a canvas once it scrolls into view, fading it in
 *  on load. Renders `fallback` (nothing by default) if the scene fails.
 *
 *  Drives @splinetool/runtime directly rather than @splinetool/react-spline:
 *  the React wrapper is ESM-only with no `require` condition in its exports,
 *  which webpack cannot resolve. The runtime ships both, and talking to it
 *  directly also lets a load failure be caught properly instead of being
 *  re-thrown through render. */
export function SplineScene({url,className='',lazyLoad=true,fallback=null}:Props){
  const [loaded,setLoaded]=useState(false); const [failed,setFailed]=useState(false)
  const [inView,setInView]=useState(!lazyLoad)
  const host=useRef<HTMLDivElement>(null); const canvas=useRef<HTMLCanvasElement>(null)

  useEffect(()=>{
    if(!lazyLoad||inView)return
    const el=host.current; if(!el)return
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setInView(true);obs.disconnect()}},{threshold:.1})
    obs.observe(el); return()=>obs.disconnect()
  },[lazyLoad,inView])

  useEffect(()=>{
    if(!inView)return
    const el=canvas.current; if(!el)return
    let app:{dispose():void}|undefined; let cancelled=false
    import('@splinetool/runtime').then(({Application})=>{
      if(cancelled)return
      const a=new Application(el); app=a
      return a.load(url).then(()=>{if(!cancelled)setLoaded(true)})
    }).catch(()=>{if(!cancelled)setFailed(true)})
    return()=>{cancelled=true;app?.dispose()}
  },[inView,url])

  if(failed)return <>{fallback}</>
  return <div ref={host} className={`spline-wrapper ${className} ${loaded?'is-loaded':''}`} aria-hidden="true">
    {inView&&<canvas ref={canvas}/>}
  </div>
}
