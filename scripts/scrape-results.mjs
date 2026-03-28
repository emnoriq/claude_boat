#!/usr/bin/env node
// レース結果をスクレイピングしてpublic/data/{date}-results.jsonに保存
// Usage: node scripts/scrape-results.mjs 2026-03-26

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'public', 'data')

const VENUES = {
  '01':'桐生','02':'戸田','03':'江戸川','04':'平和島','05':'多摩川',
  '06':'浜名湖','07':'蒲郡','08':'常滑','09':'津','10':'三国',
  '11':'琵琶湖','12':'住之江','13':'尼崎','14':'鳴門','15':'丸亀',
  '16':'児島','17':'宮島','18':'徳山','19':'下関','20':'若松',
  '21':'芦屋','22':'福岡','23':'唐津','24':'大村',
}

const date = process.argv[2]
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Usage: node scripts/scrape-results.mjs YYYY-MM-DD')
  process.exit(1)
}

const hd = date.replace(/-/g, '')

async function main() {
  console.log(`🏁 ${date} のレース結果を取得中...`)

  // 予想データから開催場を取得
  const racesPath = path.join(dataDir, `${date}.json`)
  let activeVenues = []
  if (fs.existsSync(racesPath)) {
    const raceData = JSON.parse(fs.readFileSync(racesPath, 'utf-8'))
    const races = raceData.races || raceData
    const codes = [...new Set(races.map(r => r.venue_code))]
    activeVenues = codes.map(code => ({ code, name: VENUES[code] || code }))
  } else {
    // 予想データがなければ開催場を検出
    const indexHtml = await fetchPage(`https://www.boatrace.jp/owpc/pc/race/index?hd=${hd}`)
    if (indexHtml) {
      for (const [code, name] of Object.entries(VENUES)) {
        if (indexHtml.includes(`jcd=${code}`)) activeVenues.push({ code, name })
      }
    }
  }

  if (activeVenues.length === 0) {
    console.error('❌ 開催場が見つかりません')
    process.exit(1)
  }

  console.log(`📍 ${activeVenues.length}場: ${activeVenues.map(v => v.name).join(', ')}`)

  const allResults = []
  for (const venue of activeVenues) {
    process.stdout.write(`  ${venue.name}: `)
    for (let i = 0; i < 12; i += 4) {
      const batch = await Promise.allSettled(
        [i+1, i+2, i+3, i+4].filter(n => n <= 12).map(n => scrapeResult(venue.code, venue.name, n, hd))
      )
      for (const r of batch) {
        if (r.status === 'fulfilled' && r.value) {
          allResults.push(r.value)
          process.stdout.write('✓')
        } else {
          process.stdout.write('×')
        }
      }
    }
    console.log()
  }

  console.log(`\n合計: ${allResults.length}レース結果`)

  if (allResults.length === 0) {
    console.error('❌ 結果データが見つかりません（まだレースが終わっていない可能性）')
    process.exit(1)
  }

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const output = {
    date,
    result_count: allResults.length,
    results: allResults,
  }

  const outPath = path.join(dataDir, `${date}-results.json`)
  fs.writeFileSync(outPath, JSON.stringify(output))
  console.log(`✅ 保存完了: ${outPath}`)
}

async function scrapeResult(code, name, rno, hd) {
  const url = `https://www.boatrace.jp/owpc/pc/race/raceresult?rno=${rno}&jcd=${code}&hd=${hd}`
  const html = await fetchPage(url)
  if (!html) return null

  const result = { venue_code: code, venue_name: name, race_number: rno }

  // 着順パース
  // 実HTML構造:
  //   <td class="is-fs14">１</td>
  //   <td class="is-fs14 is-fBold is-boatColor3">3</td>
  // 着番（全角数字）の後にボート番号（is-boatColorN）が来る
  const places = {}

  // パターン1: is-boatColorNから順番に取得（着順テーブル内）
  const boatColorRe = /is-boatColor(\d)/g
  let bm
  let placeNum = 1
  while ((bm = boatColorRe.exec(html)) !== null) {
    const boat = parseInt(bm[1])
    if (boat >= 1 && boat <= 6 && placeNum <= 6 && !Object.values(places).includes(boat)) {
      places[placeNum] = boat
      placeNum++
    }
  }

  if (!places[1] || !places[2] || !places[3]) return null

  result.first = places[1]
  result.second = places[2]
  result.third = places[3]

  // 三連複の払戻金: "3連複" ... "¥7,700"
  const sanrenpukuMatch = html.match(/3連複[\s\S]*?&yen;([\d,]+)/)
  if (sanrenpukuMatch) {
    result.trifecta_payout = parseInt(sanrenpukuMatch[1].replace(/,/g, ''))
  }

  // 三連単の払戻金: "3連単" ... "¥53,550"
  const sanrentanMatch = html.match(/3連単[\s\S]*?&yen;([\d,]+)/)
  if (sanrentanMatch) {
    result.trifecta_exact_payout = parseInt(sanrentanMatch[1].replace(/,/g, ''))
  }

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

main().catch(e => { console.error(e); process.exit(1) })
