'use client'
import dynamic from 'next/dynamic'
import {Component,useEffect,useRef,useState,type ReactNode} from 'react'

const Spline=dynamic(()=>import('@splinetool/react-spline'),{ssr:false,loading:()=><div className="spline-loading"/>})

/** @splinetool/react-spline re-throws scene load failures during render, so a bad
 *  URL or offline CDN would take down the tree. Only a boundary catches that. */
class SplineBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?<>{this.props.fallback}</>:this.props.children}
}

type Props={url:string;className?:string;lazyLoad?:boolean;fallback?:ReactNode}

/** Mounts a Spline scene once it scrolls into view, fading it in on load.
 *  Renders `fallback` (nothing by default) if the scene fails. */
export function SplineScene({url,className='',lazyLoad=true,fallback=null}:Props){
  const [loaded,setLoaded]=useState(false)
  const [inView,setInView]=useState(!lazyLoad); const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!lazyLoad||inView)return
    const el=ref.current; if(!el)return
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setInView(true);obs.disconnect()}},{threshold:.1})
    obs.observe(el); return()=>obs.disconnect()
  },[lazyLoad,inView])
  return <div ref={ref} className={`spline-wrapper ${className} ${loaded?'is-loaded':''}`} aria-hidden="true">
    <SplineBoundary fallback={fallback}>
      {inView&&<Spline scene={url} onLoad={()=>setLoaded(true)}/>}
    </SplineBoundary>
  </div>
}
