'use client'

import { Float, MeshTransmissionMaterial } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { StudioEnvironment } from './StudioEnvironment'

/** Eases the whole scene toward the pointer for a subtle parallax. */
function PointerParallax({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const { viewport } = useThree()

  useFrame((state, delta) => {
    if (!group.current) return
    const x = (state.pointer.x * viewport.width) / 42
    const y = (state.pointer.y * viewport.height) / 42
    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, x, 3, delta)
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, y, 3, delta)
    group.current.rotation.y = THREE.MathUtils.damp(
      group.current.rotation.y,
      state.pointer.x * 0.14,
      3,
      delta
    )
  })

  return <group ref={group}>{children}</group>
}

function Prism() {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (mesh.current) {
      mesh.current.rotation.y += delta * 0.16
      mesh.current.rotation.x += delta * 0.05
    }
  })

  return (
    <mesh ref={mesh} position={[1.6, 0.3, 0]}>
      <icosahedronGeometry args={[1.25, 0]} />
      {/* Real refraction is what separates "glass" from "grey plastic". */}
      <MeshTransmissionMaterial
        samples={6}
        resolution={256}
        thickness={1.1}
        roughness={0.08}
        ior={1.6}
        chromaticAberration={0.35}
        anisotropy={0.2}
        distortion={0.15}
        distortionScale={0.3}
        temporalDistortion={0.1}
        color="#F7F4EF"
      />
    </mesh>
  )
}

function BrassRing({
  radius,
  tube,
  position,
  speed,
}: {
  radius: number
  tube: number
  position: [number, number, number]
  speed: number
}) {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.z += delta * speed
  })

  return (
    <mesh ref={mesh} position={position} rotation={[Math.PI / 2.6, 0.3, 0]}>
      <torusGeometry args={[radius, tube, 32, 128]} />
      <meshPhysicalMaterial
        color="#A9895A"
        roughness={0.22}
        metalness={1}
        clearcoat={0.6}
        envMapIntensity={2.2}
      />
    </mesh>
  )
}

function Orb() {
  return (
    <Float speed={1.4} rotationIntensity={0.3} floatIntensity={0.7}>
      <mesh position={[3.1, -1.1, -1.4]}>
        <sphereGeometry args={[0.6, 64, 64]} />
        <meshPhysicalMaterial
          color="#5B6357"
          roughness={0.14}
          metalness={0.3}
          clearcoat={1}
          clearcoatRoughness={0.05}
          envMapIntensity={1.8}
        />
      </mesh>
    </Float>
  )
}

/**
 * The homepage hero backdrop: a slow-turning glass prism ringed in brass.
 * Deliberately abstract — the headline is the subject, this is the light
 * behind it.
 */
export function HeroScene() {
  return (
    <div className="hero-canvas">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#0A0A0A']} />
          <ambientLight intensity={0.25} />
          <directionalLight position={[4, 6, 4]} intensity={2} />
          <pointLight position={[-4, -1, 2]} color="#A9895A" intensity={2.5} />

          <PointerParallax>
            <Float speed={1.1} rotationIntensity={0.2} floatIntensity={0.5}>
              <Prism />
            </Float>
            <BrassRing radius={2.2} tube={0.02} position={[1.6, 0.3, -0.5]} speed={0.12} />
            <BrassRing radius={2.9} tube={0.014} position={[1.6, 0.3, -1]} speed={-0.08} />
            <Orb />
          </PointerParallax>

          <StudioEnvironment />

          <EffectComposer>
            <Bloom intensity={0.7} luminanceThreshold={0.75} luminanceSmoothing={0.35} mipmapBlur />
            <Vignette offset={0.2} darkness={0.7} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  )
}
