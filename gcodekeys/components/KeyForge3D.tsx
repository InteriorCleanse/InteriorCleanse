'use client'

import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  OrbitControls,
  Environment,
  Lightformer,
  ContactShadows,
  RoundedBox,
  Float,
  Center,
} from '@react-three/drei'
import * as THREE from 'three'
import type { FamilyId } from '@/lib/keyFamilies'

// A real, configurable 3D car-key fob built procedurally — no per-car model
// files, so it works for any vehicle. Finish drives the physical material;
// family drives the blade and silhouette; engraving is drawn to a canvas
// texture (no web-font fetch, so it renders anywhere).

type Finish = 'gloss' | 'matte' | 'carbon' | 'chrome'

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt))
  const b = Math.max(0, Math.min(255, (n & 255) + amt))
  return `rgb(${r},${g},${b})`
}

function materialFor(finish: Finish, hex: string): THREE.MeshPhysicalMaterialParameters {
  switch (finish) {
    case 'chrome':
      return { color: '#eef2f6', metalness: 1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 }
    case 'carbon':
      return { color: shade(hex, -90), metalness: 0.65, roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.25, envMapIntensity: 1.1 }
    case 'matte':
      return { color: hex, metalness: 0.08, roughness: 0.78, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.6 }
    case 'gloss':
    default:
      return { color: hex, metalness: 0.32, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.25 }
  }
}

const METAL: THREE.MeshStandardMaterialParameters = { color: '#cfd6dd', metalness: 1, roughness: 0.22 }

// Blade length by family. Supercar keys are OEM (shell only) → no blade.
const BLADE: Record<FamilyId, number> = {
  smart: 0.55, remotehead: 1.5, flip: 1.4, bmw: 0.5, mercedes: 0.55, porsche: 0.6, supercar: 0, luxury: 0.55,
}

function engravingTexture(text: string, accent: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 320
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, c.width, c.height)
  const t = (text || '').toUpperCase().slice(0, 12)
  if (t) {
    ctx.fillStyle = accent
    ctx.font = '700 150px "Chakra Petch", ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, c.width / 2, c.height / 2 + 8)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

function Button({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.13, 0.13, 0.05, 32]} />
      <meshStandardMaterial color="#0c120f" metalness={0.4} roughness={0.5} emissive="#0a1f14" emissiveIntensity={0.6} />
    </mesh>
  )
}

function Key({ family, hex, finish, engrave, accent }: { family: FamilyId; hex: string; finish: Finish; engrave: string; accent: string }) {
  const body = useMemo(() => materialFor(finish, hex), [finish, hex])
  const engTex = useMemo(() => engravingTexture(engrave, accent), [engrave, accent])
  const bladeLen = BLADE[family] ?? 0.55

  return (
    <group>
      {/* Fob body */}
      <RoundedBox args={[1.35, 2.15, 0.34]} radius={0.18} smoothness={6} castShadow receiveShadow>
        <meshPhysicalMaterial {...body} />
      </RoundedBox>

      {/* Recessed face panel (gloss black, button bed) */}
      <RoundedBox args={[1.08, 1.78, 0.04]} radius={0.12} smoothness={5} position={[0, 0.05, 0.16]}>
        <meshPhysicalMaterial color="#05080b" metalness={0.5} roughness={0.25} clearcoat={1} clearcoatRoughness={0.08} />
      </RoundedBox>

      {/* Buttons */}
      <Button position={[0, 0.58, 0.18]} />
      <Button position={[0, 0.16, 0.18]} />
      <Button position={[0, -0.26, 0.18]} />

      {/* Engraving (user text) on the lower face */}
      {engTex ? (
        <mesh position={[0, -0.64, 0.19]}>
          <planeGeometry args={[0.92, 0.29]} />
          <meshStandardMaterial map={engTex} transparent metalness={0.7} roughness={0.3} emissive={accent} emissiveIntensity={0.12} toneMapped={false} />
        </mesh>
      ) : null}

      {/* Key ring */}
      <mesh position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.17, 0.055, 20, 44]} />
        <meshStandardMaterial {...METAL} />
      </mesh>

      {/* Emergency blade / cut key */}
      {bladeLen > 0 ? (
        <group position={[0, -1.07 - bladeLen / 2, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.2, bladeLen, 0.045]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
          {/* Cut teeth on one edge */}
          <mesh position={[0.1, -bladeLen * 0.1, 0]} castShadow>
            <boxGeometry args={[0.05, bladeLen * 0.7, 0.05]} />
            <meshStandardMaterial color="#aeb6bd" metalness={1} roughness={0.35} />
          </mesh>
        </group>
      ) : null}
    </group>
  )
}

function Rig({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (reduced || !ref.current) return
    // Subtle parallax toward the pointer for a premium, alive feel.
    const x = state.pointer.x * 0.25
    const y = state.pointer.y * 0.18
    ref.current.rotation.y += (x - ref.current.rotation.y) * 0.04
    ref.current.rotation.x += (-y - ref.current.rotation.x) * 0.04
  })
  return <group ref={ref}>{children}</group>
}

export default function KeyForge3D({
  family = 'smart',
  color = '#15e37a',
  finish = 'gloss',
  engrave = '',
  accent = '#6bffbb',
}: {
  family?: FamilyId
  color?: string
  finish?: Finish
  engrave?: string
  accent?: string
}) {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5.2], fov: 36 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.7} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 2, -3]} intensity={0.6} color={accent} />
      <spotLight position={[0, 5, 2]} angle={0.5} penumbra={1} intensity={0.8} />

      <Rig reduced={reduced}>
        <Float speed={reduced ? 0 : 1.1} rotationIntensity={reduced ? 0 : 0.25} floatIntensity={reduced ? 0 : 0.4}>
          <Center>
            <Key family={family} hex={color} finish={finish} engrave={engrave} accent={accent} />
          </Center>
        </Float>
      </Rig>

      <ContactShadows position={[0, -2.1, 0]} opacity={0.55} blur={2.6} scale={9} far={5} />

      {/* Self-contained studio reflections — built in-GPU, no external HDR. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2.4} position={[0, 3, 3]} scale={[7, 7, 1]} />
        <Lightformer intensity={1.1} color={accent} position={[-4, 1, -2]} scale={[5, 5, 1]} />
        <Lightformer intensity={1.4} position={[4, -1, 2]} scale={[5, 5, 1]} />
        <Lightformer intensity={0.8} position={[0, -3, -2]} scale={[8, 3, 1]} />
      </Environment>

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={3.6}
        maxDistance={7.5}
        autoRotate={!reduced}
        autoRotateSpeed={0.85}
        enableDamping
        minPolarAngle={Math.PI / 2.6}
        maxPolarAngle={Math.PI / 1.7}
      />
    </Canvas>
  )
}
