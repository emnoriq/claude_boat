// Vercel Serverless Function - 全場一括スクレイパー v3
// GET /api/scrape-all?date=2026-03-26

import { createClient } from '@supabase/supabase-js'

const VENUES = {
  '01':'桐生','02':'戸田','03':'江戸川','04':'平和島','05':'多摩川',
  '06':'浜名湖','07':'蒲郡','08':'常滑','09':'津','10':'三国',
  '11':'琵琶湖','12':'住之江','13':'尼崎','14':'鳴門','15':'丸亀',
  '16':'児島','17':'宮島','18':'徳山','19':'下関','20':'若松',
  '21':'芦屋','22':'福岡','23':'唐津','24':'大村',
}

const RACE_TIMES = [
  '10:30','11:00','11:32','12:05','12:38','13:12',
  '13:48','14:25','15:03','15:42','16:22','16:57',
]

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function handler(req, res) {
  const date = req.query.date || todayStr()
  const hd = date.replace(/-/g, '')
  const sb = getSupabase()

  // DB確認
  if (sb) {
    const { data: existing } = await sb
      .from('races')
      .select(`id, race_number, start_time, venue_code, venue_name, race_date,
        racers ( id, boat_number, racer_name, rank, win_rate, two_rate, motor_rate, boat_rate )`)
      .eq('race_date', date).order('venue_code').order('race_number')

    if (existing && existing.length > 0) {
      const venues = [...new Set(existing.map(r => r.venue_name))]
      return res.status(200).json({
        date, venue_count: venues.length, race_count: existing.length,
        venues, races: existing, source: 'database',
      })
    }
  }

  const activeVenues = await detectActiveVenues(hd)
  if (activeVenues.length === 0) {
    return res.status(404).json({ error: '当日の開催場が見つかりません', date })
  }

  const allRaces = []
  for (let i = 0; i < activeVenues.length; i += 5) {
    const batch = activeVenues.slice(i, i + 5)
    const results = await Promise.allSettled(
      batch.map(v => scrapeVenue(v.code, v.name, hd))
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.length > 0) allRaces.push(...r.value)
    }
  }

  // DB保存
  if (sb && allRaces.length > 0) {
    for (const race of allRaces) {
      const { data: ins, error } = await sb.from('races')
        .upsert({ venue_code: race.venue_code, venue_name: race.venue_name,
          race_date: date, race_number: race.race_number, start_time: race.start_time,
        }, { onConflict: 'venue_code,race_date,race_number' }).select().single()
      if (error || !ins) continue
      const rows = race.racers.map(r => ({
        race_id: ins.id, boat_number: r.boat_number, racer_name: r.racer_name || '',
        rank: r.rank, win_rate: r.win_rate, two_rate: r.two_rate || null,
        motor_rate: r.motor_rate, boat_rate: r.boat_rate || null,
      }))
      await sb.from('racers').upsert(rows, { onConflict: 'race_id,boat_number' })
    }
  }

  res.status(200).json({
    date, venue_count: activeVenues.length, race_count: allRaces.length,
    venues: activeVenues.map(v => v.name), races: allRaces, source: 'scraped',
  })
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

async function detectActiveVenues(hd) {
  const html = await fetchPage(`https://www.boatrace.jp/owpc/pc/race/index?hd=${hd}`)
  if (!html) return Object.entries(VENUES).map(([code, name]) => ({ code, name }))
  const active = []
  for (const [code, name] of Object.entries(VENUES)) {
    if (html.includes(`jcd=${code}`)) active.push({ code, name })
  }
  return active.length > 0 ? active : Object.entries(VENUES).map(([code, name]) => ({ code, name }))
}

async function scrapeVenue(venueCode, venueName, hd) {
  const races = []
  for (let rno = 1; rno <= 12; rno++) {
    const race = await scrapeRace(venueCode, venueName, rno, hd)
    if (race) races.push(race)
  }
  return races
}

