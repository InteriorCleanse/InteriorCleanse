'use client'

import { useEffect, useRef, useState } from 'react'
import { centreDistance, claimPlayback } from '@/lib/video-director'

interface SceneBackgroundProps {
  /** Free camera drift applied to the poster. See lib/scenes PosterMotion. */
  posterMotion?: string
  desktopVideo?: string
  mobileVideo?: string
  /** Optional modern-format companion, offered ahead of the MP4 when present. */
  webmVideo?: string
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
  posterMotion,
  desktopVideo,
  mobileVideo,
  webmVideo,
  posterImage,
  reducedMotionPoster,
}: SceneBackgroundProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [near, setNear] = useState(false)
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

  /**
   * Only scenes approaching the viewport get a video element at all.
   *
   * Pages like /library and /shop stack three environment bands. Without this,
   * every band mounted its video one frame after paint and `preload="auto"`
   * pulled all three clips down at once — the director stopped them *playing*,
   * but the bytes were already on the wire. The margin is generous enough that
   * the clip is loaded and running by the time the band is actually reached.
   */
  useEffect(() => {
    const el = wrapRef.current
    if (!el || !src || near) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [src, near])

  // Eligibility is decided here; whether this video actually plays is decided
  // by the director, which allows exactly one across the whole page. Tab
  // visibility is handled there too, so it cannot disagree between scenes.
  useEffect(() => {
    const el = wrapRef.current
    const video = videoRef.current
    if (!el || !video || !src) return

    let release: (() => void) | null = null

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !release) {
          release = claimPlayback(video, () => centreDistance(el))
        } else if (!entry.isIntersecting && release) {
          release()
          release = null
        }
      },
      { threshold: 0.25 }
    )
    io.observe(el)

    return () => {
      io.disconnect()
      release?.()
    }
    // `near` is a dependency because the video element does not exist until it
    // flips — without it this observer would attach to nothing and no scene
    // below the fold would ever claim playback.
  }, [src, near])

  const poster = reducedMotionPoster ?? posterImage
  const showVideo = Boolean(src) && near && !failed

  return (
    <div className="scene-bg" ref={wrapRef} aria-hidden="true">
      {poster ? (
        <img
          src={poster}
          alt=""
          className="scene-poster"
          data-motion={posterMotion && posterMotion !== 'none' ? posterMotion : undefined}
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
        >
          {/* A modern source is offered first where the manifest declares one.
              It is not derived from the MP4 path: guessing a .webm that has not
              been produced would cost a guaranteed 404 on every scene. */}
          {webmVideo ? <source src={webmVideo} type="video/webm" /> : null}
          <source src={src!} type="video/mp4" />
        </video>
      ) : null}
    </div>
  )
}
