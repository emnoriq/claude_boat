import { useState, useEffect } from 'react'
import { analyzeAllRaces } from './lib/analysis.js'
import { fetchAllRacesForDate, toAnalysisFormat } from './lib/raceData.js'
import KorogashiPlan from './components/KorogashiPlan.jsx'
import RankingList from './components/RankingList.jsx'
import ResultsCheck from './components/ResultsCheck.jsx'

function todayStr() {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

export default function App() {
  const [mainTab, setMainTab] = useState('predict')
  const [yesterdayDate, setYesterdayDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [date, setDate] = useState(todayStr())
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [status, setStatus] = useState(null)
  const [plan, setPlan] = useState(null)
  const [ranking, setRanking] = useState(null)
  const [venueCount, setVenueCount] = useState(0)
  const [raceCount, setRaceCount] = useState(0)

  useEffect(() => {
    handleFetch(date)
  }, [date])

  async function handleFetch(targetDate) {
    setLoading(true)
    setLoadingText('全場のレースデータを取得中...')
    setStatus(null)
    setPlan(null)
    setRanking(null)

    try {
      const races = await fetchAllRacesForDate(targetDate, (msg) => {
        setLoadingText(msg)
      })

      if (!races || races.length === 0) {
        throw new Error('レースデータが見つかりません')
      }

      setLoadingText('全場横断で分析中...')
      const formatted = toAnalysisFormat(races)
      const result = analyzeAllRaces(formatted)

      const venues = new Set(races.map(r => r.venue_name || r.venue_code))

      setPlan(result.plan)
      setRanking(result.ranking)
      setVenueCount(venues.size)
      setRaceCount(races.length)
      setStatus({
        msg: `${targetDate} / ${venues.size}場 ${races.length}レースから堅い4レースを自動抽出`,
        type: 'success',
      })
    } catch (err) {
      setStatus({ msg: `エラー: ${err.message}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header>
        <h1>堅いレース.ai</h1>
        <p className="subtitle">全場横断 - 精度最大化エンジン v5</p>
      </header>

      <main>
        <div className="main-tabs">
          <button
            className={`main-tab${mainTab === 'predict' ? ' active' : ''}`}
            onClick={() => setMainTab('predict')}
          >
            予想
          </button>
          <button
            className={`main-tab${mainTab === 'results' ? ' active' : ''}`}
            onClick={() => setMainTab('results')}
          >
            結果
          </button>
          <button
            className={`main-tab${mainTab === 'ranking' ? ' active' : ''}`}
            onClick={() => setMainTab('ranking')}
          >
            全レース
          </button>
        </div>

        {mainTab === 'results' && (
          <section>
            <div className="card">
              <h2>予想の答え合わせ</h2>
              <div className="field">
                <label htmlFor="resultDate">日付を選択</label>
                <input
                  type="date"
                  id="resultDate"
                  value={yesterdayDate}
                  onChange={e => setYesterdayDate(e.target.value)}
                />
              </div>
            </div>
            <ResultsCheck date={yesterdayDate} />
          </section>
        )}

        {mainTab === 'ranking' && (
          <>
            <section className="card">
              <div className="date-selector">
                <label htmlFor="rankDate">日付</label>
                <input type="date" id="rankDate" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </section>
            {ranking && <RankingList ranking={ranking} />}
          </>
        )}

        {mainTab === 'predict' && (
          <>
            <section className="card">
              <div className="date-selector">
                <label htmlFor="raceDate">予想日</label>
                <input
                  type="date"
                  id="raceDate"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
                {venueCount > 0 && !loading && (
                  <span className="date-info">{venueCount}場 {raceCount}R分析済み</span>
                )}
              </div>
            </section>

            {loading && (
              <div className="loading">
                <div className="spinner" />
                <p>{loadingText}</p>
              </div>
            )}

            {status && (
              <div className={`status-msg ${status.type}`} style={{ margin: '0 0 16px' }}>
                {status.msg}
              </div>
            )}

            {plan && <KorogashiPlan plan={plan} />}
          </>
        )}
      </main>

      <footer>
        <p>※ 統計データに基づく予想支援ツール。的中を保証するものではありません。</p>
      </footer>
    </>
  )
}
