#!/usr/bin/env node
// ローカル実行用：指定日のレースデータをスクレイピングしてpublic/data/に保存
// Usage: node scripts/scrape-date.mjs 2026-03-26
// v5: 風・波・天候・体重・F数・当地勝率を追加取得

const VENUES = {
  '01':'桐生','02':'戸田','03':'江戸川','04':'平和島','05':'多摩川',
  '06':'浜名湖','07':'蒲郡','08':'常滑','09':'津','10':'三国',
  '11':'琵琶湖','12':'住之江','13':'尼崎','14':'鳴門','15':'丸亀',
  '16':'児島','17':'宮島','18':'徳山','19':'下関','20':'若松',
  '21':'芦屋','22':'福岡','23':'唐津','24':'大村',
}

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'public', 'data')

const date = process.argv[2]
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Usage: node scripts/scrape-date.mjs YYYY-MM-DD')
  process.exit(1)
}

const hd = date.replace(/-/g, '')

async function main() {
  console.log(`🏁 ${date} のデータをスクレイピング中...（v5拡張版）`)

  // 開催場検出
  const indexHtml = await fetchPage(`https://www.boatrace.jp/owpc/pc/race/index?hd=${hd}`)
  let activeVenues = []
  if (indexHtml) {
    for (const [code, name] of Object.entries(VENUES)) {
      if (indexHtml.includes(`jcd=${code}`)) activeVenues.push({ code, name })
    }
  }
  if (activeVenues.length === 0) {
    activeVenues = Object.entries(VENUES).map(([code, name]) => ({ code, name }))
  }
  console.log(`📍 ${activeVenues.length}場検出: ${activeVenues.map(v => v.name).join(', ')}`)

  const allRaces = []
  for (const venue of activeVenues) {
    process.stdout.write(`  ${venue.name}: `)
    // 4レースずつ並列
    for (let i = 0; i < 12; i += 4) {
      const batch = await Promise.allSettled(
        [i+1, i+2, i+3, i+4].filter(n => n <= 12).map(n => scrapeRace(venue.code, venue.name, n, hd))
      )
      for (const r of batch) {
        if (r.status === 'fulfilled' && r.value) {
          allRaces.push(r.value)
          process.stdout.write('✓')
        } else {
          process.stdout.write('×')
        }
      }
    }
    console.log()
  }

  console.log(`\n合計: ${allRaces.length}レース`)

  // 気象データの取得率
  const withWeather = allRaces.filter(r => r.wind_speed != null).length
  const withWeight = allRaces.filter(r => r.racers.some(rc => rc.weight != null)).length
  console.log(`気象データ: ${withWeather}/${allRaces.length}レース`)
  console.log(`体重データ: ${withWeight}/${allRaces.length}レース`)

  if (allRaces.length === 0) {
    console.error('❌ レースデータが見つかりません')
    process.exit(1)
  }

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const output = {
    date,
    venue_count: activeVenues.length,
    race_count: allRaces.length,
    races: allRaces,
  }

  const outPath = path.join(dataDir, `${date}.json`)
  fs.writeFileSync(outPath, JSON.stringify(output))
  console.log(`✅ 保存完了: ${outPath}`)
}

