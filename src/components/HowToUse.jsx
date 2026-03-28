export default function HowToUse() {
  return (
    <section className="card howto">
      <h2>📖 使い方ガイド</h2>
      <p className="howto-intro">
        このアプリは、その日のボートレース全場のデータをAIが分析して、
        <strong>「当たりやすい4レース」</strong>を自動で選んでくれるツールです。
      </p>

      <div className="howto-item">
        <div className="howto-icon">🎯</div>
        <div>
          <div className="howto-title">パーセンテージ（例：18.5%）</div>
          <div className="howto-desc">
            この3艇が上位3着に入る確率です。<br />
            数字が高いほど、予想が当たりやすいレースです。
          </div>
        </div>
      </div>

      <div className="howto-item">
        <div className="howto-icon">📊</div>
        <div>
          <div className="howto-title">堅さスコア（例：堅い 55）</div>
          <div className="howto-desc">
            このレースがどれくらい予想しやすいかを0〜100点で表しています。<br />
            点数が高いほど荒れにくく、安定したレースです。
          </div>
        </div>
      </div>

      <div className="howto-labels">
        <div className="howto-label-row">
          <span className="kg-badge badge-s">超堅</span>
          <span>ほぼ実力通りの結果になりやすい</span>
        </div>
        <div className="howto-label-row">
          <span className="kg-badge badge-a">堅い</span>
          <span>比較的安定している</span>
        </div>
        <div className="howto-label-row">
          <span className="kg-badge badge-b">普通</span>
          <span>どちらともいえない</span>
        </div>
        <div className="howto-label-row">
          <span className="kg-badge badge-c">荒れ</span>
          <span>番狂わせが起きやすい</span>
        </div>
      </div>

      <div className="howto-item">
        <div className="howto-icon">🔵</div>
        <div>
          <div className="howto-title">3艇の丸マーク（例：①②③）</div>
          <div className="howto-desc">
            AIが上位3着に入ると予想した艇の番号です。<br />
            この3艇を<strong>三連複</strong>で買います。
          </div>
        </div>
      </div>

      <div className="howto-box-explain">
        <div className="howto-box-title">💡 三連複ってなに？</div>
        <div className="howto-desc">
          選んだ3艇が<strong>どんな順番でも3着以内に入れば当たり</strong>になる舟券です。<br />
          たった<strong>1点</strong>で買えます。
        </div>
        <div className="howto-box-example">
          <div className="howto-box-label">例：①＝②＝③ を買うと…</div>
          <div className="howto-box-note">
            ①②③が1着・2着・3着に入れば、<strong>どの順番でも的中</strong>！
          </div>
        </div>
      </div>

      <div className="howto-box-explain" style={{ marginTop: 16, background: '#fff8e1', borderColor: '#ffc107' }}>
        <div className="howto-box-title">⚡ なぜ三連単BOXより三連複？</div>
        <div className="howto-desc">
          転がし（4レース連続で当てて賞金を増やす）なら、<strong>三連複1点の方が圧倒的にお得</strong>です。
        </div>
        <table className="howto-compare-table">
          <thead>
            <tr>
              <th></th>
              <th>三連単BOX</th>
              <th>三連複 1点</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="howto-compare-label">買い目</td>
              <td>6点</td>
              <td className="howto-compare-good">1点</td>
            </tr>
            <tr>
              <td className="howto-compare-label">的中条件</td>
              <td>3艇が3着内</td>
              <td>3艇が3着内</td>
            </tr>
            <tr>
              <td className="howto-compare-label">的中率</td>
              <td>同じ</td>
              <td>同じ</td>
            </tr>
            <tr>
              <td className="howto-compare-label">1万円→4転がし</td>
              <td>約15万円</td>
              <td className="howto-compare-good">約150万円</td>
            </tr>
          </tbody>
        </table>
        <div className="howto-desc" style={{ marginTop: 8, fontSize: '0.82rem' }}>
          <strong>理由：</strong>三連単BOXは6点に資金を分散するため、
          当たっても配当は1/6しか受け取れません。<br />
          三連複なら全額を1点に集中できるので、
          転がすほど差が広がります。
        </div>
      </div>

      <div className="howto-box-explain" style={{ marginTop: 16 }}>
        <div className="howto-box-title">🔄 転がしのやり方</div>
        <div className="howto-desc">
          <strong>① 最初のレース</strong>に好きな金額を賭ける（例：1万円）<br />
          <strong>② 当たったら</strong>配当金を<strong>全額</strong>次のレースに賭ける<br />
          <strong>③ これを4回繰り返す</strong><br /><br />
          上のプランに表示された4レースを、時刻順にそのまま賭けるだけ！
        </div>
      </div>
    </section>
  )
}
