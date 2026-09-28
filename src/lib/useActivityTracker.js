import { useEffect } from 'react'
import { reportActivity } from '../api/team.js'

const IDLE_AFTER_MS = 5 * 60_000

/**
 * While the signed-in employee is using the system, tell the database once a minute (migration 017).
 * A hidden tab, or no mouse / keyboard / touch for 5 minutes, counts as not working.
 */
export function useActivityTracker(enabled) {
  useEffect(() => {
    if (!enabled) return
    let lastInput = Date.now()
    const mark = () => {
      lastInput = Date.now()
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    const beat = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_AFTER_MS) reportActivity()
    }
    beat()
    const timer = setInterval(beat, 60_000)
    return () => {
      clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, mark))
    }
  }, [enabled])
}
