// デバッグ用：Vercelサーバーからboatrace.jpにアクセスできるか確認
export default async function handler(req, res) {
  const url = 'https://www.boatrace.jp/owpc/pc/race/racelist?rno=1&jcd=21&hd=20260327'
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    const text = await r.text()
    res.status(200).json({
      status: r.status,
      length: text.length,
      hasBoatColor: text.includes('is-boatColor1'),
      hasA1: text.includes('A1'),
      first200: text.substring(0, 200),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
