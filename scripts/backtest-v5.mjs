#!/usr/bin/env node
/**
 * バックテスト v5: v4 vs v5 比較
 * 3日分のデータ（3/24, 3/25, 3/26）で検証
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'public', 'data')

// ===== VENUES =====
const VENUES = {
  '桐生':{inRate:54},'戸田':{inRate:43},'江戸川':{inRate:44},
  '平和島':{inRate:46},'多摩川':{inRate:54},'浜名湖':{inRate:52},
  '蒲郡':{inRate:55},'常滑':{inRate:56},'津':{inRate:55},
  '三国':{inRate:52},'琵琶湖':{inRate:51},'住之江':{inRate:56},
  '尼崎':{inRate:55},'鳴門':{inRate:55},'丸亀':{inRate:56},
  '児島':{inRate:53},'宮島':{inRate:55},'徳山':{inRate:60},
  '下関':{inRate:58},'若松':{inRate:56},'芦屋':{inRate:60},
  '福岡':{inRate:52},'唐津':{inRate:55},'大村':{inRate:65},
}

const WIN1_PCT = {
  A1: { 1: 72, 2: 22, 3: 18, 4: 16, 5: 10, 6: 6 },
  A2: { 1: 58, 2: 17, 3: 14, 4: 12, 5: 7,  6: 4 },
  B1: { 1: 45, 2: 11, 3: 9,  4: 8,  5: 4,  6: 2 },
  B2: { 1: 32, 2: 5,  3: 4,  4: 3,  5: 2,  6: 1 },
}

// ===== V4 Algorithm =====
function scoreRaceV4(race) {
  const venue = VENUES[race.venue_name || '']
  const venueInRate = venue ? venue.inRate : 55
  const hasExhibition = race.racers.some(r => r.exhibition_time)

  const scores = race.racers.map((r, i) => {
    const course = r.boat_number || (i + 1)
    const rank = r.rank || 'B1'
    const winRate = r.win_rate || 5.0
    const motorRate = r.motor_rate || 30.0
    const avgST = r.avg_st ?? null
    const exTime = r.exhibition_time ?? null
    const stEx = r.start_exhibition ?? null

    const base = WIN1_PCT[rank]?.[course] || 5
    const courseScore = (base / 72) * 40
    let venueAdj = 0
    if (course === 1) venueAdj = (venueInRate - 55) * 0.4
    else if (course === 2) venueAdj = (venueInRate - 55) * -0.1
    else if (course >= 5) venueAdj = (55 - venueInRate) * 0.15
    const rateScore = Math.max(0, (winRate - 3.0) * 4.0)
    const motorScore = Math.max(0, (motorRate - 20) * 0.2)
    let stScore = 0
    if (avgST !== null) {
      if (avgST <= 0.13) stScore = 5
      else if (avgST <= 0.17) stScore = 3
      else if (avgST <= 0.20) stScore = 1
      else if (avgST >= 0.25) stScore = -3
    }
    let exScore = 0
    if (exTime && exTime >= 6.0 && exTime < 7.5) exScore = Math.max(-2, (6.85 - exTime) * 15)
    let stExScore = 0
    if (stEx !== null && !isNaN(stEx)) {
      if (stEx < 0) stExScore = -4
      else if (stEx <= 0.10) stExScore = 4
      else if (stEx <= 0.18) stExScore = 2
      else if (stEx >= 0.30) stExScore = -2
    }
    const total = courseScore + venueAdj + rateScore + motorScore + stScore + exScore + stExScore
    return { boat: course, rank, score: total, exhibitionTime: exTime }
  })

  const sorted = [...scores].sort((a, b) => b.score - a.score)
  const boxBoats = sorted.slice(0, 3).map(s => s.boat).sort((a, b) => a - b)

  return { scores: sorted, boxBoats, boxSize: 3, firmness: calcFirmnessV4(sorted, race, venueInRate, hasExhibition) }
}

function calcFirmnessV4(sorted, race, venueInRate, hasExhibition) {
  let score = 0
  const boat1 = race.racers.find(r => (r.boat_number) === 1)
  const boat1rank = boat1?.rank || 'B2'
  const boat1wr = boat1?.win_rate || 0

  if (boat1rank === 'A1') { score += 20; if (boat1wr >= 6.5) score += 5; if (boat1wr >= 7.0) score += 5; if (boat1wr >= 7.5) score += 5; if (boat1wr >= 8.0) score += 5; }
  else if (boat1rank === 'A2') { score += 10; if (boat1wr >= 6.0) score += 3; if (boat1wr >= 6.5) score += 2; }
  else if (boat1rank === 'B1') score += 3

  if (venueInRate >= 60) score += 12
  else if (venueInRate >= 55) score += 8
  else if (venueInRate >= 50) score += 4

  for (const r of race.racers) {
    const boat = r.boat_number
    if (boat >= 3 && r.rank === 'A1') { score -= 8; if ((r.win_rate || 0) >= 7.0) score -= 5; }
  }

  const t3 = sorted.slice(0, 3).reduce((s, x) => s + x.score, 0) / 3
  const b3 = sorted.slice(3, 6).reduce((s, x) => s + x.score, 0) / 3
  const totalRange = sorted[0].score - sorted[5].score
  if (totalRange > 0) { const gapRatio = (t3 - b3) / totalRange; score += Math.min(15, gapRatio * 30) }

  const gap34 = sorted[2].score - sorted[3].score
  const avg = (sorted[0].score + sorted[5].score) / 2 || 1
  score += Math.min(10, (gap34 / avg) * 40)

  if (hasExhibition) {
    const top3set = new Set(sorted.slice(0, 3).map(s => s.boat))
    const withEx = sorted.filter(s => s.exhibitionTime)
    if (withEx.length >= 6) {
      const exRank = [...withEx].sort((a, b) => a.exhibitionTime - b.exhibitionTime)
      const exTop3 = new Set(exRank.slice(0, 3).map(s => s.boat))
      let overlap = 0
      for (const b of top3set) { if (exTop3.has(b)) overlap++ }
      score += overlap * 2.7
    }
  }

  if (boat1?.avg_st != null) {
    if (boat1.avg_st <= 0.13) score += 5
    else if (boat1.avg_st <= 0.17) score += 3
    else if (boat1.avg_st >= 0.22) score -= 3
  }

  return Math.min(100, Math.max(0, Math.round(score)))
}

// ===== V5 Algorithm =====
function windFactor(windDir) {
  if (windDir == null) return 0
  if ([14, 15, 16, 1, 2].includes(windDir)) return 1
  if ([6, 7, 8, 9, 10].includes(windDir)) return -1
  return 0
}

function scoreRaceV5(race) {
  const venue = VENUES[race.venue_name || '']
  const venueInRate = venue ? venue.inRate : 55
  const hasExhibition = race.racers.some(r => r.exhibition_time)
  const wind = race.wind_speed ?? null
  const windDir = race.wind_direction ?? null
  const waveHeight = race.wave_height ?? null
  const weather = race.weather ?? null

  const scores = race.racers.map((r, i) => {
    const course = r.boat_number || (i + 1)
    const rank = r.rank || 'B1'
    const winRate = r.win_rate || 5.0
    const motorRate = r.motor_rate || 30.0
    const boatRate = r.boat_rate ?? null
    const avgST = r.avg_st ?? null
    const exTime = r.exhibition_time ?? null
    const stEx = r.start_exhibition ?? null
    const localWR = r.local_win_rate ?? null
    const weight = r.weight ?? null
    const fCount = r.f_count ?? null

    const base = WIN1_PCT[rank]?.[course] || 5
    const courseScore = (base / 72) * 35
    let venueAdj = 0
    if (course === 1) venueAdj = (venueInRate - 55) * 0.4
    else if (course === 2) venueAdj = (venueInRate - 55) * -0.1
    else if (course >= 5) venueAdj = (55 - venueInRate) * 0.15

    const rateScore = Math.max(0, Math.min(20, (winRate - 3.0) * 3.6))
    let localScore = 0
    if (localWR != null && localWR > 0) localScore = Math.max(0, Math.min(8, (localWR - 3.0) * 1.6))
    const motorScore = Math.max(0, Math.min(10, (motorRate - 20) * 0.25))
    let boatScore = 0
    if (boatRate != null) boatScore = Math.max(0, Math.min(5, (boatRate - 25) * 0.2))

    let stScore = 0
    if (avgST !== null) {
      if (avgST <= 0.12) stScore = 5
      else if (avgST <= 0.14) stScore = 4
      else if (avgST <= 0.16) stScore = 3
      else if (avgST <= 0.18) stScore = 1
      else if (avgST >= 0.23) stScore = -3
      else if (avgST >= 0.20) stScore = -1
    }

    let exScore = 0
    if (exTime && exTime >= 6.0 && exTime < 7.5) exScore = Math.max(-2, (6.85 - exTime) * 15)

    let stExScore = 0
    if (stEx !== null && !isNaN(stEx)) {
      if (stEx < 0) stExScore = -6
      else if (stEx <= 0.08) stExScore = 6
      else if (stEx <= 0.12) stExScore = 4
      else if (stEx <= 0.18) stExScore = 2
      else if (stEx >= 0.30) stExScore = -2
    }
    if (fCount != null && fCount >= 1) stExScore -= 3

    let windScore = 0
    if (wind != null && windDir != null) {
      const wf = windFactor(windDir)
      if (wf > 0) {
        if (course === 1) windScore = Math.min(8, wind * 2.5)
        else if (course === 2) windScore = Math.min(4, wind * 1.0)
        else if (course >= 4) windScore = -Math.min(3, wind * 0.8)
      } else if (wf < 0) {
        if (course === 1) windScore = -Math.min(5, wind * 1.5)
        else if (course === 2) windScore = -Math.min(2, wind * 0.5)
        else if (course >= 4) windScore = Math.min(5, wind * 1.2)
        else if (course === 3) windScore = Math.min(3, wind * 0.8)
      }
      if (wf === 0 && wind >= 3) windScore = -1
    }

    let weightScore = 0
    if (weight != null) {
      if (weight <= 49) weightScore = 3
      else if (weight <= 51) weightScore = 2
      else if (weight <= 53) weightScore = 1
      else if (weight >= 57) weightScore = -1
      else if (weight >= 59) weightScore = -2
    }

    const total = courseScore + venueAdj + rateScore + localScore + motorScore + boatScore + stScore + exScore + stExScore + windScore + weightScore
    return { boat: course, rank, score: total, exhibitionTime: exTime }
  })

  const sorted = [...scores].sort((a, b) => b.score - a.score)

  // Dynamic box selection
  const gap34 = sorted[2].score - sorted[3].score
  const totalRange = sorted[0].score - sorted[5].score
  const relGap = totalRange > 0 ? gap34 / totalRange : 1
  const useBox4 = relGap < 0.18
  const boxSize = useBox4 ? 4 : 3
  const boxBoats = sorted.slice(0, boxSize).map(s => s.boat).sort((a, b) => a - b)

  return { scores: sorted, boxBoats, boxSize, firmness: calcFirmnessV5(sorted, race, venueInRate, hasExhibition, wind, windDir, waveHeight, weather) }
}

function calcFirmnessV5(sorted, race, venueInRate, hasExhibition, wind, windDir, waveHeight, weather) {
  let score = 0
  const boat1 = race.racers.find(r => r.boat_number === 1)
  const boat1rank = boat1?.rank || 'B2'
  const boat1wr = boat1?.win_rate || 0

  if (boat1rank === 'A1') { score += 18; if (boat1wr >= 6.5) score += 4; if (boat1wr >= 7.0) score += 5; if (boat1wr >= 7.5) score += 4; if (boat1wr >= 8.0) score += 4; }
  else if (boat1rank === 'A2') { score += 14; if (boat1wr >= 5.5) score += 3; if (boat1wr >= 6.0) score += 4; if (boat1wr >= 6.5) score += 3; }
  else if (boat1rank === 'B1') { score += 4; if (boat1wr >= 5.0) score += 2; }

  if (venueInRate >= 62) score += 10
  else if (venueInRate >= 58) score += 8
  else if (venueInRate >= 55) score += 6
  else if (venueInRate >= 50) score += 3

  for (const r of race.racers) {
    const boat = r.boat_number
    if (boat >= 3 && r.rank === 'A1') { score -= 10; if ((r.win_rate || 0) >= 7.0) score -= 6; }
    else if (boat >= 4 && r.rank === 'A2' && (r.win_rate || 0) >= 6.5) score -= 4
  }

  const t3avg = sorted.slice(0, 3).reduce((s, x) => s + x.score, 0) / 3
  const b3avg = sorted.slice(3, 6).reduce((s, x) => s + x.score, 0) / 3
  const totalRange = sorted[0].score - sorted[5].score
  if (totalRange > 0) score += Math.min(12, ((t3avg - b3avg) / totalRange) * 25)

  const gap34 = sorted[2].score - sorted[3].score
  if (totalRange > 0) score += Math.min(15, (gap34 / totalRange) * 60)

  if (hasExhibition) {
    const top3set = new Set(sorted.slice(0, 3).map(s => s.boat))
    const withEx = sorted.filter(s => s.exhibitionTime)
    if (withEx.length >= 6) {
      const exRank = [...withEx].sort((a, b) => a.exhibitionTime - b.exhibitionTime)
      const exTop3 = new Set(exRank.slice(0, 3).map(s => s.boat))
      let overlap = 0
      for (const b of top3set) { if (exTop3.has(b)) overlap++ }
      score += overlap * 2.7
    }
  }

  if (boat1?.avg_st != null) {
    if (boat1.avg_st <= 0.12) score += 5
    else if (boat1.avg_st <= 0.15) score += 3
    else if (boat1.avg_st <= 0.18) score += 1
    else if (boat1.avg_st >= 0.22) score -= 4
  }

  if (wind != null) {
    const wf = windDir != null ? windFactor(windDir) : 0
    if (wf > 0 && wind >= 1) score += Math.min(5, wind * 1.5)
    else if (wf < 0) {
      if (wind >= 5) score -= 15
      else if (wind >= 3) score -= 8
      else if (wind >= 2) score -= 3
    }
    if (wind >= 6) score -= 5
  }

  if (waveHeight != null) {
    if (waveHeight <= 1) score += 5
    else if (waveHeight <= 3) score += 2
    else if (waveHeight >= 8) score -= 8
    else if (waveHeight >= 5) score -= 5
  }

  if (weather === '雨' || weather === '雪') score -= 5

  return Math.min(100, Math.max(0, Math.round(score)))
}

// ===== Main =====
const dates = ['2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27']

function runBacktest(version, scoreFunc) {
  let allResults = []

  for (const date of dates) {
    try {
      const raceData = JSON.parse(readFileSync(join(dataDir, `${date}.json`), 'utf8'))
      const resultData = JSON.parse(readFileSync(join(dataDir, `${date}-results.json`), 'utf8'))
      const resultMap = {}
      for (const r of resultData.results) resultMap[`${r.venue_code}-${r.race_number}`] = r

      const analyzed = raceData.races.map(race => {
        const a = scoreFunc(race)
        const key = `${race.venue_code}-${race.race_number}`
        const result = resultMap[key]
        if (!result) return null

        const actualTop3 = [result.first, result.second, result.third].sort((a,b) => a - b)
        const predictedBox = [...a.boxBoats].sort((a,b) => a - b)

        let hit
        if (a.boxSize === 4) {
          hit = actualTop3.every(b => predictedBox.includes(b))
        } else {
          hit = JSON.stringify(actualTop3) === JSON.stringify(predictedBox)
        }

        return { date, venue: race.venue_name, raceNum: race.race_number, firmness: a.firmness, boxBoats: a.boxBoats, boxSize: a.boxSize, actualTop3, hit, payout: result.trifecta_payout }
      }).filter(Boolean)

      allResults.push(...analyzed)
    } catch(e) { console.error(`Error: ${date}: ${e.message}`) }
  }

  return allResults
}

// Run both
const v4Results = runBacktest('v4', scoreRaceV4)
const v5Results = runBacktest('v5', scoreRaceV5)

function printStats(label, results) {
  const totalHits = results.filter(r => r.hit).length
  console.log(`\n===== ${label} (${results.length} races) =====`)
  console.log(`BOX的中率: ${totalHits}/${results.length} = ${(totalHits/results.length*100).toFixed(1)}%`)

  // Box4 usage
  const box4 = results.filter(r => r.boxSize === 4)
  if (box4.length > 0) {
    console.log(`4艇BOX使用: ${box4.length}/${results.length} = ${(box4.length/results.length*100).toFixed(1)}%`)
    const box4hits = box4.filter(r => r.hit).length
    console.log(`4艇BOX的中率: ${box4hits}/${box4.length} = ${(box4hits/box4.length*100).toFixed(1)}%`)
    const box3 = results.filter(r => r.boxSize === 3)
    const box3hits = box3.filter(r => r.hit).length
    console.log(`3艇BOX的中率: ${box3hits}/${box3.length} = ${(box3hits/box3.length*100).toFixed(1)}%`)
  }

  // Firmness brackets
  const brackets = [
    { min: 65, max: 100, label: '超堅(65+)' },
    { min: 50, max: 64, label: '堅い(50-64)' },
    { min: 40, max: 49, label: '普通(40-49)' },
    { min: 0, max: 39, label: '荒れ(0-39)' },
  ]
  for (const b of brackets) {
    const races = results.filter(r => r.firmness >= b.min && r.firmness <= b.max)
    const hits = races.filter(r => r.hit).length
    if (races.length > 0) {
      console.log(`  ${b.label}: ${hits}/${races.length} = ${(hits/races.length*100).toFixed(1)}%`)
    }
  }

  // Top4 plan simulation
  console.log('\n  --- Top4 転がしプラン ---')
  let totalPlanHits = 0, totalPlanRaces = 0
  for (const date of dates) {
    const dayRaces = results.filter(r => r.date === date)
    dayRaces.sort((a, b) => b.firmness - a.firmness)

    // V5 plan: filter firmness >= 40, limit 2 per venue
    let top4
    if (label.includes('v5')) {
      const plan = []
      const vCounts = {}
      for (const r of dayRaces) {
        if (r.firmness < 40) continue
        const vc = r.venue
        if ((vCounts[vc] || 0) >= 2) continue
        plan.push(r)
        vCounts[vc] = (vCounts[vc] || 0) + 1
        if (plan.length >= 4) break
      }
      if (plan.length < 4) {
        for (const r of dayRaces) {
          if (plan.includes(r)) continue
          plan.push(r)
          if (plan.length >= 4) break
        }
      }
      top4 = plan.slice(0, 4)
    } else {
      top4 = dayRaces.slice(0, 4)
    }

    const hits = top4.filter(r => r.hit).length
    totalPlanHits += hits
    totalPlanRaces += top4.length

    console.log(`  ${date}: ${hits}/4 ${top4.map(r => {
      const mark = r.hit ? 'O' : 'X'
      return `${r.venue}${r.raceNum}R[${r.firmness}${r.boxSize===4?'*4':''}]${mark}`
    }).join(' ')}`)
  }
  console.log(`  合計: ${totalPlanHits}/${totalPlanRaces} = ${(totalPlanHits/totalPlanRaces*100).toFixed(1)}%`)

  // Investment calc
  const avgPayout = results.filter(r => r.hit).reduce((s, r) => s + r.payout, 0) / (totalHits || 1)
  console.log(`  的中時平均払戻: ¥${avgPayout.toFixed(0)}`)
}

printStats('v4', v4Results)
printStats('v5', v5Results)

// Direct comparison
console.log('\n===== v4 vs v5 直接比較 =====')
let v4only = 0, v5only = 0, both = 0, neither = 0
for (let i = 0; i < v4Results.length; i++) {
  const v4h = v4Results[i].hit
  const v5h = v5Results[i].hit
  if (v4h && v5h) both++
  else if (v4h && !v5h) v4only++
  else if (!v4h && v5h) v5only++
  else neither++
}
console.log(`両方的中: ${both}`)
console.log(`v4のみ的中: ${v4only}`)
console.log(`v5のみ的中: ${v5only}`)
console.log(`両方不的中: ${neither}`)
console.log(`v5で新たに的中: +${v5only - v4only}`)
