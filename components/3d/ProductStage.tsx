'use client'

import { ContactShadows, Float, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Suspense, useEffect, useState } from 'react'
import * as THREE from 'three'
import { ProductBody, type StageCategory } from './ProductGeometry'
import { StudioEnvironment } from './StudioEnvironment'

interface ProductStageProps {
  productColor?: string
  productName: string
  category: StageCategory
}

/**
 * The hyperrealistic single-product viewer.
 *
 * Rendered only in the browser (see ProductStageLoader) because r3f needs a
 * real WebGL context. Auto-rotates until the visitor takes hold of it, then
 * hands control over for good.
 */
export function ProductStage({
  productColor = '#F5EDD6',
  productName,
  category,
}: ProductStageProps) {
  const [interacted, setInteracted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  /** Bumping this remounts OrbitControls, which is how the view resets. */
  const [viewKey, setViewKey] = useState(0)
  const lit = category === 'candle'

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Auto-rotation stops for three separate reasons, and any one of them wins:
  // the visitor grabbed the object, they pressed pause, or they have asked the
  // system for reduced motion.
  const spinning = !interacted && !paused && !reduced

  const resetView = () => {
    setViewKey((k) => k + 1)
    setInteracted(false)
  }

  return (
    <div className="stage-container" onPointerDown={() => setInteracted(true)}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.35, 6.2], fov: 38 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.98,
        }}
        aria-label={`Interactive 3D view of ${productName}`}
      >
        <color attach="background" args={['#080806']} />
        <Suspense fallback={null}>
          <ambientLight intensity={0.16} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.7}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
          />
          <directionalLight position={[-4, 2, -4]} intensity={0.5} color="#A9895A" />
          <pointLight position={[0, -2, 3]} intensity={0.5} color="#F7F4EF" />

          <Float speed={1.2} rotationIntensity={0.12} floatIntensity={0.45}>
            <ProductBody category={category} color={productColor} />
          </Float>

          <ContactShadows
            position={[0, -1.35, 0]}
            opacity={0.55}
            scale={7}
            blur={2.6}
            far={3}
            color="#000000"
          />

          <StudioEnvironment />

          <OrbitControls
            key={viewKey}
            makeDefault
            enableZoom
            enablePan={false}
            autoRotate={spinning}
            autoRotateSpeed={1.4}
            minDistance={2.4}
            maxDistance={8}
            minPolarAngle={Math.PI / 5}
            maxPolarAngle={Math.PI / 1.75}
          />

          <EffectComposer>
            {/* A lit wick needs real bloom; everything else only wants a sheen. */}
            <Bloom
              intensity={lit ? 0.6 : 0.25}
              luminanceThreshold={lit ? 0.85 : 0.92}
              luminanceSmoothing={0.25}
              mipmapBlur
            />
            <Vignette offset={0.12} darkness={0.55} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      <div className="stage-hint">
        {interacted ? '360° · DRAG TO ROTATE · SCROLL TO ZOOM' : '◇ DRAG TO EXPLORE'}
      </div>

      <div className="stage-controls">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          disabled={reduced}
          title={reduced ? 'Motion is already off — reduced motion is enabled' : undefined}
        >
          {paused || reduced ? 'Play motion' : 'Pause motion'}
        </button>
        <button type="button" onClick={resetView}>
          Reset view
        </button>
      </div>
    </div>
  )
}
