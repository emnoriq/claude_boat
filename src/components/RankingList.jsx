import { useState, useMemo } from 'react'
import { firmBadge } from '../lib/analysis.js'

export default function RankingList({ ranking }) {
  const [tab, setTab] = useState('firmness')

  const sorted = useMemo(() => {
    if (tab === 'firmness') return ranking
    return [...ranking].sort((a, b) => {
      const ta = (a.time || '').replace(':', '')
      const tb = (b.time || '').replace(':', '')
      if (ta !== tb) return ta.localeCompare(tb)
      return b.firmness - a.firmness
    })
  }, [ranking, tab])

  return (
    <section className="card">
      <h2>全レースランキング</h2>
      <div className="rank-tabs">
        <button
          className={`rank-tab${tab === 'firmness' ? ' active' : ''}`}
          onClick={() => setTab('firmness')}
        >
          堅さ順
        </button>
        <button
          className={`rank-tab${tab === 'time' ? ' active' : ''}`}
          onClick={() => setTab('time')}
        >
          時間順
        </button>
      </div>
      {sorted.map((r, idx) => {
        const badge = firmBadge(r.firmness)
        return (
          <div className="rank-row" key={`${r.venue_code}-${r.race_number}`}>
            <span className="rank-num">{idx + 1}</span>
            <span className="rank-name">
              {r.venue_name} {r.race_number}R{' '}
              <span style={{ fontWeight: 400, color: 'var(--text2)' }}>{r.time}</span>
            </span>
            <span className="rank-boats">
              {r.boxBoats.map(b => (
                <span key={b} className={`bn bn-sm b${b}`}>{b}</span>
              ))}
            </span>
            <span className="rank-score">{(r.boxProb * 100).toFixed(1)}%</span>
            <span className={`kg-badge ${badge.cls}`}>{badge.text} {r.firmness.toFixed(0)}</span>
          </div>
        )
      })}
    </section>
  )
}
