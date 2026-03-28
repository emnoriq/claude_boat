// =============================================
// 堅いレース.ai 分析エンジン v5（精度最大化版）
// =============================================
// v4→v5 改善:
// - 動的BOX選定（3艇 or 4艇を自動判定）
// - 風・波・天候データによる補正
// - 当地勝率・F数・体重の活用
// - 堅さスコアを実績データで再校正
// - ボート2連率の追加
// - 3位-4位ボーダー判定の高精度化

export const VENUES = {
  '桐生':{inRate:54},'戸田':{inRate:43},'江戸川':{inRate:44},
  '平和島':{inRate:46},'多摩川':{inRate:54},'浜名湖':{inRate:52},
  '蒲郡':{inRate:55},'常滑':{inRate:56},'津':{inRate:55},
  '三国':{inRate:52},'琵琶湖':{inRate:51},'住之江':{inRate:56},
  '尼崎':{inRate:55},'鳴門':{inRate:55},'丸亀':{inRate:56},
  '児島':{inRate:53},'宮島':{inRate:55},'徳山':{inRate:60},
  '下関':{inRate:58},'若松':{inRate:56},'芦屋':{inRate:60},
  '福岡':{inRate:52},'唐津':{inRate:55},'大村':{inRate:65},
}

// ボートレース実績に基づく1着率(%) ─ 級別×コース
const WIN1_PCT = {
  A1: { 1: 72, 2: 22, 3: 18, 4: 16, 5: 10, 6: 6 },
  A2: { 1: 58, 2: 17, 3: 14, 4: 12, 5: 7,  6: 4 },
  B1: { 1: 45, 2: 11, 3: 9,  4: 8,  5: 4,  6: 2 },
  B2: { 1: 32, 2: 5,  3: 4,  4: 3,  5: 2,  6: 1 },
}

// 3連対率(%) ─ 級別×コース
const TOP3_PCT = {
  A1: { 1: 90, 2: 62, 3: 56, 4: 52, 5: 40, 6: 30 },
  A2: { 1: 82, 2: 52, 3: 46, 4: 40, 5: 30, 6: 22 },
  B1: { 1: 72, 2: 38, 3: 32, 4: 28, 5: 20, 6: 14 },
  B2: { 1: 55, 2: 22, 3: 18, 4: 15, 5: 10, 6: 7 },
}

// 風向コード → 追い風/向かい風の影響係数（-1=向かい風, +1=追い風）
// boatrace.jpのis-windN: 1=N, 3=NE, 5=E, 7=SE, 9=S, 11=SW, 13=W, 15=NW
// ボートレースは基本的にバック側から風が吹くと追い風
function windFactor(windDir) {
  if (windDir == null) return 0
  // 追い風方向（概ね北寄り）: 14,15,16,1,2
  if ([14, 15, 16, 1, 2].includes(windDir)) return 1
  // 向かい風方向（概ね南寄り）: 6,7,8,9,10
  if ([6, 7, 8, 9, 10].includes(windDir)) return -1
  // 横風: 3,4,5,11,12,13
  return 0
}

export function analyzeAllRaces(races) {
  const results = races.map(race => {
    const venue = VENUES[race.venue_name || '']
    return scoreRace(race, venue)
  })

  results.sort((a, b) => b.firmness - a.firmness)

  // フィルタ: 堅さ45以上のレースのみ候補
  const candidates = results.filter(r => r.firmness >= 40)

  // 同一会場から最大2レースまで
  const planRaces = []
  const venueCounts = {}
  for (const r of candidates) {
    const vc = r.venue_code
    if ((venueCounts[vc] || 0) >= 2) continue
    planRaces.push(r)
    venueCounts[vc] = (venueCounts[vc] || 0) + 1
    if (planRaces.length >= 4) break
  }

  // 足りない場合は堅さ順で補充
  if (planRaces.length < 4) {
    for (const r of results) {
      if (planRaces.includes(r)) continue
      planRaces.push(r)
      if (planRaces.length >= 4) break
    }
  }

  // 時刻順にソート
  planRaces.sort((a, b) => {
    const ta = (a.time || '').replace(':', '')
    const tb = (b.time || '').replace(':', '')
    return ta.localeCompare(tb)
  })

  return { plan: planRaces.slice(0, 4), ranking: results }
}

