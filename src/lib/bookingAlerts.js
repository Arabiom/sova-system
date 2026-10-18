// New booking requests (from /book and the Instagram page /links/): a short sound, and a
// browser notification when the system is open in a tab the user is not looking at.

const KEY = 'sova.alerts'

/** Alerts are on unless switched off on this device. */
export function alertsOn() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setAlertsOn(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* private window: for this visit only */
  }
}

/** Ask the browser to allow notifications (from a click). Resolves to the answer. */
export async function askNotifications() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission().catch(() => 'denied')
}

let audio
/** Two soft tones; silent if the browser has not allowed sound yet. */
export function chime() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)()
    const t = audio.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.35)
      osc.connect(gain).connect(audio.destination)
      osc.start(t + i * 0.18)
      osc.stop(t + i * 0.18 + 0.4)
    })
  } catch {
    /* no sound available */
  }
}

/** A system notification, only when the tab is in the background and it is allowed. */
export function notify(title, body, onClick) {
  try {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return
    const n = new Notification(title, { body, tag: 'sova-booking', icon: `${import.meta.env.BASE_URL}favicon.svg` })
    n.onclick = () => {
      window.focus()
      onClick?.()
      n.close()
    }
  } catch {
    /* notifications unavailable */
  }
}