async function scrapeRace(code, name, rno, hd) {
  const url = `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${rno}&jcd=${code}&hd=${hd}`
  const html = await fetchPage(url)
  if (!html || !html.includes('is-boatColor1')) return null

  const racers = parseRacelist(html)
  if (racers.length < 6) return null

  const raceData = {
    venue_code: code,
    venue_name: name,
    race_number: rno,
    start_time: parseStartTime(html, rno),
    racers,
  }

  // 直前情報（展示タイム、スタート展示、気象データ）
  const biUrl = `https://www.boatrace.jp/owpc/pc/race/beforeinfo?rno=${rno}&jcd=${code}&hd=${hd}`
  const biHtml = await fetchPage(biUrl)
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

    // 体重: "36歳/53.9kg"
    const weightMatch = tbody.match(/(\d+\.?\d*)kg/)
    const weight = weightMatch ? parseFloat(weightMatch[1]) : null

    const rowspanTds = []
    const tdRe = /<td[^>]*rowspan="4"[^>]*>([\s\S]*?)<\/td>/gi
    let tdm
    while ((tdm = tdRe.exec(tbody)) !== null) rowspanTds.push(tdm[1])

    // F数/L数/平均ST
    let avgST = null, fCount = null, lCount = null
    if (rowspanTds[3]) {
      const clean = rowspanTds[3].replace(/<[^>]*>/g, '\n')
      const fMatch = clean.match(/F(\d+)/)
      if (fMatch) fCount = parseInt(fMatch[1])
      const lMatch = clean.match(/L(\d+)/)
      if (lMatch) lCount = parseInt(lMatch[1])
      const stMatch = clean.match(/(\d\.\d{2})\s*$/)
      if (stMatch) avgST = parseFloat(stMatch[1])
    }

    // 全国勝率/2連率/3連率
    let winRate = 5.0, twoRate = null
    if (rowspanTds[4]) {
      const nums = extractNumbers(rowspanTds[4])
      if (nums.length >= 1) winRate = nums[0]
      if (nums.length >= 2) twoRate = nums[1]
    }

    // 当地成績
    let localWinRate = null, localTwoRate = null
    if (rowspanTds[5]) {
      const nums = extractNumbers(rowspanTds[5])
      if (nums.length >= 1) localWinRate = nums[0]
      if (nums.length >= 2) localTwoRate = nums[1]
    }

    // モーター
    let motorRate = 30.0
    if (rowspanTds[6]) {
      const nums = extractNumbers(rowspanTds[6])
      if (nums.length >= 2) motorRate = nums[1]
    }

    // ボート
    let boatRate = null
    if (rowspanTds[7]) {
      const nums = extractNumbers(rowspanTds[7])
      if (nums.length >= 2) boatRate = nums[1]
    }

    racers.push({
      boat_number: boatNum, racer_name: racerName, rank,
      win_rate: winRate, two_rate: twoRate,
      motor_rate: motorRate, boat_rate: boatRate,
      avg_st: avgST, weight,
      f_count: fCount, l_count: lCount,
      local_win_rate: localWinRate, local_two_rate: localTwoRate,
    })
  }
  return racers.sort((a, b) => a.boat_number - b.boat_number)
}

function parseBeforeInfo(html, racers) {
  // 展示タイム & 体重（beforeinfo版）
  const tbodyRe = /<tbody[^>]*is-fs12[^>]*>([\s\S]*?)<\/tbody>/gi
  let tm
  while ((tm = tbodyRe.exec(html)) !== null) {
    const tbody = tm[1]
    const boatMatch = tbody.match(/is-boatColor(\d)/)
    if (!boatMatch) continue
    const boatNum = parseInt(boatMatch[1])

    // 展示タイム
    const exMatch = tbody.match(/>(\d\.\d{2})</)
    if (exMatch) {
      const et = parseFloat(exMatch[1])
      if (et >= 6.0 && et <= 7.5) {
        const racer = racers.find(r => r.boat_number === boatNum)
        if (racer) racer.exhibition_time = et
      }
    }

    // 体重（beforeinfoから補完）
    const weightMatch = tbody.match(/(\d+\.?\d*)kg/)
    if (weightMatch) {
      const racer = racers.find(r => r.boat_number === boatNum)
      if (racer && racer.weight == null) racer.weight = parseFloat(weightMatch[1])
    }
  }

  // スタート展示
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

/**
 * 気象データ解析（beforeinfoページ）
 * - 天候: is-weather1=晴, is-weather2=曇り, is-weather3=雨, is-weather4=雪, is-weather5=霧
 * - 風向: is-wind1〜16（16方位）
 * - 風速: Nm
 * - 波高: Ncm
 */
function parseWeather(html) {
  const result = {}

  // 天候
  const weatherMatch = html.match(/is-weather(\d)/)
  if (weatherMatch) {
    const weatherMap = { '1': '晴', '2': '曇', '3': '雨', '4': '雪', '5': '霧' }
    result.weather = weatherMap[weatherMatch[1]] || null
  }

  // 風向（CSSクラスから方位コード）
  const windDirMatch = html.match(/weather1_bodyUnitImage is-wind(\d+)/)
  if (windDirMatch) {
    result.wind_direction = parseInt(windDirMatch[1])
  }

  // 風速
  const windSpeedMatch = html.match(/風速[\s\S]*?(\d+)m/)
  if (windSpeedMatch) {
    result.wind_speed = parseInt(windSpeedMatch[1])
  }

  // 波高
  const waveMatch = html.match(/波高[\s\S]*?(\d+)cm/)
  if (waveMatch) {
    result.wave_height = parseInt(waveMatch[1])
  }

  // 気温
  const tempMatch = html.match(/気温[\s\S]*?([\d.]+)℃/)
  if (tempMatch) {
    result.temperature = parseFloat(tempMatch[1])
  }

  // 水温
  const waterTempMatch = html.match(/水温[\s\S]*?([\d.]+)℃/)
  if (waterTempMatch) {
    result.water_temperature = parseFloat(waterTempMatch[1])
  }

  return result
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
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > 500 ? text : null
  } catch { return null }
}

main().catch(e => { console.error(e); process.exit(1) })
