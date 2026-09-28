'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A product's real 3D model on the detail-page stage.
 *
 * Loads a GLB scanned from the product's own photograph, frames it, and lets
 * it turn slowly until touched; then the visitor drives. Transparent canvas,
 * so the scene behind the stage stays the scene. The engine and the glTF
 * loader are imported on demand, so no page that lacks a model pays for them.
 */
export function GlbStage({ url, name, poster }: { url: string; name: string; poster?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let disposed = false
    let engine: { dispose(): void; resize(): void } | undefined
    const onResize = () => engine?.resize()

    ;(async () => {
      const [core] = await Promise.all([import('@babylonjs/core'), import('@babylonjs/loaders/glTF')])
      const canvas = canvasRef.current
      if (disposed || !canvas) return
      const { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color4, SceneLoader } = core
      const eng = new Engine(canvas, true, { alpha: true, antialias: true })
      engine = eng
      const scene = new Scene(eng)
      scene.clearColor = new Color4(0, 0, 0, 0)

      const camera = new ArcRotateCamera('camera', Math.PI / 4, Math.PI / 2.4, 4, Vector3.Zero(), scene)
      camera.attachControl(canvas, true)
      camera.wheelPrecision = 60
      camera.minZ = 0.01
      camera.useAutoRotationBehavior = true
      if (camera.autoRotationBehavior) {
        camera.autoRotationBehavior.idleRotationSpeed = 0.22
        camera.autoRotationBehavior.idleRotationWaitTime = 2500
      }
      new HemisphericLight('sky', new Vector3(0, 1, 0), scene).intensity = 1.05
      const key = new DirectionalLight('key', new Vector3(-1, -2, -1), scene)
      key.intensity = 1.1

      try {
        const result = await SceneLoader.ImportMeshAsync('', url, '', scene, undefined, '.glb')
        if (disposed) return
        let min: InstanceType<typeof Vector3> | null = null
        let max: InstanceType<typeof Vector3> | null = null
        for (const m of result.meshes) {
          if (m.getTotalVertices() === 0) continue
          const b = m.getHierarchyBoundingVectors()
          min = min ? Vector3.Minimize(min, b.min) : b.min
          max = max ? Vector3.Maximize(max, b.max) : b.max
        }
        if (min && max) {
          const size = max.subtract(min).length()
          camera.target = min.add(max).scale(0.5)
          camera.radius = size * 1.35
          camera.lowerRadiusLimit = size * 0.6
          camera.upperRadiusLimit = size * 3
        }
        setState('ready')
      } catch {
        setState('error')
      }

      eng.runRenderLoop(() => scene.render())
      window.addEventListener('resize', onResize)
    })()

    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      engine?.dispose()
    }
  }, [url])

  return (
    <div className="glb-stage" data-state={state}>
      {poster ? <img src={poster} alt="" className="glb-poster" aria-hidden="true" /> : null}
      <canvas ref={canvasRef} className="glb-canvas" aria-label={`${name}, 3D model. Drag to rotate, scroll to zoom.`} />
      <span className="glb-status" aria-live="polite">
        {state === 'loading' ? 'Loading the 3D model' : state === 'error' ? '3D preview unavailable' : 'Drag to rotate · scroll to zoom'}
      </span>
    </div>
  )
}
