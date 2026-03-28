// GET /api/scrape-venue?code=01&date=2026-03-27
// 1場12レースを並列取得（軽量・高速）

const VENUES = {
  '01':'桐生','02':'戸田','03':'江戸川','04':'平和島','05':'多摩川',
  '06':'浜名湖','07':'蒲郡','08':'常滑','09':'津','10':'三国',
  '11':'琵琶湖','12':'住之江','13':'尼崎','14':'鳴門','15':'丸亀',
  '16':'児島','17':'宮島','18':'徳山','19':'下関','20':'若松',
  '21':'芦屋','22':'福岡','23':'唐津','24':'大村',
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  const code = req.query.code
  const date = req.query.date || todayStr()
  const hd = date.replace(/-/g, '')
  const name = VENUES[code]
  if (!name) return res.status(400).json({ error: 'invalid venue code' })

  // 4レースずつ並列取得（boatrace.jpの負荷を抑える）
  const races = []
  for (let i = 0; i < 12; i += 4) {
    const batch = await Promise.allSettled(
      [i+1, i+2, i+3, i+4].filter(n => n <= 12).map(n => scrapeRace(code, name, n, hd))
    )
    for (const r of batch) {
      if (r.status === 'fulfilled' && r.value) races.push(r.value)
    }
  }

  res.status(200).json({ venue_code: code, venue_name: name, date, races })
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

async function scrapeRace(code, name, rno, hd) {
  const url = `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${rno}&jcd=${code}&hd=${hd}`
  const html = await fetchPage(url)
  if (!html || !html.includes('is-boatColor1')) return null

  const racers = parseRacelist(html)
  if (racers.length < 6) return null

  return { venue_code: code, venue_name: name, race_number: rno, start_time: parseStartTime(html, rno), racers }
}

function parseRacelist(html) {
  const racers = []
  const tbodyRe = /<tbody[^>]*is-fs12[^>]*>([\s\S]*?)<\/tbody>/gi
  let tm
  while ((tm = tbodyRe.exec(html)) !== null) {
    const tbody = tm[1]
    const boatMatch = tbody.match(/is-boatColor(\d)/)
    if (!boatMatch) continue
    const boatNum = parseInt(boatMatch[1])
    if (boatNum < 1 || boatNum > 6 || racers.some(r => r.boat_number === boatNum)) continue

    const nameMatch = tbody.match(/is-fs18[^>]*>[\s]*<a[^>]*>([^<]+)<\/a>/)
    const racerName = nameMatch ? nameMatch[1].replace(/\s+/g, '') : ''

    const rankMatch = tbody.match(/\/\s*<span[^>]*>\s*([AB][12])\s*<\/span>/)
    const rank = rankMatch ? rankMatch[1] : 'B1'

    const rowspanTds = []
    const tdRe = /<td[^>]*rowspan="4"[^>]*>([\s\S]*?)<\/td>/gi
    let tdm
    while ((tdm = tdRe.exec(tbody)) !== null) rowspanTds.push(tdm[1])

    let winRate = 5.0, twoRate = null
    if (rowspanTds[4]) {
      const nums = extractNumbers(rowspanTds[4])
      if (nums.length >= 1) winRate = nums[0]
      if (nums.length >= 2) twoRate = nums[1]
    }

    let motorRate = 30.0
    if (rowspanTds[6]) {
      const nums = extractNumbers(rowspanTds[6])
      if (nums.length >= 2) motorRate = nums[1]
    }

    let boatRate = null
    if (rowspanTds[7]) {
      const nums = extractNumbers(rowspanTds[7])
      if (nums.length >= 2) boatRate = nums[1]
    }

    let avgST = null
    if (rowspanTds[3]) {
      const stMatch = rowspanTds[3].match(/(\d\.\d{2})\s*$/)
      if (stMatch) avgST = parseFloat(stMatch[1])
    }

    racers.push({ boat_number: boatNum, racer_name: racerName, rank, win_rate: winRate, two_rate: twoRate, motor_rate: motorRate, boat_rate: boatRate, avg_st: avgST })
  }
  return racers.sort((a, b) => a.boat_number - b.boat_number)
}

function extractNumbers(text) {
  const clean = text.replace(/<[^>]*>/g, ' ')
  const nums = []
  const re = /(\d+\.?\d*)/g
  let m
  while ((m = re.exec(clean)) !== null) nums.push(parseFloat(m[1]))
  return nums
}

function parseStartTime(html, rno) {
  const section = html.match(/締切予定時刻[\s\S]*?<\/tbody>/)
  if (section) {
    const times = []
    const tdRe = /<td[^>]*>\s*(\d{1,2}:\d{2})\s*<\/td>/g
    let m
    while ((m = tdRe.exec(section[0])) !== null) times.push(m[1])
    if (times[rno - 1]) return times[rno - 1]
    if (times.length > 0) return times[0]
  }
  return ''
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > 500 ? text : null
  } catch { return null }
}
