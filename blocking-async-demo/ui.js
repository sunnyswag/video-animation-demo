// ===== 场景注册 =====
const SCENES = {
  'overview':         { title: '总览：一张图讲清', view: 'quad',       make: overviewSteps },
  'sync-blocking':    { title: '同步阻塞',        view: 'restaurant', make: syncBlocking },
  'sync-nonblocking': { title: '同步非阻塞（轮询）', view: 'restaurant', make: syncNonBlocking },
  'async-blocking':   { title: '异步阻塞',        view: 'restaurant', make: asyncBlocking },
  'async-nonblocking':{ title: '异步非阻塞',      view: 'restaurant', make: asyncNonBlocking },
  'summary':          { title: '数据总结：四场景时间账', view: 'sum',   make: sumSteps },
  'c-epoll':          { title: 'C · epoll 异步阻塞', view: 'c',        make: cSteps },
};

const COMMON_SRC = `const TABLES = ['A', 'B', 'C'];\nconst COOK_TICKS = { A: 7, B: 2, C: 4 };\n\n` + createKitchen.toString().replace('function createKitchen', '// 厨房 = 操作系统/硬件\nfunction createKitchen');

// ===== DOM =====
const $ = s => document.querySelector(s);
const waiterEl = $('#waiter'), waiterFace = $('#waiterFace'), ordersEl = $('#orders'), consoleEl = $('#console');
const POS = { // 送餐员位置（舞台百分比）
  window: { left: '50%', top: '40%' }, seat: { left: '65.5%', top: '40%' },
  A: { left: '16.5%', top: '54%' }, B: { left: '50%', top: '54%' }, C: { left: '83.5%', top: '54%' },
  hall1: { left: '30%', top: '47%' }, hall2: { left: '70%', top: '47%' },
};
const MOOD_FACE = { work: '🏃', blocked: '😴', sit: '😴', carry: '🍜', idle: '🧍' };

const params = new URLSearchParams(location.search);
const sceneName = SCENES[params.get('scene')] ? params.get('scene') : 'overview';
const scene = SCENES[sceneName];

let kitchen, state, gen;

function start() {
  kitchen = createKitchen();
  state = { served: [], stats: { total: 0, work: 0, chore: 0, wait: 0 }, ended: false };
  gen = scene.make(kitchen, state);
  consoleEl.innerHTML = '';
  log(`【${scene.title}】按空格开始 ▶`);
  moveWaiter('hall1');
  setMood('idle');
  render();
  renderStats();
}

function log(text) {
  const div = document.createElement('div');
  div.textContent = text;
  consoleEl.appendChild(div);
  requestAnimationFrame(() => { consoleEl.scrollTop = consoleEl.scrollHeight; });
}

function moveWaiter(at) {
  const p = POS[at] || POS.hall1;
  waiterEl.style.left = p.left;
  waiterEl.style.top = p.top;
}

function setMood(m) {
  waiterFace.textContent = MOOD_FACE[m] || '🧍';
  waiterEl.classList.toggle('walk', m === 'work' || m === 'carry');
  waiterEl.classList.toggle('blocked', m === 'blocked' || m === 'sit');
  waiterEl.classList.toggle('seated', m === 'sit');
}

function render() {
  // 厨房订单（带蒸汽/出锅动画）
  ordersEl.innerHTML = '';
  for (const o of kitchen.orders) {
    const total = COOK_TICKS[o.table], pct = Math.max(0, Math.min(100, (total - o.left) / total * 100));
    const div = document.createElement('div');
    div.className = 'order' + (o.left <= 0 ? ' ready' : '');
    div.innerHTML = o.left <= 0
      ? `🛎️ ${o.table} 出锅！<div class="bar"><i style="width:100%"></i></div>`
      : `<div class="steam"><i></i><i></i><i></i></div>🍳 ${o.table} 制作中 剩 ${o.left} 拍<div class="bar"><i style="width:${pct}%"></i></div>`;
    ordersEl.appendChild(div);
  }
  // 桌台状态（顾客表情 / 上菜 / 铃响）
  document.querySelectorAll('.table').forEach(el => {
    const t = el.dataset.t;
    const st = el.querySelector('.status'), cu = el.querySelector('.customer'), di = el.querySelector('.dish');
    const o = kitchen.orders.find(o => o.table === t);
    const served = state.served.includes(t);
    el.classList.toggle('served', served);
    st.classList.remove('ring');
    if (served) {
      st.textContent = '✅ 上菜了'; cu.textContent = '😋';
      if (di.textContent !== '🍜') { di.textContent = '🍜'; di.classList.remove('pop'); void di.offsetWidth; di.classList.add('pop'); }
    } else if (o && o.left <= 0) {
      st.textContent = '🛎️ 菜好了，铃在响！'; st.classList.add('ring');
    } else if (o) {
      st.textContent = '已下单，等菜中'; cu.textContent = '😫';
    } else {
      st.textContent = '—';
      cu.textContent = { A: '🧑‍💼', B: '🧑‍🎓', C: '🧑‍🎨' }[t];   // 重置时恢复顾客初始表情
      di.textContent = '';                                    // 并清掉上一轮的面碗
    }
  });
}

