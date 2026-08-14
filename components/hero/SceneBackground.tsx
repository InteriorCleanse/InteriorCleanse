'use client'

import { useEffect, useRef, useState } from 'react'

interface SceneBackgroundProps {
  desktopVideo?: string
  mobileVideo?: string
  posterImage?: string
  reducedMotionPoster?: string
}

/** Below this the mobile cut is used; matches the CSS breakpoint. */
const MOBILE_QUERY = '(max-width: 767px)'

/**
 * Layer A — the hero background.
 *
 * Every prop is optional and the poster is the base state, so the hero is
 * complete with no video files in the repository at all. Video is strictly a
 * progressive enhancement layered on top of a poster that has already painted.
 *
 * The video element is not rendered on the first pass. It mounts only after the
 * poster has painted, which keeps the video request off the critical path
 * entirely — `preload="none"` alone would still put the element in the initial
 * HTML and let the browser speculate about it.
 */
export function SceneBackground({
  desktopVideo,
  mobileVideo,
  posterImage,
  reducedMotionPoster,
}: SceneBackgroundProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Decide whether video is wanted at all, and which cut, after mount.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mobile = window.matchMedia(MOBILE_QUERY)

    const pick = () => {
      if (reduced.matches) return setSrc(null)
      const chosen = mobile.matches ? mobileVideo ?? desktopVideo : desktopVideo ?? mobileVideo
      setSrc(chosen ?? null)
    }

    // One frame after paint: the poster is up before the video is even created.
    const id = window.requestAnimationFrame(pick)
    reduced.addEventListener('change', pick)
    mobile.addEventListener('change', pick)
    return () => {
      window.cancelAnimationFrame(id)
      reduced.removeEventListener('change', pick)
      mobile.removeEventListener('change', pick)
    }
  }, [desktopVideo, mobileVideo])

  // Pause offscreen and when the tab is hidden. A hero video that keeps
  // decoding behind another tab is pure battery cost.
  useEffect(() => {
    const el = wrapRef.current
    const video = videoRef.current
    if (!el || !video || !src) return

    let onscreen = true

    const apply = () => {
      if (onscreen && !document.hidden) video.play().catch(() => {})
      else video.pause()
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        onscreen = entry.isIntersecting
        apply()
      },
      { threshold: 0.1 }
    )
    io.observe(el)
    document.addEventListener('visibilitychange', apply)

    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', apply)
    }
  }, [src])

  const poster = reducedMotionPoster ?? posterImage
  const showVideo = Boolean(src) && !failed

  return (
    <div className="scene-bg" ref={wrapRef} aria-hidden="true">
      {poster ? (
        <img
          src={poster}
          alt=""
          className="scene-poster"
          // The poster is the LCP candidate; nothing should outrank it.
          fetchPriority="high"
          decoding="async"
          onError={(e) => {
            // No poster file yet — fall through to the painted gradient.
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}

      {showVideo ? (
        <video
          ref={videoRef}
          className="scene-video"
          data-ready={ready ? 'true' : undefined}
          src={src ?? undefined}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          // Never carries audio; muted is not enough on its own for some
          // browsers' autoplay heuristics, so the track is disabled outright.
          disablePictureInPicture
          preload="auto"
          onCanPlay={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  )
}