function scoreRace(race, venue) {
  const venueInRate = venue ? venue.inRate : 55
  const hasExhibition = race.racers.some(r => r.exhibition_time)

  // レース条件
  const wind = race.wind_speed ?? null
  const windDir = race.wind_direction ?? null
  const waveHeight = race.wave_height ?? null
  const weather = race.weather ?? null

  // === 各艇の「力」スコアを0-100で算出 ===
  const scores = race.racers.map((r, i) => {
    const course = r.boat || r.boat_number || (i + 1)
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

    // (1) コース×級別のベース（0〜72）→ 正規化して0〜35
    const base = WIN1_PCT[rank]?.[course] || 5
    const courseScore = (base / 72) * 35

    // (2) 会場イン率でコース補正（±4）
    let venueAdj = 0
    if (course === 1) venueAdj = (venueInRate - 55) * 0.4
    else if (course === 2) venueAdj = (venueInRate - 55) * -0.1
    else if (course >= 5) venueAdj = (55 - venueInRate) * 0.15

    // (3) 全国勝率（3.0〜8.5 → 0〜20点）
    const rateScore = Math.max(0, Math.min(20, (winRate - 3.0) * 3.6))

    // (4) 当地勝率（0〜8点）
    let localScore = 0
    if (localWR != null && localWR > 0) {
      localScore = Math.max(0, Math.min(8, (localWR - 3.0) * 1.6))
    }

    // (5) モーター2連率（20〜60% → 0〜10点）
    const motorScore = Math.max(0, Math.min(10, (motorRate - 20) * 0.25))

    // (6) ボート2連率（0〜5点）
    let boatScore = 0
    if (boatRate != null) {
      boatScore = Math.max(0, Math.min(5, (boatRate - 25) * 0.2))
    }

    // (7) 平均ST（-3〜5点）
    let stScore = 0
    if (avgST !== null) {
      if (avgST <= 0.12) stScore = 5
      else if (avgST <= 0.14) stScore = 4
      else if (avgST <= 0.16) stScore = 3
      else if (avgST <= 0.18) stScore = 1
      else if (avgST >= 0.23) stScore = -3
      else if (avgST >= 0.20) stScore = -1
    }

    // (8) 展示タイム（-2〜8点）
    let exScore = 0
    if (exTime && exTime >= 6.0 && exTime < 7.5) {
      exScore = Math.max(-2, (6.85 - exTime) * 15)
    }

    // (9) スタート展示（-6〜6点）
    let stExScore = 0
    if (stEx !== null && !isNaN(stEx)) {
      if (stEx < 0) stExScore = -6           // フライング→本番で慎重
      else if (stEx <= 0.08) stExScore = 6    // 攻めたスタート
      else if (stEx <= 0.12) stExScore = 4
      else if (stEx <= 0.18) stExScore = 2
      else if (stEx >= 0.30) stExScore = -2
    }
    // F持ち選手は追加ペナルティ
    if (fCount != null && fCount >= 1) {
      stExScore -= 3  // F持ちはスタート慎重になる
    }

    // (10) 風の影響（-5〜+8点）
    let windScore = 0
    if (wind != null && windDir != null) {
      const wf = windFactor(windDir)
      if (wf > 0) {
        // 追い風: インコース有利
        if (course === 1) windScore = Math.min(8, wind * 2.5)
        else if (course === 2) windScore = Math.min(4, wind * 1.0)
        else if (course >= 4) windScore = -Math.min(3, wind * 0.8)
      } else if (wf < 0) {
        // 向かい風: アウトコース有利
        if (course === 1) windScore = -Math.min(5, wind * 1.5)
        else if (course === 2) windScore = -Math.min(2, wind * 0.5)
        else if (course >= 4) windScore = Math.min(5, wind * 1.2)
        else if (course === 3) windScore = Math.min(3, wind * 0.8)
      }
      // 横風: 全体的に不安定（微マイナス）
      if (wf === 0 && wind >= 3) windScore = -1
    }

    // (11) 体重補正（-2〜+3点）
    let weightScore = 0
    if (weight != null) {
      // 軽い方が加速有利（特にアウトコース）
      if (weight <= 49) weightScore = 3
      else if (weight <= 51) weightScore = 2
      else if (weight <= 53) weightScore = 1
      else if (weight >= 57) weightScore = -1
      else if (weight >= 59) weightScore = -2
    }

    const total = courseScore + venueAdj + rateScore + localScore +
                  motorScore + boatScore + stScore + exScore + stExScore +
                  windScore + weightScore

    return {
      boat: course, rank, score: total,
      winRate, motorRate, exhibitionTime: exTime, startEx: stEx,
      localWR, boatRate, weight, fCount, windScore,
    }
  })

  const sorted = [...scores].sort((a, b) => b.score - a.score)

  // === 動的BOX選定（3艇 or 4艇）===
  const gap34 = sorted[2].score - sorted[3].score
  const totalRange = sorted[0].score - sorted[5].score
  const relativeGap = totalRange > 0 ? gap34 / totalRange : 1

  // 3位-4位の差が小さい → 4艇BOX（閾値0.18=バックテスト最適値）
  const useBox4 = relativeGap < 0.18
  const boxSize = useBox4 ? 4 : 3

  const topN = sorted.slice(0, boxSize)
  const boxBoats = topN.map(s => s.boat).sort((a, b) => a - b)
  const boxCombos = genBoxCombos(boxBoats)

  // === 確率計算 ===
  const probs = calcProbs(scores)

  let boxProb = 0
  const details = boxCombos.map(([a, b, c]) => {
    const p = probs[`${a}-${b}-${c}`] || 0
    boxProb += p
    return { combo: [a, b, c], prob: p }
  })
  details.sort((a, b) => b.prob - a.prob)

  const firmness = calcFirmnessV5(sorted, race, venueInRate, hasExhibition, wind, windDir, waveHeight, weather)

  return {
    venue_code: race.venue_code,
    venue_name: race.venue_name || '',
    race_number: race.race_number,
    time: race.start_time || '',
    scores: sorted,
    boxBoats,
    boxSize,
    boxCombos: details,
    boxProb,
    firmness,
    racers: race.racers,
    // 気象情報
    wind_speed: wind,
    wind_direction: windDir,
    wave_height: waveHeight,
    weather,
  }
}

