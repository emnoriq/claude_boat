// =============================================
// ボートレース 4回転がし エンジン v4
// 自動データ取得対応
// =============================================

// --- 24場データ ---
const VENUES = {
  '桐生':{inRate:54,jcd:'01'},'戸田':{inRate:43,jcd:'02'},'江戸川':{inRate:44,jcd:'03'},
  '平和島':{inRate:46,jcd:'04'},'多摩川':{inRate:54,jcd:'05'},'浜名湖':{inRate:52,jcd:'06'},
  '蒲郡':{inRate:55,jcd:'07'},'常滑':{inRate:56,jcd:'08'},'津':{inRate:55,jcd:'09'},
  '三国':{inRate:52,jcd:'10'},'琵琶湖':{inRate:51,jcd:'11'},'住之江':{inRate:56,jcd:'12'},
  '尼崎':{inRate:55,jcd:'13'},'鳴門':{inRate:55,jcd:'14'},'丸亀':{inRate:56,jcd:'15'},
  '児島':{inRate:53,jcd:'16'},'宮島':{inRate:55,jcd:'17'},'徳山':{inRate:60,jcd:'18'},
  '下関':{inRate:58,jcd:'19'},'若松':{inRate:56,jcd:'20'},'芦屋':{inRate:60,jcd:'21'},
  '福岡':{inRate:52,jcd:'22'},'唐津':{inRate:55,jcd:'23'},'大村':{inRate:65,jcd:'24'},
};

const CR_FIRST = {
  1:{A1:70,A2:60,B1:48,B2:35},2:{A1:22,A2:16,B1:10,B2:5},
  3:{A1:18,A2:14,B1:9,B2:4},4:{A1:18,A2:13,B1:8,B2:4},
  5:{A1:10,A2:7,B1:4,B2:2},6:{A1:6,A2:4,B1:2,B2:1},
};
const RANK_SC = {A1:10,A2:7,B1:4,B2:1};
const WIND_FX = {none:{i:0,o:0},head:{i:-5,o:3},tail:{i:5,o:-3}};
const RACE_TIMES = ['10:30','11:00','11:32','12:05','12:38','13:12','13:48','14:25','15:03','15:42','16:22','16:57'];

// CORSプロキシ（複数フォールバック）
const CORS_PROXIES = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

let allRaces = [];
let korogashiPlan = [];
let korogashiState = {step:0, results:[], alive:true};

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  // 場セレクト
  const sel = document.getElementById('venue');
  Object.keys(VENUES).forEach(n => {
    const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o);
  });
  // 大村をデフォルトに（イン勝率最高）
  sel.value = '大村';

  // 日付デフォルト = 明日
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('raceDate').value = tomorrow.toISOString().split('T')[0];

  document.getElementById('fetchBtn').addEventListener('click', fetchAndAnalyze);
  document.getElementById('generateGrid').addEventListener('click', generateGrid);
  document.getElementById('manualAnalyzeBtn').addEventListener('click', manualAnalyze);
});

// =============================================
// データ自動取得
// =============================================
async function fetchAndAnalyze() {
  const venueName = document.getElementById('venue').value;
  const dateStr = document.getElementById('raceDate').value;
  if (!venueName || !dateStr) { showStatus('レース場と日付を選択してください','error'); return; }

  const venueData = VENUES[venueName];
  const hd = dateStr.replace(/-/g, '');

  showLoading(true, 'データ取得中...');
  hideStatus();

  try {
    const races = await fetchAllRaces(venueData.jcd, hd);
    if (races.length === 0) throw new Error('レースデータが見つかりません');

    allRaces = races;
    showLoading(false);
    showStatus(`${venueName} ${dateStr} の ${races.length}レース分のデータを取得しました`, 'success');

    // 分析実行
    runAnalysis(venueName, 'none', 0);

  } catch (err) {
    showLoading(false);
    showStatus(`データ取得に失敗しました: ${err.message}。下の手動入力をお使いください。`, 'error');
    document.getElementById('manualSection').classList.remove('hidden');
  }
}

