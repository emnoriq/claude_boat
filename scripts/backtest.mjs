#!/usr/bin/env node
/**
 * バックテスト: 現行アルゴリズム v4 の的中率分析
 * 3日分のデータ（3/24, 3/25, 3/26）で検証
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'public', 'data')

// ===== analysis.js のロジックをインライン =====
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

function scoreRace(race) {
  const venue = VENUES[race.venue_name || '']
  const venueInRate = venue ? venue.inRate : 55
  const hasExhibition = race.racers.some(r => r.exhibition_time)

  const scores = race.racers.map((r, i) => {
    const course = r.boat_number || r.boat || (i + 1)
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
    if (exTime && exTime >= 6.0 && exTime < 7.5) {
      exScore = Math.max(-2, (6.85 - exTime) * 15)
    }

    let stExScore = 0
    if (stEx !== null && !isNaN(stEx)) {
      if (stEx < 0) stExScore = -4
      else if (stEx <= 0.10) stExScore = 4
      else if (stEx <= 0.18) stExScore = 2
      else if (stEx >= 0.30) stExScore = -2
    }

    const total = courseScore + venueAdj + rateScore + motorScore + stScore + exScore + stExScore
    return {
      boat: course, rank, score: total,
      winRate, motorRate, exhibitionTime: exTime, startEx: stEx,
    }
  })

  const sorted = [...scores].sort((a, b) => b.score - a.score)
  const top3 = sorted.slice(0, 3)
  const boxBoats = top3.map(s => s.boat).sort((a, b) => a - b)

  return {
    venue_code: race.venue_code,
    venue_name: race.venue_name || '',
    race_number: race.race_number,
    time: race.start_time || '',
    scores: sorted,
    boxBoats,
    firmness: calcFirmness(sorted, race, venueInRate, hasExhibition),
    racers: race.racers,
  }
}

function calcFirmness(sorted, race, venueInRate, hasExhibition) {
  let score = 0
  const boat1 = race.racers.find(r => (r.boat_number || r.boat) === 1)
  const boat1rank = boat1?.rank || 'B2'
  const boat1wr = boat1?.win_rate || 0

  if (boat1rank === 'A1') {
    score += 20
    if (boat1wr >= 6.5) score += 5
    if (boat1wr >= 7.0) score += 5
    if (boat1wr >= 7.5) score += 5
    if (boat1wr >= 8.0) score += 5
  } else if (boat1rank === 'A2') {
    score += 10
    if (boat1wr >= 6.0) score += 3
    if (boat1wr >= 6.5) score += 2
  } else if (boat1rank === 'B1') {
    score += 3
  }

  if (venueInRate >= 60) score += 12
  else if (venueInRate >= 55) score += 8
  else if (venueInRate >= 50) score += 4

  for (const r of race.racers) {
    const boat = r.boat_number || r.boat
    if (boat >= 3 && r.rank === 'A1') {
      const wr = r.win_rate || 0
      score -= 8
      if (wr >= 7.0) score -= 5
    }
  }

  const t3 = sorted.slice(0, 3).reduce((s, x) => s + x.score, 0) / 3
  const b3 = sorted.slice(3, 6).reduce((s, x) => s + x.score, 0) / 3
  const totalRange = sorted[0].score - sorted[5].score
  if (totalRange > 0) {
    const gapRatio = (t3 - b3) / totalRange
    score += Math.min(15, gapRatio * 30)
  }

  const gap_3_4 = sorted[2].score - sorted[3].score
  const avg = (sorted[0].score + sorted[5].score) / 2 || 1
  const relGap = gap_3_4 / avg
  score += Math.min(10, relGap * 40)

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

// ===== バックテスト実行 =====
const dates = ['2026-03-24', '2026-03-25', '2026-03-26']
let allAnalyzed = []

for (const date of dates) {
  try {
    const raceData = JSON.parse(readFileSync(join(dataDir, `${date}.json`), 'utf8'))
    const resultData = JSON.parse(readFileSync(join(dataDir, `${date}-results.json`), 'utf8'))

    const resultMap = {}
    for (const r of resultData.results) {
      resultMap[`${r.venue_code}-${r.race_number}`] = r
    }

    for (const race of raceData.races) {
      const analyzed = scoreRace(race)
      const key = `${race.venue_code}-${race.race_number}`
      const result = resultMap[key]
      if (result) {
        const actualTop3 = [result.first, result.second, result.third].sort((a,b) => a - b)
        const predictedTop3 = analyzed.boxBoats.sort((a,b) => a - b)
        const hit = JSON.stringify(actualTop3) === JSON.stringify(predictedTop3)

        // top3に何人入っていたか
        const overlap = predictedTop3.filter(b => actualTop3.includes(b)).length

        allAnalyzed.push({
          date,
          venue: analyzed.venue_name,
          raceNum: analyzed.race_number,
          firmness: analyzed.firmness,
          predictedTop3: predictedTop3,
          actualTop3: actualTop3,
          hit,
          overlap,
          payout: result.trifecta_payout,
          boat1rank: race.racers.find(r => (r.boat_number || r.boat) === 1)?.rank,
          boat1wr: race.racers.find(r => (r.boat_number || r.boat) === 1)?.win_rate,
          scores: analyzed.scores,
        })
      }
    }
  } catch(e) {
    console.error(`Error loading ${date}:`, e.message)
  }
}

console.log(`\n===== バックテスト結果 (${allAnalyzed.length} レース) =====\n`)

// 全体的中率
const totalHits = allAnalyzed.filter(r => r.hit).length
console.log(`全体的中率: ${totalHits}/${allAnalyzed.length} = ${(totalHits/allAnalyzed.length*100).toFixed(1)}%`)
console.log(`2艇一致率: ${allAnalyzed.filter(r => r.overlap >= 2).length}/${allAnalyzed.length} = ${(allAnalyzed.filter(r => r.overlap >= 2).length/allAnalyzed.length*100).toFixed(1)}%`)

// 堅さスコア別の的中率
console.log('\n--- 堅さスコア別 ---')
const brackets = [
  { min: 65, max: 100, label: '超堅(65+)' },
  { min: 50, max: 64, label: '堅い(50-64)' },
  { min: 35, max: 49, label: '普通(35-49)' },
  { min: 0, max: 34, label: '荒れ(0-34)' },
]
for (const b of brackets) {
  const races = allAnalyzed.filter(r => r.firmness >= b.min && r.firmness <= b.max)
  const hits = races.filter(r => r.hit).length
  const overlap2 = races.filter(r => r.overlap >= 2).length
  console.log(`${b.label}: ${hits}/${races.length} = ${races.length ? (hits/races.length*100).toFixed(1) : 0}% (2艇一致: ${races.length ? (overlap2/races.length*100).toFixed(1) : 0}%)`)
}

// Top4のみ（転がしプラン相当）
console.log('\n--- Top4 転がしプラン ---')
for (const date of dates) {
  const dayRaces = allAnalyzed.filter(r => r.date === date)
  dayRaces.sort((a, b) => b.firmness - a.firmness)
  const top4 = dayRaces.slice(0, 4)
  console.log(`\n${date}:`)
  for (const r of top4) {
    const mark = r.hit ? '◎的中' : r.overlap >= 2 ? '△2艇' : '✕外れ'
    console.log(`  ${r.venue}${r.raceNum}R [堅${r.firmness}] 予${r.predictedTop3} → 実${r.actualTop3} ${mark} (払戻¥${r.payout})`)
  }
  const planHits = top4.filter(r => r.hit).length
  console.log(`  → 的中: ${planHits}/4`)
}

// 1号艇の級別×結果分析
console.log('\n--- 1号艇の級別別 ---')
for (const rank of ['A1', 'A2', 'B1', 'B2']) {
  const races = allAnalyzed.filter(r => r.boat1rank === rank)
  const hits = races.filter(r => r.hit).length
  const avgFirm = races.reduce((s, r) => s + r.firmness, 0) / races.length
  console.log(`1号艇${rank}: ${hits}/${races.length} = ${races.length ? (hits/races.length*100).toFixed(1) : 0}% (平均堅さ: ${avgFirm.toFixed(1)})`)
}

// 的中したレースの特徴分析
console.log('\n--- 的中レースの特徴 ---')
const hitRaces = allAnalyzed.filter(r => r.hit)
const missRaces = allAnalyzed.filter(r => !r.hit)

const avgHitFirmness = hitRaces.reduce((s, r) => s + r.firmness, 0) / hitRaces.length
const avgMissFirmness = missRaces.reduce((s, r) => s + r.firmness, 0) / missRaces.length
console.log(`的中レースの平均堅さ: ${avgHitFirmness.toFixed(1)}`)
console.log(`外れレースの平均堅さ: ${avgMissFirmness.toFixed(1)}`)

const avgHitPayout = hitRaces.reduce((s, r) => s + r.payout, 0) / hitRaces.length
console.log(`的中レースの平均払戻: ¥${avgHitPayout.toFixed(0)}`)

// スコア差分析
const hitGaps = hitRaces.map(r => r.scores[0].score - r.scores[2].score)
const missGaps = missRaces.map(r => r.scores[0].score - r.scores[2].score)
console.log(`的中レースの1位-3位スコア差: ${(hitGaps.reduce((a,b)=>a+b,0)/hitGaps.length).toFixed(2)}`)
console.log(`外れレースの1位-3位スコア差: ${(missGaps.reduce((a,b)=>a+b,0)/missGaps.length).toFixed(2)}`)

// 3位-4位の差（ボーダーの明確さ）
const hitBorder = hitRaces.map(r => r.scores[2].score - r.scores[3].score)
const missBorder = missRaces.map(r => r.scores[2].score - r.scores[3].score)
console.log(`的中レースの3位-4位ボーダー: ${(hitBorder.reduce((a,b)=>a+b,0)/hitBorder.length).toFixed(2)}`)
console.log(`外れレースの3位-4位ボーダー: ${(missBorder.reduce((a,b)=>a+b,0)/missBorder.length).toFixed(2)}`)

// 会場別
console.log('\n--- 会場別的中率 ---')
const venueStats = {}
for (const r of allAnalyzed) {
  if (!venueStats[r.venue]) venueStats[r.venue] = { total: 0, hits: 0 }
  venueStats[r.venue].total++
  if (r.hit) venueStats[r.venue].hits++
}
const venueSorted = Object.entries(venueStats).sort((a,b) => (b[1].hits/b[1].total) - (a[1].hits/a[1].total))
for (const [v, s] of venueSorted) {
  console.log(`  ${v}: ${s.hits}/${s.total} = ${(s.hits/s.total*100).toFixed(0)}%`)
}

// 外れ分析: 予想TOP3のうち、何番目が外れやすいか
console.log('\n--- 外れパターン分析 ---')
let missed1st = 0, missed2nd = 0, missed3rd = 0
for (const r of missRaces) {
  if (!r.actualTop3.includes(r.scores[0].boat)) missed1st++
  if (!r.actualTop3.includes(r.scores[1].boat)) missed2nd++
  if (!r.actualTop3.includes(r.scores[2].boat)) missed3rd++
}
console.log(`予想1位が3着外: ${missed1st}/${missRaces.length} = ${(missed1st/missRaces.length*100).toFixed(1)}%`)
console.log(`予想2位が3着外: ${missed2nd}/${missRaces.length} = ${(missed2nd/missRaces.length*100).toFixed(1)}%`)
console.log(`予想3位が3着外: ${missed3rd}/${missRaces.length} = ${(missed3rd/missRaces.length*100).toFixed(1)}%`)

// 4位の選手が3着に入る率
let fourth_in = 0
for (const r of allAnalyzed) {
  if (r.actualTop3.includes(r.scores[3].boat)) fourth_in++
}
console.log(`\n予想4位が実際3着内: ${fourth_in}/${allAnalyzed.length} = ${(fourth_in/allAnalyzed.length*100).toFixed(1)}%`)

// 5位, 6位
let fifth_in = 0, sixth_in = 0
for (const r of allAnalyzed) {
  if (r.actualTop3.includes(r.scores[4].boat)) fifth_in++
  if (r.actualTop3.includes(r.scores[5].boat)) sixth_in++
}
console.log(`予想5位が実際3着内: ${fifth_in}/${allAnalyzed.length} = ${(fifth_in/allAnalyzed.length*100).toFixed(1)}%`)
console.log(`予想6位が実際3着内: ${sixth_in}/${allAnalyzed.length} = ${(sixth_in/allAnalyzed.length*100).toFixed(1)}%`)

// 日別集計
console.log('\n--- 日別的中率 ---')
for (const date of dates) {
  const dayRaces = allAnalyzed.filter(r => r.date === date)
  const hits = dayRaces.filter(r => r.hit).length
  console.log(`${date}: ${hits}/${dayRaces.length} = ${(hits/dayRaces.length*100).toFixed(1)}%`)
}
