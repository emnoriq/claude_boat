// Vercel Serverless Function - ボートレースデータスクレイパー
// GET /api/scrape?venue=24&date=2026-03-26

const RACE_TIMES = [
  '10:30','11:00','11:32','12:05','12:38','13:12',
  '13:48','14:25','15:03','15:42','16:22','16:57',
]

export default async function handler(req, res) {
  const { venue, date } = req.query
  if (!venue || !date) {
    return res.status(400).json({ error: 'venue と date パラメータが必要です' })
  }

  const hd = date.replace(/-/g, '')

  try {
    const races = []

    for (let rno = 1; rno <= 12; rno++) {
      const url = `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${rno}&jcd=${venue}&hd=${hd}`
      const html = await fetchPage(url)
      if (!html) continue

      const race = parseRace(html, rno)
      if (race) races.push(race)
    }

    if (races.length === 0) {
      return res.status(404).json({ error: 'レースデータが見つかりません' })
    }

    res.status(200).json({ races })
  } catch (err) {
    console.error('Scrape error:', err)
    res.status(500).json({ error: 'スクレイピングに失敗しました' })
  }
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BoatRaceApp/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > 500 ? text : null
  } catch {
    return null
  }
}

function parseRace(html, raceNum) {
  let startTime = RACE_TIMES[raceNum - 1] || ''
  const timeMatch = html.match(/(\d{1,2}:\d{2})/)
  if (timeMatch) startTime = timeMatch[1]

  const racers = []

  // 級別を抽出 (A1, A2, B1, B2)
  const rankMatches = [...html.matchAll(/class="is-fs14"[^>]*>([AB][12])<\/span>/g)]
  const ranks = rankMatches.map(m => m[1])

  // テーブル行ごとに解析
  // boatrace.jpの出走表は tbody > tr で6行
  const rowPattern = /<tbody[\s\S]*?<\/tbody>/gi
  const tbodies = [...html.matchAll(rowPattern)]

  if (tbodies.length > 0) {
    // 各tbodyから選手データを抽出
    const mainTbody = tbodies.find(tb => {
      const content = tb[0]
      return content.includes('A1') || content.includes('A2') || content.includes('B1') || content.includes('B2')
    })

    if (mainTbody) {
      const rows = [...mainTbody[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)]
      for (let i = 0; i < Math.min(rows.length, 6); i++) {
        const rowHtml = rows[i][0]
        const racer = parseRacerRow(rowHtml, i + 1)
        if (racer) racers.push(racer)
      }
    }
  }

  // tbodyから取れなかった場合はフォールバック
  if (racers.length < 6) {
    return parseRaceFallback(html, raceNum, startTime)
  }

  return {
    race_number: raceNum,
    start_time: startTime,
    racers,
  }
}

function parseRacerRow(rowHtml, boatNum) {
  // 級別
  let rank = 'B1'
  const rankMatch = rowHtml.match(/[AB][12]/)
  if (rankMatch) rank = rankMatch[0]

  // 名前
  let racerName = ''
  const nameMatch = rowHtml.match(/is-fs18[^>]*>([^<]+)</)
  if (nameMatch) racerName = nameMatch[1].trim()

  // 数値を抽出
  const nums = [...rowHtml.matchAll(/(\d+\.\d+)/g)].map(m => parseFloat(m[1]))
  let winRate = 5.0, twoRate = null, motorRate = 30.0, boatRate = null

  for (const v of nums) {
    if (v >= 1.0 && v <= 9.99 && winRate === 5.0) winRate = v
    else if (v >= 10.0 && v <= 80.0 && motorRate === 30.0) motorRate = v
  }

  return {
    boat_number: boatNum,
    racer_name: racerName,
    rank,
    win_rate: winRate,
    two_rate: twoRate,
    motor_rate: motorRate,
    boat_rate: boatRate,
  }
}

function parseRaceFallback(html, raceNum, startTime) {
  const racers = []

  // 級別を正規表現で一括抽出
  const rankPattern = /[AB][12]/g
  const allRanks = []
  let m
  while ((m = rankPattern.exec(html)) !== null) {
    if (['A1','A2','B1','B2'].includes(m[0])) allRanks.push(m[0])
  }

  // 勝率（X.XX 形式）
  const rates = []
  const ratePattern = /(\d\.\d{2})/g
  while ((m = ratePattern.exec(html)) !== null) {
    const v = parseFloat(m[1])
    if (v >= 1.0 && v <= 9.99) rates.push(v)
  }

  // モーター率（XX.X 形式）
  const motors = []
  const motorPattern = /(\d{2}\.\d)/g
  while ((m = motorPattern.exec(html)) !== null) {
    const v = parseFloat(m[1])
    if (v >= 10.0 && v <= 80.0) motors.push(v)
  }

  for (let i = 0; i < 6; i++) {
    racers.push({
      boat_number: i + 1,
      racer_name: '',
      rank: allRanks[i] || 'B1',
      win_rate: rates[i] || 5.0,
      two_rate: null,
      motor_rate: motors[i] || 30.0,
      boat_rate: null,
    })
  }

  return { race_number: raceNum, start_time: startTime, racers }
}