async function fetchAllRaces(jcd, hd) {
  const races = [];

  // まず1Rを取得してレース数を確認
  const firstHtml = await fetchWithProxy(
    `https://www.boatrace.jp/owpc/pc/race/racelist?rno=1&jcd=${jcd}&hd=${hd}`
  );
  if (!firstHtml) throw new Error('サーバーに接続できません');

  // レース数を検出（ページ内のレース番号リンクから）
  const raceCountMatch = firstHtml.match(/rno=(\d+)/g);
  let maxRace = 12;
  if (raceCountMatch) {
    const nums = raceCountMatch.map(m => parseInt(m.replace('rno=', '')));
    maxRace = Math.max(...nums);
  }

  showLoading(true, `1/${maxRace} レース解析中...`);
  const race1 = parseRaceHtml(firstHtml, 1);
  if (race1) races.push(race1);

  // 残りのレースを取得
  for (let rno = 2; rno <= maxRace; rno++) {
    showLoading(true, `${rno}/${maxRace} レース解析中...`);
    try {
      const html = await fetchWithProxy(
        `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${rno}&jcd=${jcd}&hd=${hd}`
      );
      if (html) {
        const race = parseRaceHtml(html, rno);
        if (race) races.push(race);
      }
    } catch (e) {
      // 個別レースの取得失敗はスキップ
    }
  }

  return races;
}

async function fetchWithProxy(url) {
  for (const makeProxy of CORS_PROXIES) {
    try {
      const proxyUrl = makeProxy(url);
      const res = await fetch(proxyUrl, {signal: AbortSignal.timeout(10000)});
      if (res.ok) {
        const text = await res.text();
        if (text.length > 500) return text; // 有効なHTMLを確認
      }
    } catch (e) {
      continue; // 次のプロキシを試す
    }
  }
  return null;
}

// =============================================
// HTML解析
// =============================================
function parseRaceHtml(html, raceNum) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 発走時刻を取得
  let raceTime = RACE_TIMES[raceNum - 1] || '';
  const timeEl = doc.querySelector('.heading2_titleDetail, .is-h4__title');
  if (timeEl) {
    const tm = timeEl.textContent.match(/(\d{1,2}:\d{2})/);
    if (tm) raceTime = tm[1];
  }

  // tbody内の各行から選手データを抽出
  const racers = [];
  const rows = doc.querySelectorAll('.is-fs12, table.is-w748 tbody tr, .tBorder tbody tr');

  if (rows.length === 0) {
    // 別のセレクタを試す
    return parseRaceHtmlFallback(html, raceNum, raceTime);
  }

  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const row = rows[i];
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) continue;

    const text = row.textContent;

    // 級別を探す
    let rank = 'B1';
    if (text.includes('A1')) rank = 'A1';
    else if (text.includes('A2')) rank = 'A2';
    else if (text.includes('B2')) rank = 'B2';

    // 数値を全て抽出
    const nums = text.match(/\d+\.\d+/g) || [];
    let nationalRate = 5.0;
    let motor = 30.0;

    // 勝率は通常1〜10の範囲
    for (const n of nums) {
      const v = parseFloat(n);
      if (v >= 1.0 && v <= 9.99 && nationalRate === 5.0) {
        nationalRate = v;
      } else if (v >= 10.0 && v <= 80.0 && motor === 30.0) {
        motor = v;
      }
    }

    racers.push({
      boat: racers.length + 1,
      rank, nationalRate, motor
    });
  }

  if (racers.length < 6) return parseRaceHtmlFallback(html, raceNum, raceTime);

  return { num: raceNum, time: raceTime, racers: racers.slice(0, 6) };
}

