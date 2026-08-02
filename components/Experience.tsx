'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export function Experience(){
  const cursor=useRef<HTMLDivElement>(null); const path=usePathname()
  useEffect(()=>{document.body.classList.remove('page-enter');requestAnimationFrame(()=>document.body.classList.add('page-enter'))},[path])
  useEffect(()=>{let x=-20,y=-20,tx=-20,ty=-20,id=0; const move=(e:MouseEvent)=>{tx=e.clientX;ty=e.clientY}; const tick=()=>{x+=(tx-x)*.12;y+=(ty-y)*.12;if(cursor.current)cursor.current.style.transform=`translate3d(${x}px,${y}px,0)`;id=requestAnimationFrame(tick)}; window.addEventListener('mousemove',move);tick();return()=>{removeEventListener('mousemove',move);cancelAnimationFrame(id)}},[])
  useEffect(()=>{const els=Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('revealed')}),{threshold:.12});els.forEach(e=>io.observe(e));return()=>io.disconnect()},[path])
  return <div ref={cursor} className="magnetic-cursor"/>
}