function step() {
  kitchen.tick();                       // 每按一次，厨房推进一个节拍
  const r = gen.next();
  if (r.done) {
    if (!state.ended) { state.ended = true; log('—— 本场景结束，按 R 重来 ——'); }
    return;
  }
  const v = r.value;
  if (v.cost && v.cost !== 'free') { state.stats.total++; state.stats[v.cost]++; }
  if (v.text) log(v.text);
  if (v.cost === 'free' && state.stats.total) {   // 🏁 拍直接输出时间账总结
    const s = state.stats;
    log(`📊 线程时间账：共 ${s.total} tick —— 🔨 干活 ${s.work} · 🧹 杂活 ${s.chore} · 😴 阻塞等待 ${s.wait}`);
  }
  if (v.at) moveWaiter(v.at);
  if (v.mood) setMood(v.mood);
  if ((scene.view === 'quad' || scene.view === 'sum') && 'quad' in v) {
    document.querySelectorAll('.quad-cell, .sum-cell').forEach(c => c.classList.toggle('on', v.quad === 'all' || c.dataset.quad === v.quad));
  }
  if (scene.view === 'c' && v.lines) {
    document.querySelectorAll('#cview .ln').forEach(el => {
      el.classList.toggle('on', v.lines.includes(+el.dataset.no));
    });
  }
  render();
  renderStats();
}

// 线程时间账：数字 + 占比条
function renderStats() {
  const s = state.stats;
  $('#stTotal').textContent = s.total;
  $('#stWork').textContent = s.work;
  $('#stChore').textContent = s.chore;
  $('#stWait').textContent = s.wait;
  const pct = n => s.total ? (n / s.total * 100) + '%' : '0%';
  $('#sbWork').style.width = pct(s.work);
  $('#sbChore').style.width = pct(s.chore);
  $('#sbWait').style.width = pct(s.wait);
}

// ===== 视图初始化 =====
document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.scene === sceneName));
const showRest = scene.view === 'restaurant' || scene.view === 'quad';  // 总览页也要餐厅（右半栏演示）
$('#stage').classList.toggle('ov', scene.view === 'quad');
$('#restaurant').style.display = showRest ? '' : 'none';
$('#stats').style.display     = scene.view === 'restaurant' ? 'flex' : 'none';
$('#quadview').style.display  = scene.view === 'quad' ? 'block' : 'none';
$('#sumview').style.display   = scene.view === 'sum' ? 'block' : 'none';
$('#cview').style.display     = scene.view === 'c' ? 'block' : 'none';

// 数据总结：真实跑一遍四个场景生成卡片（数字与场景逻辑永远一致）
function buildSummary() {
  const notes = {
    sb:  s => `😴 阻塞等待占 ${Math.round(s.wait / s.total * 100)}%——大部分时间线程是死的`,
    snb: s => `🧹 空转占 ${Math.round(s.chore / s.total * 100)}%——没睡，但全在无效跑腿`,
    ab:  s => `只睡 ${s.wait} tick——没活干，睡得心安理得`,
    anb: s => `阻塞等待 ${s.wait}——一滴都不浪费`,
  };
  for (const it of computeSummary()) {
    const s = it.stats, pct = n => (n / s.total * 100).toFixed(1) + '%';
    const card = document.createElement('div');
    card.className = 'sum-cell'; card.dataset.quad = it.quad;
    card.innerHTML = `
      <h3>${it.title}</h3>
      <div class="sum-order">上菜顺序 ${it.order}</div>
      <div class="sum-tick">⏱ <b>${s.total}</b> tick</div>
      <div class="sum-rows">
        <span class="w">🔨 干活 <b>${s.work}</b></span>
        <span class="c">🧹 杂活 <b>${s.chore}</b></span>
        <span class="t">😴 阻塞等待 <b>${s.wait}</b></span>
      </div>
      <div class="sum-stack">
        <i style="width:${pct(s.work)};background:var(--green)"></i><i style="width:${pct(s.chore)};background:var(--amber)"></i><i style="width:${pct(s.wait)};background:var(--red)"></i>
      </div>
      <p class="sum-note">${notes[it.quad](s)}</p>`;
    $('#sumGrid').appendChild(card);
  }
}
if (scene.view === 'sum') buildSummary();

if (scene.view === 'c') {
  const esc = s => s.replace(/</g, '&lt;');
  const colorize = s => s.replace(/(\/\/.*)$/, '<span class="cm">$1</span>');
  $('#cpre').innerHTML = C_LINES.map((ln, i) =>
    `<span class="ln" data-no="${i + 1}"><span class="no">${i + 1}</span>${colorize(esc(ln))}</span>`).join('');
}

// 学习模式：显示代码（演示模式默认隐藏，录屏用演示模式）
let codeOn = false;
function toggleCode() {
  codeOn = !codeOn;
  $('#side').classList.toggle('showcode', codeOn);
  $('#codebox').style.display = codeOn ? 'block' : 'none';
  $('#togglecode').textContent = codeOn ? '隐藏代码 C' : '显示代码 C';
  if (codeOn) {
    const src = scene.make === cSteps ? C_LINES.join('\n')
      : COMMON_SRC + '\n\n' + scene.make.toString();
    $('#code').textContent = src;
  }
}

$('#next').onclick = step;
$('#reset').onclick = start;
$('#togglecode').onclick = toggleCode;
$('#freeze').onclick = () => {
  log('主线程忙等 2 秒——注意：整个页面（灯笼、蒸汽、按钮）全部冻住，这就是阻塞');
  const end = Date.now() + 2000;
  while (Date.now() < end) {}           // 故意的忙等：冻结本身就是证据
  log('← 解冻了。刚才那 2 秒里送餐员（线程）就是这种状态');
};

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); step(); }
  else if (e.key === 'r' || e.key === 'R') start();
  else if (e.key === 'c' || e.key === 'C') toggleCode();
});

start();

// 调试用：?steps=N 加载后自动推进 N 拍；?code=1 直接开启学习模式（用于无头截图/自检）
const autoSteps = parseInt(params.get('steps') || '0', 10);
for (let i = 0; i < autoSteps; i++) step();
if (params.get('code') === '1') toggleCode();