function genBoxCombos(boats) {
  const c = []
  if (boats.length === 3) {
    // 3艇BOX: 6通りの三連単 → 三連複は1通り
    for (let i = 0; i < boats.length; i++)
      for (let j = 0; j < boats.length; j++) {
        if (j === i) continue
        for (let k = 0; k < boats.length; k++) {
          if (k === i || k === j) continue
          c.push([boats[i], boats[j], boats[k]])
        }
      }
  } else if (boats.length === 4) {
    // 4艇BOX: 4C3=4通りの三連複 × 各6通り = 24通りの三連単
    for (let i = 0; i < boats.length; i++)
      for (let j = 0; j < boats.length; j++) {
        if (j === i) continue
        for (let k = 0; k < boats.length; k++) {
          if (k === i || k === j) continue
          c.push([boats[i], boats[j], boats[k]])
        }
      }
  }
  return c
}

/**
 * 確率計算 v5
 * - スコアを0-1に正規化してからsoftmax
 * - 温度は固定でスコアレンジに依存しない
 * - 条件付き確率で三連単確率を正しく計算
 */
function calcProbs(scores) {
  const maxS = Math.max(...scores.map(s => s.score))
  const minS = Math.min(...scores.map(s => s.score))
  const range = maxS - minS || 1
  const norm = scores.map(s => (s.score - minS) / range)

  const t = 0.35
  const ex = norm.map(n => Math.exp(n / t))
  const se = ex.reduce((a, b) => a + b, 0)
  const p = ex.map(e => e / se)

  const out = {}
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      if (j === i) continue
      for (let k = 0; k < 6; k++) {
        if (k === i || k === j) continue
        const p1 = p[i]
        const rem1 = 1 - p[i]
        if (rem1 <= 0) continue
        const p2 = p[j] / rem1
        const rem2 = rem1 - p[j]
        if (rem2 <= 0) continue
        const p3 = p[k] / rem2
        const prob = p1 * p2 * p3
        out[`${scores[i].boat}-${scores[j].boat}-${scores[k].boat}`] = prob
      }
    }
  }
  return out
}

/**
 * 堅さスコア v5（実績データ校正版）
 *
 * バックテスト結果からの知見:
 * - A2の1コースはA1より的中率が高い（27.3% vs 19.7%）
 * - 3位-4位のボーダー差が的中に直結
 * - 風・波が荒れの最大要因
 * - 展示データの整合性が重要
 */
