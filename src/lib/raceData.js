import { supabase, isSupabaseConfigured } from './supabase.js'

const VENUES = {
  '01':'桐生','02':'戸田','03':'江戸川','04':'平和島','05':'多摩川',
  '06':'浜名湖','07':'蒲郡','08':'常滑','09':'津','10':'三国',
  '11':'琵琶湖','12':'住之江','13':'尼崎','14':'鳴門','15':'丸亀',
  '16':'児島','17':'宮島','18':'徳山','19':'下関','20':'若松',
  '21':'芦屋','22':'福岡','23':'唐津','24':'大村',
}

const CORS_PROXIES = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

const RACE_TIMES = [
  '10:30','11:00','11:32','12:05','12:38','13:12',
  '13:48','14:25','15:03','15:42','16:22','16:57',
]

export async function fetchAllRacesForDate(raceDate, onProgress) {
  // まず静的JSONを試す（最速・最安定）
  onProgress?.('データ読み込み中...')
  try {
    const res = await fetch(`/data/${raceDate}.json`)
    if (res.ok) {
      const json = await res.json()
      const races = json.races || json
      if (races && races.length > 0) {
        onProgress?.(`${races.length}レース読み込み完了`)
        return races
      }
    }
  } catch { /* 静的JSONなし → フォールバック */ }

  if (isSupabaseConfigured) {
    return fetchAllFromSupabase(raceDate, onProgress)
  }

  // CORSプロキシも試すが、失敗したら分かりやすいエラー
  try {
    return await fetchAllWithScraper(raceDate, onProgress)
  } catch {
    throw new Error(`${raceDate} のデータはまだ準備されていません。現在データがあるのは最近数日分のみです。`)
  }
}

