import { useState, useEffect } from 'react'
import { analyzeAllRaces } from '../lib/analysis.js'
import { toAnalysisFormat } from '../lib/raceData.js'

export default function ResultsCheck({ date }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadResults(date)
  }, [date])

  async function loadResults(d) {
    setLoading(true)
    setData(null)
    try {
      const [racesRes, resultsRes] = await Promise.all([
        fetch(`/data/${d}.json`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/data/${d}-results.json`).then(r => r.ok ? r.json() : null).catch(() => null),
      ])

      if (!racesRes || !resultsRes) {
        setData({ available: false })
        setLoading(false)
        return
      }

      const races = racesRes.races || racesRes
      const results = resultsRes.results || []

      const formatted = toAnalysisFormat(races)
      const analysis = analyzeAllRaces(formatted)
      const plan = analysis.plan

      const checks = plan.map(race => {
        const result = results.find(
          r => r.venue_code === race.venue_code && r.race_number === race.race_number
        )
        if (!result) return { ...race, result: null, hit: null }

        const top3Result = [result.first, result.second, result.third].sort((a, b) => a - b)
        const predicted = [...race.boxBoats].sort((a, b) => a - b)

        // 動的BOX: 3艇なら完全一致、4艇なら結果の3艇がBOX内に含まれるか
        let hit = false
        if (race.boxSize === 4) {
          hit = top3Result.every(b => predicted.includes(b))
        } else {
          hit = top3Result[0] === predicted[0] && top3Result[1] === predicted[1] && top3Result[2] === predicted[2]
        }

        return {
          ...race,
          result: { first: result.first, second: result.second, third: result.third, payout: result.trifecta_payout },
          hit,
        }
      })

      const hitCount = checks.filter(c => c.hit === true).length
      const totalWithResult = checks.filter(c => c.result !== null).length
      const totalPayout = checks.filter(c => c.hit).reduce((s, c) => s + (c.result?.payout || 0), 0)
      const totalInvest = checks.reduce((s, c) => s + (c.boxSize === 4 ? 400 : 100), 0)

      setData({ available: true, checks, hitCount, totalWithResult, totalPayout, totalInvest, date: d })
    } catch {
      setData({ available: false })
    }
    setLoading(false)
  }

  if (loading) return null
  if (!data || !data.available) return null

  return (
    <section className="card results-card">
      <h2>予想結果 ({data.date})</h2>

      <div className="results-summary">
        <span className={`results-score ${data.hitCount >= 3 ? 'great' : data.hitCount >= 2 ? 'good' : ''}`}>
          {data.hitCount} / {data.totalWithResult} 的中
        </span>
        {data.hitCount === 4 && <span className="results-perfect">転がし成功!</span>}
        <span className="results-roi">
          投資¥{data.totalInvest} → 払戻¥{data.totalPayout.toLocaleString()}
          {data.totalPayout > 0 && ` (ROI: ${(data.totalPayout / data.totalInvest * 100).toFixed(0)}%)`}
        </span>
      </div>

      <div className="results-list">
        {data.checks.map((c, idx) => (
          <div className={`result-item ${c.hit === true ? 'hit' : c.hit === false ? 'miss' : 'pending'}`} key={idx}>
            <div className="result-race">
              <span className="result-step">{idx + 1}</span>
              <span className="result-venue">{c.venue_name} {c.race_number}R</span>
              <span className="result-time">{c.time}</span>
            </div>
            <div className="result-detail">
              <div className="result-predict">
                <span className="result-label">予想{c.boxSize === 4 ? '(4艇)' : ''}</span>
                <span className="result-boats">
                  {c.boxBoats.map(b => <span key={b} className={`bn bn-sm b${b}`}>{b}</span>)}
                </span>
              </div>
              {c.result ? (
                <div className="result-actual">
                  <span className="result-label">結果</span>
                  <span className="result-boats">
                    <span className={`bn bn-sm b${c.result.first}`}>{c.result.first}</span>
                    <span style={{ margin: '0 2px', fontSize: '0.7rem' }}>-</span>
                    <span className={`bn bn-sm b${c.result.second}`}>{c.result.second}</span>
                    <span style={{ margin: '0 2px', fontSize: '0.7rem' }}>-</span>
                    <span className={`bn bn-sm b${c.result.third}`}>{c.result.third}</span>
                  </span>
                  {c.hit && c.result.payout && (
                    <span className="result-payout">¥{c.result.payout.toLocaleString()}</span>
                  )}
                </div>
              ) : (
                <div className="result-actual">
                  <span className="result-label">結果</span>
                  <span className="result-pending-text">未確定</span>
                </div>
              )}
              <div className="result-badge">
                {c.hit === true && <span className="hit-badge">的中</span>}
                {c.hit === false && <span className="miss-badge">不的中</span>}
                {c.hit === null && <span className="pending-badge">-</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
