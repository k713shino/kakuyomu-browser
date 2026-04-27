import { useEffect, useState, useMemo } from 'react'
import { X, Flame, BookOpen, Clock, CalendarDays } from 'lucide-react'
import type { EpisodeCompletionItem } from '../../type/episode-completion'
import './ReadingStats.css'

interface ReadingStatsProps {
  isOpen: boolean
  onClose: () => void
}

type ViewMode = 'daily' | 'weekly' | 'monthly'

interface BarEntry {
  label: string
  shortLabel: string
  count: number
}

const MINUTES_PER_EPISODE = 8

function toDateStr(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDate(date: Date, mode: 'short' | 'month') {
  if (mode === 'month') {
    return `${date.getMonth() + 1}月`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function buildDailyBars(byDay: Record<string, number>, days = 14): BarEntry[] {
  const result: BarEntry[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = toDateStr(d)
    result.push({
      label: key,
      shortLabel: formatDate(d, 'short'),
      count: byDay[key] ?? 0,
    })
  }
  return result
}

function buildWeeklyBars(byDay: Record<string, number>, weeks = 12): BarEntry[] {
  const result: BarEntry[] = []
  const today = new Date()
  for (let w = weeks - 1; w >= 0; w--) {
    let count = 0
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - w * 7 - today.getDay())
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart)
      day.setDate(weekStart.getDate() + d)
      count += byDay[toDateStr(day)] ?? 0
    }
    result.push({
      label: `${formatDate(weekStart, 'short')}~`,
      shortLabel: formatDate(weekStart, 'short'),
      count,
    })
  }
  return result
}

function buildMonthlyBars(byDay: Record<string, number>, months = 12): BarEntry[] {
  const result: BarEntry[] = []
  const today = new Date()
  for (let m = months - 1; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const count = Object.entries(byDay)
      .filter(([k]) => k.startsWith(key))
      .reduce((s, [, v]) => s + v, 0)
    result.push({
      label: `${d.getFullYear()}/${d.getMonth() + 1}`,
      shortLabel: formatDate(d, 'month'),
      count,
    })
  }
  return result
}

function calculateStreak(byDay: Record<string, number>): number {
  const today = new Date()
  const todayStr = toDateStr(today)
  let streak = 0
  const cursor = new Date(today)
  if (!byDay[todayStr]) {
    cursor.setDate(cursor.getDate() - 1)
  }
  for (let i = 0; i < 366; i++) {
    if (byDay[toDateStr(cursor)]) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export function ReadingStats({ isOpen, onClose }: ReadingStatsProps) {
  const [items, setItems] = useState<EpisodeCompletionItem[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('daily')

  useEffect(() => {
    if (!isOpen) return
    window.episodeCompletion.getAll().then(setItems).catch(console.error)
  }, [isOpen])

  const { byDay, totalEpisodes, streak, activeDays } = useMemo(() => {
    const map: Record<string, number> = {}
    let total = 0
    for (const item of items) {
      for (const ep of item.completedEpisodes) {
        const day = toDateStr(new Date(ep.completedAt))
        map[day] = (map[day] ?? 0) + 1
        total++
      }
    }
    return {
      byDay: map,
      totalEpisodes: total,
      streak: calculateStreak(map),
      activeDays: Object.keys(map).length,
    }
  }, [items])

  const bars = useMemo(() => {
    if (viewMode === 'daily') return buildDailyBars(byDay)
    if (viewMode === 'weekly') return buildWeeklyBars(byDay)
    return buildMonthlyBars(byDay)
  }, [byDay, viewMode])

  const maxCount = Math.max(...bars.map(b => b.count), 1)
  const totalMinutes = totalEpisodes * MINUTES_PER_EPISODE

  if (!isOpen) return null

  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-modal" onClick={e => e.stopPropagation()}>
        <div className="stats-header">
          <div>
            <h2>読書統計</h2>
            <p>カクヨムブラウザでの読書記録</p>
          </div>
          <button type="button" className="stats-close" onClick={onClose} title="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="stats-summary">
          <div className="stats-summary-item">
            <Flame size={20} className="stats-icon stats-icon-streak" />
            <div>
              <div className="stats-summary-value">{streak}日</div>
              <div className="stats-summary-label">連続読書</div>
            </div>
          </div>
          <div className="stats-summary-item">
            <BookOpen size={20} className="stats-icon stats-icon-total" />
            <div>
              <div className="stats-summary-value">{totalEpisodes.toLocaleString()}話</div>
              <div className="stats-summary-label">累計読了</div>
            </div>
          </div>
          <div className="stats-summary-item">
            <Clock size={20} className="stats-icon stats-icon-time" />
            <div>
              <div className="stats-summary-value">
                {totalMinutes >= 60
                  ? `約${Math.floor(totalMinutes / 60)}時間`
                  : `約${totalMinutes}分`}
              </div>
              <div className="stats-summary-label">推定読書時間</div>
            </div>
          </div>
          <div className="stats-summary-item">
            <CalendarDays size={20} className="stats-icon stats-icon-days" />
            <div>
              <div className="stats-summary-value">{activeDays}日</div>
              <div className="stats-summary-label">読書した日</div>
            </div>
          </div>
        </div>

        <div className="stats-tabs">
          {(['daily', 'weekly', 'monthly'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              className={`stats-tab ${viewMode === mode ? 'active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode === 'daily' ? '日別（14日）' : mode === 'weekly' ? '週別（12週）' : '月別（12ヶ月）'}
            </button>
          ))}
        </div>

        <div className="stats-chart">
          {totalEpisodes === 0 ? (
            <div className="stats-empty">読了データがまだありません。作品を読み始めると記録が積み重なります。</div>
          ) : (
            <div className="stats-bars">
              {bars.map(bar => (
                <div key={bar.label} className="stats-bar-col" title={`${bar.label}: ${bar.count}話`}>
                  <div className="stats-bar-track">
                    <div
                      className={`stats-bar-fill ${bar.count > 0 ? 'has-data' : ''}`}
                      style={{ height: `${(bar.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <div className="stats-bar-count">{bar.count > 0 ? bar.count : ''}</div>
                  <div className="stats-bar-label">{bar.shortLabel}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="stats-note">推定読書時間は 1話あたり約8分として計算しています。</p>
      </div>
    </div>
  )
}