async function scrapeRace(venueCode, venueName, rno, hd) {
  const url = `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${rno}&jcd=${venueCode}&hd=${hd}`
  const html = await fetchPage(url)
  if (!html || !html.includes('is-boatColor1')) return null

  const racers = parseRacelist(html)
  if (racers.length < 6) return null

  const startTime = parseStartTime(html, rno)
  const raceData = { venue_code: venueCode, venue_name: venueName, race_number: rno, start_time: startTime, racers }

  // 直前情報（展示タイム + 気象データ）
  const biHtml = await fetchPage(
    `https://www.boatrace.jp/owpc/pc/race/beforeinfo?rno=${rno}&jcd=${venueCode}&hd=${hd}`
  )
  if (biHtml) {
    parseBeforeInfo(biHtml, racers)
    const weather = parseWeather(biHtml)
    Object.assign(raceData, weather)
  }

  return raceData
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

    const weightMatch = tbody.match(/(\d+\.?\d*)kg/)
    const weight = weightMatch ? parseFloat(weightMatch[1]) : null

    const rowspanTds = []
    const tdRe = /<td[^>]*rowspan="4"[^>]*>([\s\S]*?)<\/td>/gi
    let tdm
    while ((tdm = tdRe.exec(tbody)) !== null) rowspanTds.push(tdm[1])

    let avgST = null, fCount = null
    if (rowspanTds[3]) {
      const clean = rowspanTds[3].replace(/<[^>]*>/g, '\n')
      const fMatch = clean.match(/F(\d+)/)
      if (fMatch) fCount = parseInt(fMatch[1])
      const stMatch = clean.match(/(\d\.\d{2})\s*$/)
      if (stMatch) avgST = parseFloat(stMatch[1])
    }

    let winRate = 5.0, twoRate = null
    if (rowspanTds[4]) {
      const nums = extractNumbers(rowspanTds[4])
      if (nums.length >= 1) winRate = nums[0]
      if (nums.length >= 2) twoRate = nums[1]
    }

    let localWinRate = null
    if (rowspanTds[5]) {
      const nums = extractNumbers(rowspanTds[5])
      if (nums.length >= 1) localWinRate = nums[0]
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

    racers.push({
      boat_number: boatNum, racer_name: racerName, rank,
      win_rate: winRate, two_rate: twoRate, motor_rate: motorRate, boat_rate: boatRate,
      avg_st: avgST, weight, f_count: fCount, local_win_rate: localWinRate,
    })
  }
  return racers.sort((a, b) => a.boat_number - b.boat_number)
}

function parseBeforeInfo(html, racers) {
  const tbodyRe = /<tbody[^>]*is-fs12[^>]*>([\s\S]*?)<\/tbody>/gi
  let tm
  while ((tm = tbodyRe.exec(html)) !== null) {
    const tbody = tm[1]
    const boatMatch = tbody.match(/is-boatColor(\d)/)
    if (!boatMatch) continue
    const boatNum = parseInt(boatMatch[1])
    const exMatch = tbody.match(/>(\d\.\d{2})</)
    if (exMatch) {
      const et = parseFloat(exMatch[1])
      if (et >= 6.0 && et <= 7.5) {
        const racer = racers.find(r => r.boat_number === boatNum)
        if (racer) racer.exhibition_time = et
      }
    }
  }

  const stRe = /is-type(\d)[^>]*>\d<\/span>[\s\S]*?table1_boatImage1Time[^>]*>([\s\S]*?)<\/span>/gi
  let sm
  while ((sm = stRe.exec(html)) !== null) {
    const boatNum = parseInt(sm[1])
    const timeText = sm[2].trim()
    let st = null
    if (timeText.startsWith('F')) {
      const fMatch = timeText.match(/F\.?(\d{2})/)
      if (fMatch) st = -parseFloat(`0.${fMatch[1]}`)
    } else {
      const nMatch = timeText.match(/\.(\d{2})/)
      if (nMatch) st = parseFloat(`0.${nMatch[1]}`)
    }
    if (st !== null) {
      const racer = racers.find(r => r.boat_number === boatNum)
      if (racer) racer.start_exhibition = st
    }
  }
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
  return RACE_TIMES[rno - 1] || ''
}

function parseWeather(html) {
  const result = {}
  const weatherMatch = html.match(/is-weather(\d)/)
  if (weatherMatch) {
    const weatherMap = { '1': '晴', '2': '曇', '3': '雨', '4': '雪', '5': '霧' }
    result.weather = weatherMap[weatherMatch[1]] || null
  }
  const windDirMatch = html.match(/weather1_bodyUnitImage is-wind(\d+)/)
  if (windDirMatch) result.wind_direction = parseInt(windDirMatch[1])
  const windSpeedMatch = html.match(/風速[\s\S]*?(\d+)m/)
  if (windSpeedMatch) result.wind_speed = parseInt(windSpeedMatch[1])
  const waveMatch = html.match(/波高[\s\S]*?(\d+)cm/)
  if (waveMatch) result.wave_height = parseInt(waveMatch[1])
  return result
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > 500 ? text : null
  } catch { return null }
}
