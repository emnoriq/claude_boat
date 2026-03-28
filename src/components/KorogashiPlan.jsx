import { firmBadge, windDirText, windType } from '../lib/analysis.js'

export default function KorogashiPlan({ plan }) {
  const totalProb = plan.reduce((p, r) => p * r.boxProb, 1)
  const avgFirm = plan.reduce((s, r) => s + r.firmness, 0) / plan.length
  const totalTickets = plan.reduce((s, r) => s + (r.boxSize === 4 ? 4 : 1), 0)

  return (
    <section className="card">
      <h2>転がしプラン</h2>
      <p className="hint">全場横断 - 堅さスコア上位4レースを時刻順に自動抽出</p>

      {plan.map((r, idx) => {
        const badge = firmBadge(r.firmness)
        const fillColor = r.firmness >= 60 ? 'var(--success)' : r.firmness >= 40 ? 'var(--warning)' : 'var(--danger)'
        const wt = windType(r.wind_direction, r.wind_speed)
        const isBox4 = r.boxSize === 4

        return (
          <div className="kg-step" key={`${r.venue_code}-${r.race_number}`}>
            <div className="kg-step-num">
              <div className="kg-step-circle">{idx + 1}</div>
              {idx < 3 && <div className="kg-step-line" />}
            </div>
            <div className={`kg-card${idx === 0 ? ' top' : ''}`}>
              <div className="kg-race-header">
                <span className="kg-race-name">{r.venue_name} {r.race_number}R</span>
                <span className="kg-race-time">{r.time}</span>
              </div>
              <div className="kg-meta">
                <span className={`kg-badge ${badge.cls}`}>{badge.text} ({r.firmness})</span>
                {r.weather && (
                  <span className="kg-weather">
                    {r.weather}
                    {r.wind_speed != null && ` ${wt}${r.wind_speed}m`}
                    {r.wave_height != null && ` 波${r.wave_height}cm`}
                  </span>
                )}
              </div>
              <div className="firmness-bar">
                <div className="firmness-fill" style={{ width: `${r.firmness}%`, background: fillColor }} />
              </div>

              {r.scores.map((s, si) => {
                const pct = (s.score / r.scores[0].score * 100).toFixed(0)
                const isBorder = si === (isBox4 ? 3 : 2)
                return (
                  <div key={s.boat}>
                    {isBorder && <div className="sc-border" />}
                    <div className={`sc-row${r.boxBoats.includes(s.boat) ? ' in-box' : ''}`}>
                      <span className="sc-name"><span className={`bn bn-sm b${s.boat}`}>{s.boat}</span></span>
                      <span className="sc-rank">{s.rank}</span>
                      <div className="sc-bar-bg">
                        <div className="sc-bar" style={{ width: `${pct}%`, background: `var(--boat-${s.boat})` }} />
                      </div>
                      <span className="sc-val">{s.score.toFixed(1)}</span>
                    </div>
                  </div>
                )
              })}

              <div className="box-area">
                <div className="box-label">
                  三連複 {isBox4 ? '4艇BOX (4点)' : '1点'}
                  {isBox4 && <span className="box-expanded"> 拡張</span>}
                </div>
                <div className="box-boats">
                  {r.boxBoats.map(b => (
                    <span key={b} className={`bn b${b}`}>{b}</span>
                  ))}
                </div>
                <div className="box-sanrenpuku">
                  {r.boxBoats.join('＝')}
                </div>
                <div className="box-prob">的中確率: <strong>{(r.boxProb * 100).toFixed(1)}%</strong></div>
              </div>
            </div>
          </div>
        )
      })}

      <div className="summary-box">
        <div className="summary-title">転がし概要</div>
        <div className="summary-nums">
          <div className="summary-item">
            <div className="label">4連続的中</div>
            <div className="val">{(totalProb * 100).toFixed(2)}%</div>
          </div>
          <div className="summary-item">
            <div className="label">平均堅さ</div>
            <div className="val">{avgFirm.toFixed(0)}</div>
          </div>
          <div className="summary-item">
            <div className="label">合計投資</div>
            <div className="val">¥{totalTickets * 100}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
