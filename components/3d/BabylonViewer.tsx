'use client'

import { useEffect, useRef } from 'react'

interface BabylonViewerProps {
  productColor?: string
  accentColor?: string
  label?: string
  height?: number | string
}

/**
 * A Babylon.js scene, kept deliberately separate from the React Three Fiber
 * viewers.
 *
 * Babylon and three are two full renderers; shipping both on one route would
 * double the 3D payload for no gain. This one is code-split onto the Spirit
 * page alone, where its PBR + glow pipeline draws the halo effect that page
 * wants. Every import is a deep module path so the tree-shaker can drop the
 * rest of the engine.
 */
export function BabylonViewer({
  productColor = '#C4A8E8',
  accentColor = '#D4AF6A',
  label = '◇ DRAG TO ROTATE · SCROLL TO ZOOM',
  height = 460,
}: BabylonViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let engine: import('@babylonjs/core/Engines/engine').Engine | undefined
    let onResize: (() => void) | undefined
    let cancelled = false

    Promise.all([
      import('@babylonjs/core/Engines/engine'),
      import('@babylonjs/core/scene'),
      import('@babylonjs/core/Meshes/meshBuilder'),
      import('@babylonjs/core/Lights/hemisphericLight'),
      import('@babylonjs/core/Lights/pointLight'),
      import('@babylonjs/core/Cameras/arcRotateCamera'),
      import('@babylonjs/core/Materials/PBR/pbrMaterial'),
      import('@babylonjs/core/Materials/standardMaterial'),
      import('@babylonjs/core/Maths/math.vector'),
      import('@babylonjs/core/Maths/math.color'),
      import('@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'),
    ]).then(
      ([
        { Engine },
        { Scene },
        { MeshBuilder },
        { HemisphericLight },
        { PointLight },
        { ArcRotateCamera },
        { PBRMaterial },
        { StandardMaterial },
        { Vector3 },
        { Color3, Color4 },
        { DefaultRenderingPipeline },
      ]) => {
        if (cancelled) return

        engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
        const scene = new Scene(engine)
        scene.clearColor = new Color4(0.059, 0.039, 0.118, 1)

        const camera = new ArcRotateCamera(
          'camera',
          -Math.PI / 2,
          Math.PI / 2.6,
          6,
          Vector3.Zero(),
          scene
        )
        camera.attachControl(canvas, true)
        camera.lowerRadiusLimit = 3.5
        camera.upperRadiusLimit = 11
        camera.wheelDeltaPercentage = 0.01
        camera.useAutoRotationBehavior = true
        if (camera.autoRotationBehavior) {
          camera.autoRotationBehavior.idleRotationSpeed = 0.18
          camera.autoRotationBehavior.idleRotationWaitTime = 1200
        }

        const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene)
        hemi.intensity = 0.45
        hemi.groundColor = Color3.FromHexString('#1A1030')

        const key = new PointLight('key', new Vector3(3, 4, -3), scene)
        key.intensity = 60
        key.diffuse = Color3.FromHexString(accentColor)

        const rim = new PointLight('rim', new Vector3(-4, 1, 3), scene)
        rim.intensity = 40
        rim.diffuse = Color3.FromHexString(productColor)

        const mat = new PBRMaterial('orb', scene)
        mat.albedoColor = Color3.FromHexString(productColor)
        mat.metallic = 0.25
        mat.roughness = 0.18
        mat.clearCoat.isEnabled = true
        mat.clearCoat.intensity = 0.8
        mat.subSurface.isRefractionEnabled = false

        const orb = MeshBuilder.CreateSphere('orb', { diameter: 2.6, segments: 64 }, scene)
        orb.material = mat

        // A pair of slim rings, echoing the brass motif elsewhere on the site.
        const ringMat = new StandardMaterial('ring', scene)
        ringMat.emissiveColor = Color3.FromHexString(accentColor).scale(0.28)
        ringMat.diffuseColor = Color3.FromHexString(accentColor)

        const rings = [1.95, 2.35].map((radius, i) => {
          const ring = MeshBuilder.CreateTorus(
            `ring-${i}`,
            { diameter: radius * 2, thickness: 0.022, tessellation: 128 },
            scene
          )
          ring.material = ringMat
          ring.rotation.x = Math.PI / 2.4 + i * 0.3
          return ring
        })

        const pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [camera])
        pipeline.bloomEnabled = true
        // Restrained: a low threshold here turns the ring highlights into blobs.
        pipeline.bloomThreshold = 0.88
        pipeline.bloomWeight = 0.3
        pipeline.bloomKernel = 48
        pipeline.imageProcessing.vignetteEnabled = true
        pipeline.imageProcessing.vignetteWeight = 2.4

        scene.registerBeforeRender(() => {
          const t = performance.now() * 0.001
          orb.position.y = Math.sin(t * 0.8) * 0.12
          rings.forEach((ring, i) => {
            ring.rotation.z += 0.0016 * (i % 2 === 0 ? 1 : -1)
            ring.position.y = orb.position.y * 0.6
          })
        })

        engine.runRenderLoop(() => scene.render())

        onResize = () => engine?.resize()
        window.addEventListener('resize', onResize)
      }
    )

    return () => {
      cancelled = true
      if (onResize) window.removeEventListener('resize', onResize)
      engine?.stopRenderLoop()
      engine?.dispose()
    }
  }, [productColor, accentColor])

  return (
    <div className="stage-container" style={{ height }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', outline: 'none' }}
        aria-label="Interactive 3D scene"
      />
      <div className="stage-hint">{label}</div>
    </div>
  )
}