function calcFirmnessV5(sorted, race, venueInRate, hasExhibition, wind, windDir, waveHeight, weather) {
  let score = 0

  const boat1 = race.racers.find(r => (r.boat || r.boat_number) === 1)
  const boat1rank = boat1?.rank || 'B2'
  const boat1wr = boat1?.win_rate || 0

  // ===== (1) 1コース選手の強さ（最大35点） =====
  if (boat1rank === 'A1') {
    score += 18
    if (boat1wr >= 6.5) score += 4
    if (boat1wr >= 7.0) score += 5
    if (boat1wr >= 7.5) score += 4
    if (boat1wr >= 8.0) score += 4
  } else if (boat1rank === 'A2') {
    // A2はバックテストで高い的中率を示したため、A1寄りの評価
    score += 14
    if (boat1wr >= 5.5) score += 3
    if (boat1wr >= 6.0) score += 4
    if (boat1wr >= 6.5) score += 3
  } else if (boat1rank === 'B1') {
    score += 4
    if (boat1wr >= 5.0) score += 2
  }

  // ===== (2) 会場イン率（最大10点） =====
  if (venueInRate >= 62) score += 10
  else if (venueInRate >= 58) score += 8
  else if (venueInRate >= 55) score += 6
  else if (venueInRate >= 50) score += 3

  // ===== (3) 外コースの脅威（大幅減点） =====
  for (const r of race.racers) {
    const boat = r.boat || r.boat_number
    if (boat >= 3 && r.rank === 'A1') {
      score -= 10
      if ((r.win_rate || 0) >= 7.0) score -= 6
    } else if (boat >= 4 && r.rank === 'A2' && (r.win_rate || 0) >= 6.5) {
      score -= 4
    }
  }

  // ===== (4) 上位3 vs 下位3 のスコア差（最大12点） =====
  const t3avg = sorted.slice(0, 3).reduce((s, x) => s + x.score, 0) / 3
  const b3avg = sorted.slice(3, 6).reduce((s, x) => s + x.score, 0) / 3
  const totalRange = sorted[0].score - sorted[5].score
  if (totalRange > 0) {
    const gapRatio = (t3avg - b3avg) / totalRange
    score += Math.min(12, gapRatio * 25)
  }

  // ===== (5) 3位-4位ボーダーの明確さ（最大15点）★重要 =====
  const gap34 = sorted[2].score - sorted[3].score
  if (totalRange > 0) {
    const relGap = gap34 / totalRange
    score += Math.min(15, relGap * 60)
  }

  // ===== (6) 展示タイムの裏付け（最大8点） =====
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

  // ===== (7) 1コースST（最大5点） =====
  if (boat1?.avg_st != null) {
    if (boat1.avg_st <= 0.12) score += 5
    else if (boat1.avg_st <= 0.15) score += 3
    else if (boat1.avg_st <= 0.18) score += 1
    else if (boat1.avg_st >= 0.22) score -= 4
  }

  // ===== (8) 風の影響（-15〜+5点）★新規 =====
  if (wind != null) {
    const wf = windDir != null ? windFactor(windDir) : 0
    if (wf > 0 && wind >= 1) {
      // 追い風 = インコース有利 = 堅くなりやすい
      score += Math.min(5, wind * 1.5)
    } else if (wf < 0) {
      // 向かい風 = アウト有利 = 荒れやすい
      if (wind >= 5) score -= 15
      else if (wind >= 3) score -= 8
      else if (wind >= 2) score -= 3
    }
    // 強風（方向問わず）は荒れ要因
    if (wind >= 6) score -= 5
  }

  // ===== (9) 波高（-8〜+5点）★新規 =====
  if (waveHeight != null) {
    if (waveHeight <= 1) score += 5    // 静水面
    else if (waveHeight <= 3) score += 2
    else if (waveHeight >= 8) score -= 8
    else if (waveHeight >= 5) score -= 5
  }

  // ===== (10) 天候（-5〜0点）★新規 =====
  if (weather === '雨' || weather === '雪') {
    score -= 5
  }

  return Math.min(100, Math.max(0, Math.round(score)))
}

export function firmBadge(f) {
  if (f >= 65) return { text: '超堅', cls: 'badge-s' }
  if (f >= 50) return { text: '堅い', cls: 'badge-a' }
  if (f >= 35) return { text: '普通', cls: 'badge-b' }
  return { text: '荒れ', cls: 'badge-c' }
}

// 風向コードを文字列に変換
export function windDirText(code) {
  if (code == null) return ''
  const dirs = {
    1:'北',2:'北北東',3:'北東',4:'東北東',
    5:'東',6:'東南東',7:'南東',8:'南南東',
    9:'南',10:'南南西',11:'南西',12:'西南西',
    13:'西',14:'西北西',15:'北西',16:'北北西'
  }
  return dirs[code] || ''
}

// 追い風/向かい風判定
export function windType(windDir, windSpeed) {
  if (windDir == null || windSpeed == null || windSpeed === 0) return ''
  const wf = windFactor(windDir)
  if (wf > 0) return '追'
  if (wf < 0) return '向'
  return '横'
}
