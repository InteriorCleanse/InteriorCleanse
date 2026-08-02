'use client'
import dynamic from 'next/dynamic'
import type {Product} from '@/lib/types'
const ProductViewer=dynamic(()=>import('./ProductViewer'),{ssr:false,loading:()=><div className="product-viewer viewer-loading">Preparing object…</div>})
export function ViewerLoader({product}:{product:Product}){return <ProductViewer mode={product.viewer.mode} heroImage={product.heroImage} alt={product.name} spinImages={product.viewer.spinImages} modelPath={product.viewer.modelPath} frameCount={product.viewer.frameCount}/>}