async function fetchAllFromSupabase(raceDate, onProgress) {
  onProgress?.('Supabaseからデータ確認中...')
  const { data: existing, error } = await supabase
    .from('races')
    .select(`
      id, race_number, start_time, venue_code, venue_name, race_date,
      racers ( id, boat_number, racer_name, rank, win_rate, two_rate, motor_rate, boat_rate )
    `)
    .eq('race_date', raceDate)
    .order('venue_code').order('race_number')

  if (error) throw new Error('データベース接続エラー')
  if (existing && existing.length > 0) return existing

  onProgress?.('全場データをスクレイピング中...')
  const res = await fetch(`/api/scrape-all?date=${raceDate}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'スクレイパーAPIエラー')
  }
  const scraped = await res.json()
  if (!scraped.races || scraped.races.length === 0) throw new Error('レースデータが見つかりません')
  return scraped.races
}

async function fetchAllWithScraper(raceDate, onProgress) {
  const hd = raceDate.replace(/-/g, '')
  const allRaces = []

  onProgress?.('開催場を検出中...')
  const activeVenues = await detectActiveVenues(hd)
  onProgress?.(`${activeVenues.length}場で開催中`)

  for (let vi = 0; vi < activeVenues.length; vi++) {
    const { code, name } = activeVenues[vi]
    onProgress?.(`${name} (${vi + 1}/${activeVenues.length}) 取得中...`)

    // 3レースずつ並列取得（高速化）
    for (let start = 1; start <= 12; start += 3) {
      const batch = [start, start+1, start+2].filter(n => n <= 12)
      const results = await Promise.allSettled(
        batch.map(rno => scrapeRace(code, name, rno, hd))
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) allRaces.push(r.value)
      }
    }
  }

  if (allRaces.length === 0) throw new Error('レースデータが見つかりません')
  return allRaces
}

/**
 * 1レース分のデータを取得（出走表＋直前情報）
 */
async function scrapeRace(venueCode, venueName, rno, hd) {
  const url = `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${rno}&jcd=${venueCode}&hd=${hd}`
  const html = await fetchWithProxy(url)
  if (!html) return null
  if (!html.includes('is-boatColor1')) return null

  const racers = parseRacelist(html)
  if (racers.length < 6) return null

  const startTime = parseStartTime(html, rno)
  return { venue_code: venueCode, venue_name: venueName, race_number: rno, start_time: startTime, racers }
}

/**
 * 出走表HTML解析（実HTMLに基づく正確なパーサー）
 *
 * 構造:
 *   <tbody class="is-fs12">
 *     <tr>
 *       <td class="is-boatColor1 is-fs14" rowspan="4">１</td>
 *       <td>写真</td>
 *       <td>登録番号 / <span>A2</span> + 選手名</td>
 *       <td>F0<br>L0<br>平均ST(0.15)</td>
 *       <td>全国勝率(6.02)<br>全国2連率(40.59)<br>全国3連率(56.44)</td>
 *       <td>当地勝率<br>当地2連率<br>当地3連率</td>
 *       <td>モーター番号<br>モーター2連率<br>モーター3連率</td>
 *       <td>ボート番号<br>ボート2連率<br>ボート3連率</td>
 *     </tr>
 *   </tbody>
 */
function parseRacelist(html) {
  const racers = []

  // tbody単位で分割
  const tbodyRe = /<tbody[^>]*is-fs12[^>]*>([\s\S]*?)<\/tbody>/gi
  let tm
  while ((tm = tbodyRe.exec(html)) !== null) {
    const tbody = tm[1]

    // 艇番を検出
    const boatMatch = tbody.match(/is-boatColor(\d)/)
    if (!boatMatch) continue
    const boatNum = parseInt(boatMatch[1])
    if (boatNum < 1 || boatNum > 6) continue
    if (racers.some(r => r.boat_number === boatNum)) continue

    // 選手名: <div class="is-fs18 is-fBold"><a href="...">選手名</a>
    const nameMatch = tbody.match(/is-fs18[^>]*>[\s]*<a[^>]*>([^<]+)<\/a>/)
    const racerName = nameMatch ? nameMatch[1].replace(/\s+/g, '') : ''

    // 級別: / <span class=" ">A2</span>
    const rankMatch = tbody.match(/\/\s*<span[^>]*>\s*([AB][12])\s*<\/span>/)
    const rank = rankMatch ? rankMatch[1] : 'B1'

    // rowspan="4"のtdを順番に取得（写真td除外）
    // td[rowspan="4"]の中身を順番に取得
    const rowspanTds = []
    const tdRe = /<td[^>]*rowspan="4"[^>]*>([\s\S]*?)<\/td>/gi
    let tdm
    while ((tdm = tdRe.exec(tbody)) !== null) {
      rowspanTds.push(tdm[1])
    }

    // rowspanTdsの内容:
    // [0] 艇番, [1] 写真, [2] 選手情報, [3] F/L/ST, [4] 全国成績, [5] 当地成績, [6] モーター, [7] ボート

    // 平均ST（F0/L0/0.15 の3行目）
    let avgST = null
    if (rowspanTds[3]) {
      const stMatch = rowspanTds[3].match(/(\d\.\d{2})\s*$/)
      if (stMatch) avgST = parseFloat(stMatch[1])
    }

    // 全国成績: "6.02<br>40.59<br>56.44" → 勝率, 2連率, 3連率
    let winRate = 5.0, twoRate = null, threeRate = null
    if (rowspanTds[4]) {
      const nums = extractNumbers(rowspanTds[4])
      if (nums.length >= 1) winRate = nums[0]
      if (nums.length >= 2) twoRate = nums[1]
      if (nums.length >= 3) threeRate = nums[2]
    }

    // 当地成績
    let localWinRate = null, localTwoRate = null
    if (rowspanTds[5]) {
      const nums = extractNumbers(rowspanTds[5])
      if (nums.length >= 1) localWinRate = nums[0]
      if (nums.length >= 2) localTwoRate = nums[1]
    }

    // モーター: "60<br>44.91<br>60.65" → 番号, 2連率, 3連率
    let motorRate = 30.0
    if (rowspanTds[6]) {
      const nums = extractNumbers(rowspanTds[6])
      if (nums.length >= 2) motorRate = nums[1]  // 2連率
    }

    // ボート: "164<br>34.70<br>55.71"
    let boatRate = null
    if (rowspanTds[7]) {
      const nums = extractNumbers(rowspanTds[7])
      if (nums.length >= 2) boatRate = nums[1]  // 2連率
    }

    racers.push({
      boat_number: boatNum,
      racer_name: racerName,
      rank,
      win_rate: winRate,
      two_rate: twoRate,
      motor_rate: motorRate,
      boat_rate: boatRate,
      avg_st: avgST,
      local_win_rate: localWinRate,
      local_two_rate: localTwoRate,
    })
  }

  return racers.sort((a, b) => a.boat_number - b.boat_number)
}

/**
 * 直前情報HTML解析
 *
 * 展示タイム構造:
 *   <tbody class="is-fs12">
 *     <td class="is-boatColor1">1</td>
 *     <td rowspan="4">6.73</td>     ← 展示タイム
 *     <td rowspan="4">0.0</td>      ← チルト
 *   </tbody>
 *
 * スタート展示構造:
 *   <span class="table1_boatImage1Number is-type1">1</span>
 *   <span class="table1_boatImage1Time">.11</span>
 *   フライング: <span class="table1_boatImage1Time is-fBold is-fColor1">F.01</span>
 */
function parseBeforeInfo(html, racers) {
  // 展示タイム: tbody内のis-boatColorNの後のrowspan="4"
  const tbodyRe = /<tbody[^>]*is-fs12[^>]*>([\s\S]*?)<\/tbody>/gi
  let tm
  while ((tm = tbodyRe.exec(html)) !== null) {
    const tbody = tm[1]
    const boatMatch = tbody.match(/is-boatColor(\d)/)
    if (!boatMatch) continue
    const boatNum = parseInt(boatMatch[1])

    // 展示タイム: 6.XX形式
    const exMatch = tbody.match(/>(\d\.\d{2})</)
    if (exMatch) {
      const et = parseFloat(exMatch[1])
      if (et >= 6.0 && et <= 7.5) {
        const racer = racers.find(r => r.boat_number === boatNum)
        if (racer) racer.exhibition_time = et
      }
    }

    // チルト
    const tiltMatch = tbody.match(/>(-?\d\.\d)</)
    if (tiltMatch) {
      const racer = racers.find(r => r.boat_number === boatNum)
      if (racer) racer.tilt = parseFloat(tiltMatch[1])
    }
  }

  // スタート展示: table1_boatImage1Time
  const stRe = /is-type(\d)[^>]*>\d<\/span>[\s\S]*?table1_boatImage1Time[^>]*>([\s\S]*?)<\/span>/gi
  let sm
  while ((sm = stRe.exec(html)) !== null) {
    const boatNum = parseInt(sm[1])
    const timeText = sm[2].trim()
    let st = null

    if (timeText.startsWith('F')) {
      // フライング: F.01 → -0.01
      const fMatch = timeText.match(/F\.?(\d{2})/)
      if (fMatch) st = -parseFloat(`0.${fMatch[1]}`)
    } else {
      // 通常: .11 → 0.11
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
  while ((m = re.exec(clean)) !== null) {
    nums.push(parseFloat(m[1]))
  }
  return nums
}

function parseStartTime(html, rno) {
  // 締切予定時刻テーブルから取得
  const timeSection = html.match(/締切予定時刻[\s\S]*?<\/tbody>/)
  if (timeSection) {
    const times = []
    const tdRe = /<td[^>]*>\s*(\d{1,2}:\d{2})\s*<\/td>/g
    let m
    while ((m = tdRe.exec(timeSection[0])) !== null) {
      times.push(m[1])
    }
    if (times[rno - 1]) return times[rno - 1]  // rno番目のレース時刻
    if (times.length > 0) return times[0]
  }
  return RACE_TIMES[rno - 1] || ''
}

async function detectActiveVenues(hd) {
  const url = `https://www.boatrace.jp/owpc/pc/race/index?hd=${hd}`
  const html = await fetchWithProxy(url)
  if (!html) return Object.entries(VENUES).map(([code, name]) => ({ code, name }))
  const active = []
  for (const [code, name] of Object.entries(VENUES)) {
    if (html.includes(`jcd=${code}`)) active.push({ code, name })
  }
  return active.length > 0 ? active : Object.entries(VENUES).map(([code, name]) => ({ code, name }))
}

async function fetchWithProxy(url) {
  for (const makeProxy of CORS_PROXIES) {
    try {
      const proxyUrl = makeProxy(url)
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const text = await res.text()
        if (text.length > 500) return text
      }
    } catch { continue }
  }
  return null
}

export function toAnalysisFormat(races) {
  return races.map(race => ({
    venue_code: race.venue_code,
    venue_name: race.venue_name,
    race_number: race.race_number,
    start_time: race.start_time,
    // v5: 気象データ
    wind_speed: race.wind_speed ?? null,
    wind_direction: race.wind_direction ?? null,
    wave_height: race.wave_height ?? null,
    weather: race.weather ?? null,
    racers: (race.racers || [])
      .sort((a, b) => a.boat_number - b.boat_number)
      .map(r => ({
        boat: r.boat_number,
        rank: r.rank,
        win_rate: r.win_rate,
        two_rate: r.two_rate,
        motor_rate: r.motor_rate,
        boat_rate: r.boat_rate,
        name: r.racer_name,
        avg_st: r.avg_st,
        local_win_rate: r.local_win_rate,
        local_two_rate: r.local_two_rate,
        exhibition_time: r.exhibition_time,
        start_exhibition: r.start_exhibition,
        tilt: r.tilt,
        // v5: 追加データ
        weight: r.weight ?? null,
        f_count: r.f_count ?? null,
      })),
  }))
}
