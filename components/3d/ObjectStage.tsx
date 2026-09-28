'use client'

import { useEffect, useRef, useState } from 'react'

export type StageObject =
  | { kind: 'book'; cover: string; spineColor: string; title: string }
  | { kind: 'print'; artwork: string }

/**
 * A 3D stand-in built from the product's own flat artwork, for products whose
 * shape is simple enough to model exactly: a paperback (cover, spine, page
 * block) or an unframed print (one sheet of heavyweight paper).
 *
 * Nothing here is invented. The front of the book is the real cover and the
 * face of the sheet is the real print file; the rest is paper and card in the
 * product's own colour. Until the image arrives, and if it never does, the flat
 * poster stays in place, so the stage can only ever add to the page. The
 * engine is imported inside the effect, so the server renders the poster and
 * pages without this stage never download Babylon.
 */
export function ObjectStage({ object, name, poster, posterAlt }: { object: StageObject; name: string; poster: string; posterAlt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  // Keyed on content, not identity: a parent re-render hands over a new object
  // literal with the same fields, and that must not rebuild the scene.
  const key = JSON.stringify(object)

  useEffect(() => {
    const object = JSON.parse(key) as StageObject
    let disposed = false
    let engine: { dispose(): void; resize(): void } | undefined
    const onResize = () => engine?.resize()

    ;(async () => {
      const core = await import('@babylonjs/core')
      const canvas = canvasRef.current
      if (disposed || !canvas) return
      const {
        Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color3, Color4,
        MeshBuilder, StandardMaterial, Texture, DynamicTexture, TransformNode,
      } = core

      const eng = new Engine(canvas, true, { alpha: true, antialias: true, preserveDrawingBuffer: false })
      engine = eng
      const scene = new Scene(eng)
      scene.clearColor = new Color4(0, 0, 0, 0)

      const book = object.kind === 'book'
      const W = 1.2
      const H = book ? 1.8 : 1.6
      const D = book ? 0.2 : 0.008

      // A long lens from further back: the object fills the frame without the
      // near edge swelling the way a wide lens makes it.
      const fov = 0.5
      const fill = book ? 0.66 : 0.72
      const radius = H / fill / (2 * Math.tan(fov / 2))
      const camera = new ArcRotateCamera('camera', -Math.PI / 2 - (book ? 0.55 : 0.35), Math.PI / 2.15, radius, Vector3.Zero(), scene)
      camera.fov = fov
      camera.attachControl(canvas, true)
      // Babylon sets tabIndex = 1, which jumps the canvas ahead of the page's own
      // reading order. Keep it focusable for keyboard orbiting, in order.
      canvas.tabIndex = 0
      camera.wheelPrecision = 60
      camera.minZ = 0.01
      camera.lowerRadiusLimit = radius * 0.6
      camera.upperRadiusLimit = radius * 1.8
      camera.lowerBetaLimit = 0.35
      camera.upperBetaLimit = Math.PI - 0.35
      camera.useAutoRotationBehavior = true
      if (camera.autoRotationBehavior) {
        camera.autoRotationBehavior.idleRotationSpeed = 0.2
        camera.autoRotationBehavior.idleRotationWaitTime = 2500
      }

      const sky = new HemisphericLight('sky', new Vector3(0.2, 1, -0.4), scene)
      sky.intensity = 0.95
      sky.groundColor = new Color3(0.55, 0.52, 0.48)
      const keyLight = new DirectionalLight('key', new Vector3(0.6, -0.5, 1), scene)
      keyLight.intensity = 0.55

      const matte = (name: string, color: string) => {
        const m = new StandardMaterial(name, scene)
        m.diffuseColor = Color3.FromHexString(color)
        m.specularColor = new Color3(0.04, 0.04, 0.04)
        return m
      }

      const root = new TransformNode('object', scene)
      const paper = book ? '#F1EADB' : '#F2ECE0'

      // Body: the page block of the book, or the thickness of the sheet.
      const body = MeshBuilder.CreateBox('body', book
        ? { width: W - 0.03, height: H - 0.035, depth: D - 0.012 }
        : { width: W, height: H, depth: D }, scene)
      body.position.x = book ? 0.015 : 0
      body.material = matte('paper', paper)
      body.parent = root

      // Face: the real cover or the real print, on the side the camera meets.
      const face = MeshBuilder.CreatePlane('face', { width: W, height: H }, scene)
      face.position.z = -D / 2 - 0.0015
      face.parent = root
      const faceMat = new StandardMaterial('face', scene)
      faceMat.specularColor = new Color3(0.05, 0.05, 0.05)
      face.material = faceMat

      // Back: card in the book's own colour, or the plain back of the paper.
      const back = MeshBuilder.CreatePlane('back', { width: W, height: H }, scene)
      back.position.z = D / 2 + 0.0015
      back.rotation.y = Math.PI
      back.material = matte('back', book ? object.spineColor : paper)
      back.parent = root

      if (book) {
        const spine = MeshBuilder.CreatePlane('spine', { width: D, height: H }, scene)
        spine.position.x = -W / 2 - 0.0015
        spine.rotation.y = Math.PI / 2
        spine.parent = root
        const tex = new DynamicTexture('spine', { width: 192, height: 1728 }, scene, true)
        const ctx = tex.getContext() as unknown as CanvasRenderingContext2D
        const css = getComputedStyle(document.documentElement)
        const display = css.getPropertyValue('--font-display').trim() || 'Georgia, serif'
        const sans = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
        try { await document.fonts?.ready } catch { /* fonts are a nicety */ }
        if (disposed) return
        ctx.fillStyle = object.spineColor
        ctx.fillRect(0, 0, 192, 1728)
        ctx.save()
        ctx.translate(96, 110)
        ctx.rotate(Math.PI / 2)
        ctx.fillStyle = '#F4EEE2'
        ctx.textBaseline = 'middle'
        let size = 74
        ctx.font = `400 ${size}px ${display}`
        while (ctx.measureText(object.title).width > 1340 && size > 40) {
          size -= 2
          ctx.font = `400 ${size}px ${display}`
        }
        ctx.fillText(object.title, 0, 0)
        ctx.restore()
        ctx.save()
        ctx.translate(96, 1640)
        ctx.rotate(Math.PI / 2)
        ctx.fillStyle = 'rgba(244, 238, 226, 0.75)'
        ctx.font = `600 26px ${sans}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText('INTERIORCLEANSE', 0, 0)
        ctx.restore()
        tex.update()
        const spineMat = new StandardMaterial('spine', scene)
        spineMat.diffuseTexture = tex
        spineMat.specularColor = new Color3(0.04, 0.04, 0.04)
        spine.material = spineMat
      }

      const src = object.kind === 'book' ? object.cover : object.artwork
      const faceTex = new Texture(
        src, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE,
        () => { if (!disposed) setState('ready') },
        () => { if (!disposed) setState('error') },
      )
      faceTex.anisotropicFilteringLevel = 8
      faceMat.diffuseTexture = faceTex

      eng.runRenderLoop(() => scene.render())
      window.addEventListener('resize', onResize)
    })()

    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      engine?.dispose()
    }
  }, [key])

  return (
    <div className="glb-stage object-stage" data-state={state} data-kind={object.kind}>
      <img src={poster} alt={posterAlt} className="glb-poster" />
      <canvas ref={canvasRef} className="glb-canvas" aria-label={`${name}, in 3D. Drag to rotate, scroll to zoom.`} />
      <span className="glb-status" aria-live="polite">
        {state === 'ready' ? 'Drag to rotate · scroll to zoom' : state === 'loading' ? 'Opening in 3D' : ''}
      </span>
    </div>
  )
}
