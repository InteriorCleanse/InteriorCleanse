'use client'

import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Per-category product bodies.
 *
 * Each category gets real proportions and a material tuned to how that surface
 * behaves in life — wax scatters and stays matte, glaze is smooth under a hard
 * clearcoat, canvas is rough with no specular to speak of. The shared
 * `<StudioEnvironment>` supplies the reflections these materials sample.
 */

export type StageCategory =
  | 'candle'
  | 'tote'
  | 'print'
  | 'mug'
  | 'custom'
  | 'cleaning'
  | 'book'

/** A wick flame: emissive core, warm halo, and a light that breathes. */
function Flame({ y }: { y: number }) {
  const light = useRef<THREE.PointLight>(null)
  const core = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Layered sines read as an irregular flicker; a single sine reads as a pulse.
    const flicker =
      Math.sin(t * 11) * 0.16 + Math.sin(t * 17.3) * 0.09 + Math.sin(t * 5.1) * 0.06
    // Kept modest on purpose: a hot wick light plus bloom blows the pale wax
    // out to a white blob and eats the whole frame.
    if (light.current) light.current.intensity = 2.2 + flicker * 3.4
    if (core.current) {
      core.current.scale.set(1 + flicker * 0.16, 1 + flicker * 0.3, 1 + flicker * 0.16)
    }
    if (halo.current) halo.current.scale.setScalar(1 + flicker * 0.22)
  })

  return (
    <group position={[0, y, 0]}>
      <mesh ref={halo}>
        <sphereGeometry args={[0.1, 20, 20]} />
        {/* Additive, or the halo reads as an opaque brown disc over the wax. */}
        <meshBasicMaterial
          color="#FF7A18"
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={core} scale={[1, 1.9, 1]}>
        <sphereGeometry args={[0.045, 20, 20]} />
        <meshBasicMaterial color="#FFE6AE" toneMapped={false} />
      </mesh>
      <pointLight ref={light} color="#FF9A3C" intensity={2.2} distance={3.4} decay={2} />
    </group>
  )
}

function Candle({ color }: { color: string }) {
  // Lathe profile: a slightly tapered vessel with a rolled lip.
  const profile = useMemo(
    () =>
      [
        [0, -1.2],
        [0.44, -1.2],
        [0.46, -1.1],
        [0.44, 0.85],
        [0.47, 0.95],
        [0.46, 1.02],
        [0.4, 1.02],
        [0.4, 0.9],
        [0, 0.9],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    []
  )

  return (
    <group>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 96]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.62}
          metalness={0}
          clearcoat={0.25}
          clearcoatRoughness={0.5}
          sheen={0.4}
          sheenColor="#FFF6E2"
          envMapIntensity={1.1}
        />
      </mesh>
      {/* Wax pool sits just below the lip. */}
      <mesh position={[0, 0.88, 0]} receiveShadow>
        <cylinderGeometry args={[0.39, 0.39, 0.04, 64]} />
        <meshPhysicalMaterial
          color="#F3E4C4"
          roughness={0.35}
          transmission={0.25}
          thickness={0.4}
          ior={1.45}
          envMapIntensity={1.4}
        />
      </mesh>
      <mesh position={[0, 0.96, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.14, 8]} />
        <meshStandardMaterial color="#2A2118" roughness={0.9} />
      </mesh>
      <Flame y={1.11} />
    </group>
  )
}

function Tote({ color }: { color: string }) {
  return (
    <group>
      <RoundedBox args={[1.55, 1.75, 0.42]} radius={0.06} smoothness={4} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={color}
          roughness={0.92}
          metalness={0}
          sheen={0.9}
          sheenRoughness={0.8}
          sheenColor="#EFE7D8"
          envMapIntensity={0.7}
        />
      </RoundedBox>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.34, 0.035, 16, 48, Math.PI]} />
          <meshPhysicalMaterial color={color} roughness={0.88} sheen={0.6} envMapIntensity={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function Print({ color }: { color: string }) {
  return (
    <group>
      {/* Frame */}
      <RoundedBox args={[1.5, 1.95, 0.07]} radius={0.012} smoothness={3} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#241F19"
          roughness={0.45}
          metalness={0.15}
          clearcoat={0.5}
          envMapIntensity={1}
        />
      </RoundedBox>
      {/* Mat + paper, inset so the frame reads as depth */}
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={[1.34, 1.79]} />
        <meshPhysicalMaterial color="#F7F4EF" roughness={0.95} envMapIntensity={0.5} />
      </mesh>
      <mesh position={[0, 0.04, 0.045]}>
        <planeGeometry args={[1.0, 1.35]} />
        <meshPhysicalMaterial color={color} roughness={0.9} envMapIntensity={0.5} />
      </mesh>
      {/* Glazing: a faint specular sheet is what makes it read as framed glass */}
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[1.34, 1.79]} />
        <meshPhysicalMaterial
          transparent
          opacity={0.12}
          roughness={0.03}
          metalness={0}
          clearcoat={1}
          envMapIntensity={2.2}
        />
      </mesh>
    </group>
  )
}