function parseRaceHtmlFallback(html, raceNum, raceTime) {
  // テキストベースのフォールバック解析
  const racers = [];

  // 級別パターンを探す
  const rankPattern = /[AB][12]/g;
  const ranks = [];
  let m;
  while ((m = rankPattern.exec(html)) !== null) {
    const r = m[0];
    if (['A1','A2','B1','B2'].includes(r)) {
      ranks.push(r);
    }
  }

  // 勝率パターン（X.XX形式で1-10の範囲）
  const ratePattern = /(\d\.\d{2})/g;
  const rates = [];
  while ((m = ratePattern.exec(html)) !== null) {
    const v = parseFloat(m[1]);
    if (v >= 1.0 && v <= 9.99) rates.push(v);
  }

  // モーター2連率（XX.X%形式で10-80の範囲）
  const motorPattern = /(\d{2}\.\d)/g;
  const motors = [];
  while ((m = motorPattern.exec(html)) !== null) {
    const v = parseFloat(m[1]);
    if (v >= 10.0 && v <= 80.0) motors.push(v);
  }

  // 6艇分のデータを組み立て
  for (let i = 0; i < 6; i++) {
    racers.push({
      boat: i + 1,
      rank: ranks[i] || 'B1',
      nationalRate: rates[i] || 5.0,
      motor: motors[i] || 30.0,
    });
  }

  return { num: raceNum, time: raceTime, racers };
}

// =============================================
// 分析エンジン
// =============================================
function runAnalysis(venueName, windDir, windSpd) {
  const venue = VENUES[venueName];
  const results = allRaces.map(race => scoreRace(race, venue, windDir, windSpd));
  results.sort((a, b) => b.firmness - a.firmness);

  const top4 = results.slice(0, 4);
  top4.sort((a, b) => a.raceNum - b.raceNum);
  korogashiPlan = top4;
  korogashiState = {step:0, results:[], alive:true};

  displayPlan(top4);
  displayRanking(results);

  document.getElementById('step2').classList.remove('hidden');
  document.getElementById('step3').classList.remove('hidden');
  document.getElementById('allRanking').classList.remove('hidden');
  document.getElementById('step2').scrollIntoView({behavior:'smooth'});
}

function scoreRace(race, venue, windDir, windSpd) {
  const venueInAdj = venue ? (venue.inRate - 55) / 10 : 0;
  const wfx = WIND_FX[windDir] || WIND_FX.none;
  const wm = Math.min((windSpd||0) / 5, 1);

  const scores = race.racers.map((r, i) => {
    const c = i + 1;
    const inner = c <= 3;
    const crF = CR_FIRST[c][r.rank] || 10;
    const courseScore = crF / 7;
    const venueAdj = inner ? venueInAdj : -venueInAdj * 0.3;
    const windAdj = (inner ? wfx.i : wfx.o) * wm / 10;
    const rateScore = r.nationalRate;
    const motorScore = r.motor / 10;
    const rankBonus = RANK_SC[r.rank] || 4;
    const total = courseScore*3 + rateScore*2.5 + motorScore*2 + rankBonus*1.5 + venueAdj + windAdj;
    return {boat:c, rank:r.rank, score:total, name:`${c}号艇`};
  });

  const sorted = [...scores].sort((a,b) => b.score - a.score);
  const top3 = sorted.slice(0,3);
  const boxBoats = top3.map(s => s.boat).sort((a,b) => a-b);
  const boxCombos = genBoxCombos(boxBoats);
  const probs = calcProbs(scores);
  let boxProb = 0;
  const details = boxCombos.map(([a,b,c]) => {
    const p = probs[`${a}-${b}-${c}`]||0; boxProb+=p;
    return {combo:[a,b,c], prob:p};
  });
  details.sort((a,b) => b.prob - a.prob);

  return {
    raceNum: race.num, time: race.time,
    scores: sorted, boxBoats, boxCombos: details, boxProb,
    firmness: calcFirmness(sorted),
    racers: race.racers,
  };
}

function genBoxCombos(boats) {
  const c=[];
  for(let i=0;i<boats.length;i++)for(let j=0;j<boats.length;j++){
    if(j===i)continue;for(let k=0;k<boats.length;k++){
      if(k===i||k===j)continue;c.push([boats[i],boats[j],boats[k]]);
    }}
  return c;
}

function calcProbs(scores) {
  const t=6.0;const ex=scores.map(s=>Math.exp(s.score/t));
  const se=ex.reduce((a,b)=>a+b,0);const p=ex.map(e=>e/se);
  const out={};
  for(let i=0;i<6;i++)for(let j=0;j<6;j++){if(j===i)continue;
    for(let k=0;k<6;k++){if(k===i||k===j)continue;
      const p1=p[i];const r1=p.filter((_,x)=>x!==i);const s1=r1.reduce((a,b)=>a+b,0);
      const p2=p[j]/s1;const r2=p.filter((_,x)=>x!==i&&x!==j);const s2=r2.reduce((a,b)=>a+b,0);
      const p3=p[k]/s2;out[`${scores[i].boat}-${scores[j].boat}-${scores[k].boat}`]=p1*p2*p3;
    }}
  return out;
}

