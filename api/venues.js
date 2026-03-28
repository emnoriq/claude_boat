// GET /api/venues?date=2026-03-27
// 当日の開催場一覧を返す（軽量・高速）

const VENUES = {
  '01':'桐生','02':'戸田','03':'江戸川','04':'平和島','05':'多摩川',
  '06':'浜名湖','07':'蒲郡','08':'常滑','09':'津','10':'三国',
  '11':'琵琶湖','12':'住之江','13':'尼崎','14':'鳴門','15':'丸亀',
  '16':'児島','17':'宮島','18':'徳山','19':'下関','20':'若松',
  '21':'芦屋','22':'福岡','23':'唐津','24':'大村',
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200')

  const date = req.query.date || todayStr()
  const hd = date.replace(/-/g, '')

  const html = await fetchPage(`https://www.boatrace.jp/owpc/pc/race/index?hd=${hd}`)
  const active = []

  if (html) {
    for (const [code, name] of Object.entries(VENUES)) {
      if (html.includes(`jcd=${code}`)) active.push({ code, name })
    }
  }

  const venues = active.length > 0 ? active : Object.entries(VENUES).map(([code, name]) => ({ code, name }))
  res.status(200).json({ date, venues })
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}
