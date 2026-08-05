'use client'

import { Environment, Lightformer } from '@react-three/drei'

/**
 * A studio lighting rig built from lightformers rather than a downloaded HDRI.
 *
 * drei's `Environment preset=` pulls a multi-megabyte .hdr from a third-party
 * CDN at runtime; on a static export that is both a slow first paint and an
 * external dependency we don't control. Rendering our own emissive planes into
 * the environment map gives the same soft, wrapping reflections — the thing
 * that actually sells a material as real — with nothing to fetch.
 *
 * `frames={1}` bakes it once instead of re-rendering the cube camera per frame.
 */
export function StudioEnvironment({ tint = '#A9895A' }: { tint?: string }) {
  return (
    <Environment resolution={256} frames={1}>
      {/* Key: broad softbox above and slightly forward. */}
      <Lightformer
        form="rect"
        intensity={6}
        position={[0, 5, 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[8, 6, 1]}
        color="#FFFFFF"
      />
      {/* Rim: a tall strip behind-left, warmed to brass for edge definition. */}
      <Lightformer
        form="rect"
        intensity={4}
        position={[-5, 1, -4]}
        rotation={[0, Math.PI / 3, 0]}
        scale={[3, 8, 1]}
        color={tint}
      />
      {/* Fill: cool and weak, opposite the key, to keep shadows from going flat. */}
      <Lightformer
        form="rect"
        intensity={1.6}
        position={[5, 0, 3]}
        rotation={[0, -Math.PI / 3, 0]}
        scale={[4, 5, 1]}
        color="#C9D6E5"
      />
      {/* Ground bounce. */}
      <Lightformer
        form="circle"
        intensity={1.2}
        position={[0, -4, 1]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={6}
        color="#F7F4EF"
      />
    </Environment>
  )
}
