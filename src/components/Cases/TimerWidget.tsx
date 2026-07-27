'use client'

import { useState, useEffect, useRef } from 'react'

interface TimerWidgetProps {
  caseId: string
  caseTitle: string
  onTimerStop: (elapsedMinutes: number) => void
}

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function TimerWidget({ caseId, caseTitle, onTimerStop }: TimerWidgetProps) {
  const STORAGE_KEY = `justicehub_active_timer_${caseId}`

  const [isRunning, setIsRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const accumulatedRef = useRef<number>(0)

  // Restore timer state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { startTime, isRunning: wasRunning, accumulated } = JSON.parse(saved)
        accumulatedRef.current = accumulated || 0

        if (wasRunning && startTime) {
          startTimeRef.current = startTime
          setIsRunning(true)
          const now = Date.now()
          const currentElapsed = Math.floor((now - startTime) / 1000) + accumulatedRef.current
          setElapsedSeconds(currentElapsed)
        } else {
          setElapsedSeconds(accumulatedRef.current)
        }
      }
    } catch (e) {
      console.error('Failed to load timer from localStorage:', e)
    }
  }, [STORAGE_KEY])

  // Timer interval ticker
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (isRunning) {
      interval = setInterval(() => {
        if (startTimeRef.current) {
          const now = Date.now()
          const currentElapsed = Math.floor((now - startTimeRef.current) / 1000) + accumulatedRef.current
          setElapsedSeconds(currentElapsed)
        }
      }, 1000)
    } else if (interval) {
      clearInterval(interval)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isRunning])

  function handleStart() {
    const now = Date.now()
    startTimeRef.current = now
    setIsRunning(true)

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        startTime: now,
        isRunning: true,
        accumulated: accumulatedRef.current,
      })
    )
  }

  function handlePause() {
    if (startTimeRef.current) {
      const now = Date.now()
      const currentSegment = Math.floor((now - startTimeRef.current) / 1000)
      accumulatedRef.current += currentSegment
    }
    startTimeRef.current = null
    setIsRunning(false)

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        startTime: null,
        isRunning: false,
        accumulated: accumulatedRef.current,
      })
    )
  }

  function handleStop() {
    let totalSeconds = elapsedSeconds
    if (isRunning && startTimeRef.current) {
      const now = Date.now()
      totalSeconds = Math.floor((now - startTimeRef.current) / 1000) + accumulatedRef.current
    }

    setIsRunning(false)
    startTimeRef.current = null
    accumulatedRef.current = 0
    setElapsedSeconds(0)
    localStorage.removeItem(STORAGE_KEY)

    // Minimum 1 minute duration when stopped
    const elapsedMinutes = Math.max(1, Math.round(totalSeconds / 60))
    onTimerStop(elapsedMinutes)
  }

  function handleReset() {
    setIsRunning(false)
    startTimeRef.current = null
    accumulatedRef.current = 0
    setElapsedSeconds(0)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <div className="timer-widget-bar">
      <div className="timer-info">
        <span className={`timer-status-dot ${isRunning ? 'timer-status-dot--active' : ''}`} />
        <span className="timer-case-title">Timer: {caseTitle}</span>
      </div>

      <div className="timer-display">
        {formatHMS(elapsedSeconds)}
      </div>

      <div className="timer-controls">
        {!isRunning ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleStart}
          >
            ▶ Start Timer
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handlePause}
          >
            ⏸ Pause
          </button>
        )}

        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={handleStop}
          disabled={elapsedSeconds === 0 && !isRunning}
        >
          ⏹ Stop & Log Time
        </button>

        {elapsedSeconds > 0 && !isRunning && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleReset}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