function calcFirmness(sorted) {
  const t3a=(sorted[0].score+sorted[1].score+sorted[2].score)/3;
  const b3a=(sorted[3].score+sorted[4].score+sorted[5].score)/3;
  const gap=(t3a-b3a)/t3a*40;
  const lead=(sorted[0].score-sorted[1].score)/sorted[0].score*20;
  const t3r=sorted[0].score-sorted[2].score;
  const tight=Math.max(0,20-t3r*5);
  const a1=sorted.slice(0,3).some(s=>s.rank==='A1')?10:0;
  const in1=sorted.slice(0,3).some(s=>s.boat===1)?10:0;
  return Math.min(100,Math.max(0,gap+lead+tight+a1+in1));
}

// =============================================
// 手動入力モード（フォールバック）
// =============================================
function generateGrid() {
  const total = parseInt(document.getElementById('totalRaces').value);
  const container = document.getElementById('gridContainer');
  container.innerHTML = '';
  allRaces = [];

  for (let r = 1; r <= total; r++) {
    const time = RACE_TIMES[r-1]||'';
    allRaces.push({
      num:r, time,
      racers: Array.from({length:6},(_,i)=>({boat:i+1,rank:'B1',nationalRate:5.0,motor:30.0}))
    });
    let rows='';
    for(let b=0;b<6;b++){
      rows+=`<tr>
        <td><span class="bn b${b+1}">${b+1}</span></td>
        <td><select data-r="${r-1}" data-b="${b}" data-f="rank" class="rg-input">
          <option value="A1">A1</option><option value="A2">A2</option>
          <option value="B1" selected>B1</option><option value="B2">B2</option>
        </select></td>
        <td><input type="number" data-r="${r-1}" data-b="${b}" data-f="nationalRate" value="5.0" min="0" max="10" step="0.01" class="rg-input"></td>
        <td><input type="number" data-r="${r-1}" data-b="${b}" data-f="motor" value="30" min="0" max="100" step="0.1" class="rg-input"></td>
      </tr>`;
    }
    const item=document.createElement('div');item.className='race-grid-item';
    item.innerHTML=`
      <div class="race-grid-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <span>${r}R</span><span class="race-time">${time}</span>
      </div>
      <div class="race-grid-body${r>1?' collapsed':''}">
        <table class="rg-table">
          <thead><tr><th>艇</th><th>級別</th><th>勝率</th><th>ﾓｰﾀｰ(%)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    container.appendChild(item);
  }

  container.querySelectorAll('.rg-input').forEach(el => {
    el.addEventListener('change', () => {
      const ri=parseInt(el.dataset.r),bi=parseInt(el.dataset.b),f=el.dataset.f;
      allRaces[ri].racers[bi][f] = f==='rank'?el.value:parseFloat(el.value);
    });
  });

  document.getElementById('manualAnalyzeArea').classList.remove('hidden');
}

function manualAnalyze() {
  if (allRaces.length === 0) return;
  const venueName = document.getElementById('venue').value;
  const windDir = document.getElementById('windDir').value;
  const windSpd = parseInt(document.getElementById('windSpd').value)||0;
  runAnalysis(venueName, windDir, windSpd);
}

// =============================================
// 表示
// =============================================
function displayPlan(plan) {
  const container = document.getElementById('korogashiPlan');
  container.innerHTML = '';

  plan.forEach((r, idx) => {
    const badge = firmBadge(r.firmness);
    const fillColor = r.firmness>=60?'var(--success)':r.firmness>=40?'var(--warning)':'var(--danger)';

    let scoreRows = '';
    r.scores.forEach(s => {
      const pct = (s.score / r.scores[0].score * 100).toFixed(0);
      scoreRows += `<div class="sc-row">
        <span class="sc-name"><span class="bn bn-sm b${s.boat}">${s.boat}</span></span>
        <div class="sc-bar-bg"><div class="sc-bar" style="width:${pct}%;background:var(--boat-${s.boat})"></div></div>
        <span class="sc-val">${s.score.toFixed(1)}</span>
      </div>`;
    });

    let combosHtml = '';
    r.boxCombos.forEach(c => {
      combosHtml += `<div class="box-combo">
        <span class="bn bn-sm b${c.combo[0]}">${c.combo[0]}</span>→
        <span class="bn bn-sm b${c.combo[1]}">${c.combo[1]}</span>→
        <span class="bn bn-sm b${c.combo[2]}">${c.combo[2]}</span>
        <span style="font-size:0.7rem;color:var(--text2);margin-left:1px">${(c.prob*100).toFixed(1)}%</span>
      </div>`;
    });

    // 選手情報表示
    let racerInfo = '';
    if (r.racers) {
      racerInfo = '<div style="font-size:0.78rem;color:var(--text2);margin-top:4px;">';
      r.racers.forEach((rc, i) => {
        racerInfo += `<span class="bn bn-sm b${i+1}" style="margin-right:2px">${i+1}</span>${rc.rank} ${rc.nationalRate.toFixed(2)} `;
      });
      racerInfo += '</div>';
    }

    const step = document.createElement('div');
    step.className = 'kg-step';
    step.innerHTML = `
      <div class="kg-step-num">
        <div class="kg-step-circle">${idx+1}</div>
        <div class="kg-step-line"></div>
      </div>
      <div class="kg-card${idx===0?' top':''}">
        <div class="kg-race-header">
          <span class="kg-race-name">${r.raceNum}R</span>
          <span class="kg-race-time">${r.time}</span>
        </div>
        <span class="kg-badge ${badge.cls}">${badge.text} (${r.firmness.toFixed(0)})</span>
        <div class="firmness-bar"><div class="firmness-fill" style="width:${r.firmness}%;background:${fillColor}"></div></div>
        ${racerInfo}
        ${scoreRows}
        <div class="box-area">
          <div class="box-label">三連単ボックス 6点</div>
          <div class="box-boats">
            <span class="bn b${r.boxBoats[0]}">${r.boxBoats[0]}</span>
            <span class="bn b${r.boxBoats[1]}">${r.boxBoats[1]}</span>
            <span class="bn b${r.boxBoats[2]}">${r.boxBoats[2]}</span>
          </div>
          <div class="box-combos">${combosHtml}</div>
          <div class="box-prob">合計的中確率: <strong>${(r.boxProb*100).toFixed(1)}%</strong></div>
        </div>
      </div>`;
    container.appendChild(step);
  });

  // サマリー
  const totalProb = plan.reduce((p,r) => p * r.boxProb, 1);
  const avgFirm = plan.reduce((s,r) => s + r.firmness, 0) / plan.length;
  document.getElementById('korogashiSummary').innerHTML = `
    <div class="summary-title">4回転がし成功確率</div>
    <div class="summary-nums">
      <div class="summary-item"><div class="label">4連続的中確率</div><div class="val">${(totalProb*100).toFixed(2)}%</div></div>
      <div class="summary-item"><div class="label">平均堅さ</div><div class="val">${avgFirm.toFixed(0)}</div></div>
      <div class="summary-item"><div class="label">必要資金(各100円)</div><div class="val">¥2,400</div></div>
    </div>`;

  displayResultArea(plan);
}

function firmBadge(f) {
  if(f>=65)return{text:'超堅',cls:'badge-s'};
  if(f>=50)return{text:'堅い',cls:'badge-a'};
  if(f>=35)return{text:'普通',cls:'badge-b'};
  return{text:'荒れ',cls:'badge-c'};
}

function displayResultArea(plan) {
  const area = document.getElementById('resultArea');
  area.innerHTML = '';
  plan.forEach((r,idx) => {
    const isActive = idx===0;
    const div = document.createElement('div');
    div.className = `result-step ${isActive?'active':'waiting'}`;
    div.id = `rs-${idx}`;
    div.innerHTML = `
      <span class="rs-num">${idx+1}</span>
      <div class="rs-info">
        <div class="rs-race">${r.raceNum}R (${r.time})</div>
        <div class="rs-box">${r.boxBoats.join('-')} BOX</div>
      </div>
      <div class="rs-input">
        <input type="text" id="resIn-${idx}" placeholder="例:1-3-2" maxlength="5" ${isActive?'':'disabled'}>
      </div>
      <button class="btn btn-primary" style="padding:6px 14px;font-size:0.82rem;" id="resBtn-${idx}" ${isActive?'':'disabled'} onclick="submitResult(${idx})">判定</button>
      <span class="rs-status" id="resSt-${idx}"></span>`;
    area.appendChild(div);
  });
}

window.submitResult = function(idx) {
  if(!korogashiState.alive||idx!==korogashiState.step) return;
  const input = document.getElementById(`resIn-${idx}`);
  const result = input.value.trim();
  if(!result.match(/^\d-\d-\d$/)){alert('結果を「1-3-2」の形式で入力してください');return;}

  const r = korogashiPlan[idx];
  const combos = r.boxCombos.map(c => c.combo.join('-'));
  const isHit = combos.includes(result);
  korogashiState.results.push({raceNum:r.raceNum, result, hit:isHit});

  const step=document.getElementById(`rs-${idx}`);
  const status=document.getElementById(`resSt-${idx}`);
  document.getElementById(`resIn-${idx}`).disabled=true;
  document.getElementById(`resBtn-${idx}`).disabled=true;

  if(isHit){
    step.className='result-step hit';
    status.innerHTML='<span style="color:var(--success)">的中!</span>';
    korogashiState.step++;
    if(korogashiState.step<4){
      const next=document.getElementById(`rs-${korogashiState.step}`);
      next.className='result-step active';
      document.getElementById(`resIn-${korogashiState.step}`).disabled=false;
      document.getElementById(`resBtn-${korogashiState.step}`).disabled=false;
    } else { showFinalResult(true); }
  } else {
    step.className='result-step miss';
    status.innerHTML='<span style="color:var(--danger)">不的中</span>';
    korogashiState.alive=false;
    showFinalResult(false);
  }
};

function showFinalResult(success) {
  const div=document.getElementById('korogashiResult');div.classList.remove('hidden');
  const h=korogashiState.results.filter(r=>r.hit).length;
  div.innerHTML = success
    ? `<div class="final-result success"><h3>4回転がし成功!!</h3><p>${h}戦${h}勝 - 全的中達成</p></div>`
    : `<div class="final-result failed"><h3>転がし終了</h3><p>${h} / ${korogashiState.results.length} 的中 (${korogashiState.results.length}戦目で不的中)</p></div>`;
}

function displayRanking(results) {
  const list=document.getElementById('rankingList');list.innerHTML='';
  results.forEach((r,idx) => {
    const badge=firmBadge(r.firmness);
    const row=document.createElement('div');row.className='rank-row';
    row.innerHTML=`
      <span class="rank-num">${idx+1}</span>
      <span class="rank-name">${r.raceNum}R <span style="font-weight:400;color:var(--text2)">${r.time}</span></span>
      <span class="rank-boats">
        <span class="bn bn-sm b${r.boxBoats[0]}">${r.boxBoats[0]}</span>
        <span class="bn bn-sm b${r.boxBoats[1]}">${r.boxBoats[1]}</span>
        <span class="bn bn-sm b${r.boxBoats[2]}">${r.boxBoats[2]}</span>
      </span>
      <span class="rank-score">${(r.boxProb*100).toFixed(1)}%</span>
      <span class="kg-badge ${badge.cls}">${badge.text} ${r.firmness.toFixed(0)}</span>`;
    list.appendChild(row);
  });
}

// =============================================
// UI ヘルパー
// =============================================
function showLoading(show, text) {
  document.getElementById('loading').classList.toggle('hidden', !show);
  if(text) document.getElementById('loadingText').textContent = text;
}

function showStatus(msg, type) {
  const el=document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = `status-msg ${type}`;
}

function hideStatus() {
  document.getElementById('statusMsg').classList.add('hidden');
}