function Mug({ color }: { color: string }) {
  const profile = useMemo(
    () =>
      [
        [0, -0.5],
        [0.42, -0.5],
        [0.44, -0.44],
        [0.46, 0.44],
        [0.46, 0.5],
        [0.41, 0.5],
        [0.41, -0.4],
        [0, -0.4],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    []
  )

  return (
    <group>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 96]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.16}
          metalness={0.02}
          clearcoat={0.9}
          clearcoatRoughness={0.08}
          envMapIntensity={1.6}
        />
      </mesh>
      <mesh position={[0.56, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <torusGeometry args={[0.24, 0.055, 24, 64, Math.PI * 1.15]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.16}
          clearcoat={0.9}
          clearcoatRoughness={0.08}
          envMapIntensity={1.6}
        />
      </mesh>
      {/* Coffee surface — a dark, near-mirror disc reading as liquid */}
      <mesh position={[0, 0.34, 0]}>
        <circleGeometry args={[0.4, 64]} />
        <meshPhysicalMaterial
          color="#20120A"
          roughness={0.08}
          metalness={0.1}
          clearcoat={1}
          envMapIntensity={2}
        />
      </mesh>
    </group>
  )
}

function Hoodie({ color }: { color: string }) {
  return (
    <group>
      <RoundedBox args={[1.5, 1.5, 0.5]} radius={0.18} smoothness={5} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={color}
          roughness={0.95}
          metalness={0}
          sheen={1}
          sheenRoughness={0.9}
          sheenColor="#6E6357"
          envMapIntensity={0.6}
        />
      </RoundedBox>
      {/* Hood */}
      <mesh position={[0, 0.82, -0.12]} castShadow>
        <sphereGeometry args={[0.42, 32, 24, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.95}
          sheen={1}
          sheenRoughness={0.9}
          side={THREE.DoubleSide}
          envMapIntensity={0.6}
        />
      </mesh>
      {/* Sleeves */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * 0.92, 0.1, 0]}
          rotation={[0, 0, s * 0.35]}
          castShadow
        >
          <capsuleGeometry args={[0.21, 0.9, 8, 24]} />
          <meshPhysicalMaterial
            color={color}
            roughness={0.95}
            sheen={1}
            sheenRoughness={0.9}
            envMapIntensity={0.6}
          />
        </mesh>
      ))}
    </group>
  )
}

function Bottle({ color }: { color: string }) {
  const profile = useMemo(
    () =>
      [
        [0, -1.05],
        [0.42, -1.05],
        [0.44, -0.95],
        [0.44, 0.25],
        [0.36, 0.45],
        [0.16, 0.6],
        [0.15, 0.95],
        [0.19, 0.98],
        [0.19, 1.12],
        [0, 1.12],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    []
  )

  return (
    <group>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 96]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.12}
          metalness={0}
          transmission={0.55}
          thickness={0.9}
          ior={1.46}
          clearcoat={1}
          clearcoatRoughness={0.06}
          envMapIntensity={2}
        />
      </mesh>
      {/* Trigger head */}
      <mesh position={[0, 1.24, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.2, 0.24, 32]} />
        <meshPhysicalMaterial color="#2B2B2B" roughness={0.4} clearcoat={0.6} />
      </mesh>
      <mesh position={[0.2, 1.2, 0]} rotation={[0, 0, -0.5]} castShadow>
        <boxGeometry args={[0.3, 0.09, 0.12]} />
        <meshPhysicalMaterial color="#2B2B2B" roughness={0.4} clearcoat={0.6} />
      </mesh>
      {/* Label */}
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.451, 0.451, 0.7, 64, 1, true]} />
        <meshPhysicalMaterial
          color="#F7F4EF"
          roughness={0.85}
          side={THREE.DoubleSide}
          envMapIntensity={0.6}
        />
      </mesh>
    </group>
  )
}

function BookBody({ color }: { color: string }) {
  return (
    <group rotation={[0, -0.35, 0]}>
      <RoundedBox args={[1.3, 1.85, 0.24]} radius={0.02} smoothness={3} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={color}
          roughness={0.55}
          metalness={0.02}
          clearcoat={0.3}
          envMapIntensity={0.9}
        />
      </RoundedBox>
      {/* Page block, slightly inset from the boards */}
      <mesh position={[0.02, 0, 0]} castShadow>
        <boxGeometry args={[1.24, 1.78, 0.2]} />
        <meshPhysicalMaterial color="#EFE8DA" roughness={0.95} envMapIntensity={0.4} />
      </mesh>
    </group>
  )
}

export function ProductBody({
  category,
  color,
}: {
  category: StageCategory
  color: string
}) {
  switch (category) {
    case 'candle':
      return <Candle color={color} />
    case 'tote':
      return <Tote color={color} />
    case 'print':
      return <Print color={color} />
    case 'mug':
      return <Mug color={color} />
    case 'custom':
      return <Hoodie color={color} />
    case 'cleaning':
      return <Bottle color={color} />
    case 'book':
      return <BookBody color={color} />
    default:
      return (
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.85, 64, 64]} />
          <meshPhysicalMaterial
            color={color}
            roughness={0.2}
            clearcoat={0.6}
            envMapIntensity={1.5}
          />
        </mesh>
      )
  }
}
