// 公共设定（四场景共用，厨房 = 操作系统，完全一致）
const TABLES = ['A', 'B', 'C'];
const COOK_TICKS = { A: 7, B: 2, C: 4 }; // 耗时不同 → 出锅顺序 B→C→A ≠ 下单顺序
                                         // 下单各占一拍，A 先下单先开工，必须足够慢 C 才会先出锅

function createKitchen() {
  return {
    orders: [],            // { table, left }
    submit(t) { this.orders.push({ table: t, left: COOK_TICKS[t] }); },
    tick()    { this.orders.forEach(o => o.left--); },
    ready()   { return this.orders.filter(o => o.left <= 0); },
    take(t)   { this.orders = this.orders.filter(o => o.table !== t); },
  };
}

// 场景一 · 同步阻塞：死等当前这单，送完才接下一单
// mood: work=跑动 / blocked=站着睡(阻塞) / sit=坐椅子(阻塞) / carry=上菜 / idle=收工
// cost: work=干活(下单/上菜) / chore=杂活 / wait=阻塞等待 / free=不计入(收尾)
function* syncBlocking(kitchen, state) {
  for (const t of TABLES) {
    kitchen.submit(t);
    yield { text: `${t} 桌下单，送餐员把单子递进厨房，然后杵在窗口等`, at: 'window', mood: 'work', cost: 'work' };
    while (!kitchen.ready().some(o => o.table === t)) {
      yield { text: `（死等 ${t} 的菜……线程阻塞中，哪也不去）`, at: 'window', mood: 'blocked', cost: 'wait' };
    }
    kitchen.take(t); state.served.push(t);
    yield { text: `取餐，送到 ${t} 桌 ✅（严格 A→B→C = 同步；死等 = 阻塞）`, at: t, mood: 'carry', cost: 'work' };
  }
  yield { text: `🏁 全部送完：送餐员又回到窗口干等下一桌客人（任务做完 → 线程回到阻塞）`, at: 'window', mood: 'blocked', cost: 'free' };
}

// 场景二 · 同步非阻塞（轮询：不死等，但顺序仍死守 A→B→C）
function* syncNonBlocking(kitchen, state) {
  let chores = 0, spot = 0;
  for (const t of TABLES) {
    kitchen.submit(t);
    yield { text: `${t} 桌下单（心里只装着这一单）`, at: t, mood: 'work', cost: 'work' };
    while (!kitchen.ready().some(o => o.table === t)) {
      chores++; spot = 1 - spot;
      yield { text: `跑窗口问「${t} 好了没」→ 没好，回去干杂活 #${chores}（线程没睡 = 非阻塞；死守 A→B→C = 同步）`, at: spot ? 'window' : 'hall1', mood: 'work', cost: 'chore' };
    }
    kitchen.take(t); state.served.push(t);
    yield { text: `取餐送到 ${t} 桌 ✅（顺序仍 A→B→C）`, at: t, mood: 'carry', cost: 'work' };
  }
  yield { text: `🏁 全部送完：顺序保住了，但大量跑腿是空转（CPU 空转）`, at: 'hall2', mood: 'idle', cost: 'free' };
}

// 场景三 · 异步阻塞（全部下单后坐下等铃 = epoll_wait(-1)）
function* asyncBlocking(kitchen, state) {
  for (const t of TABLES) {
    kitchen.submit(t);
    yield { text: `${t} 桌下单，领一个餐铃 🛎️（= epoll_ctl 注册）`, at: t, mood: 'work', cost: 'work' };
  }
  yield { text: `三单都下完了，送餐员坐下 —— epoll_wait(-1)，线程睡死`, at: 'seat', mood: 'sit', cost: 'wait' };
  while (state.served.length < TABLES.length) {
    const served = kitchen.ready();
    if (!served.length) {
      yield { text: `（坐着等铃响……线程阻塞中。页面没卡死吧？线程睡着 ≠ 死了）`, at: 'seat', mood: 'sit', cost: 'wait' };
      continue;
    }
    for (const o of served) {
      kitchen.take(o.table); state.served.push(o.table);
      yield { text: `🔔 ${o.table} 的铃响了！取餐送到 ${o.table} 桌 ✅（出锅顺序 ≠ 下单顺序 = 异步）`, at: o.table, mood: 'carry', cost: 'work' };
    }
  }
  yield { text: `🏁 全部送完：等待时线程在睡（阻塞），上菜顺序看铃（异步）`, at: 'seat', mood: 'sit', cost: 'free' };
}

// 场景四 · 异步非阻塞（不等铃先干活，铃响再回来取餐）
function* asyncNonBlocking(kitchen, state) {
  for (const t of TABLES) {
    kitchen.submit(t);
    yield { text: `${t} 桌下单，领餐铃 🛎️`, at: t, mood: 'work', cost: 'work' };
  }
  // 与场景三的「坐下」叙事拍对齐：保证两个场景厨房时间轴一致，差别只在送餐员干什么
  yield { text: `三单都下完了，不等铃 —— 直接去大堂干活（事件循环继续转）`, at: 'hall1', mood: 'work', cost: 'chore' };
  let chores = 0, spot = 0;
  while (state.served.length < TABLES.length) {
    const served = kitchen.ready();
    if (served.length) {
      for (const o of served) {
        kitchen.take(o.table); state.served.push(o.table);
        yield { text: `🔔 ${o.table} 铃响 → 放下手头活，取餐送到 ${o.table} 桌 ✅（异步）`, at: o.table, mood: 'carry', cost: 'work' };
      }
    } else {
      chores++; spot = 1 - spot;
      yield { text: `没铃响 → 继续干杂活 #${chores}（倒水/招呼客人，线程不睡 = 非阻塞）`, at: spot ? 'hall1' : 'hall2', mood: 'work', cost: 'chore' };
    }
  }
  yield { text: `🏁 全部送完：等待的时间全变成了有用功`, at: 'hall1', mood: 'idle', cost: 'free' };
}

// 总览 · 2×2 坐标系 + 餐厅演示（左图右演，讲到哪格送餐员就演哪格）
function* overviewSteps(kitchen, state) {
  yield { quad: null, at: 'hall1', mood: 'idle', text: '先看右边餐厅：送餐员 = 线程（全店只有 1 个），厨房 = 操作系统，三桌订单 = 代码段' };
  kitchen.submit('A');
  yield { quad: null, at: 'A', mood: 'work', text: 'A 桌下单 —— 订单就是一段要执行的代码' };
  kitchen.submit('B');
  yield { quad: null, at: 'B', mood: 'work', text: 'B 桌下单' };
  kitchen.submit('C');
  yield { quad: null, at: 'C', mood: 'work', text: 'C 桌下单：下单顺序 A→B→C' };
  yield { quad: null, at: 'hall1', mood: 'idle', text: '厨房按自己节奏做菜：B 先出锅 🛎️（出锅顺序由菜品决定，≠ 下单顺序）' };
  yield { quad: null, at: 'hall1', mood: 'idle', text: '左边坐标系：横轴 = 线程状态（阻塞/非阻塞），纵轴 = 代码段顺序（同步/异步）——两个维度都长在送餐员身上' };
  yield { quad: 'sb',  at: 'window', mood: 'blocked', text: '同步阻塞：杵在窗口死等，严格 A→B→C' };
  yield { quad: 'snb', at: 'window', mood: 'work',    text: '同步非阻塞：反复跑窗口问（轮询），顺序死守，人没闲着' };
  yield { quad: 'ab',  at: 'seat',   mood: 'sit',     text: '异步阻塞：坐下等铃响（epoll_wait），没铃不动' };
  yield { quad: 'anb', at: 'hall2',  mood: 'work',    text: '异步非阻塞：边干活边等铃，铃响再来取餐' };
  yield { quad: null,  at: 'hall1',  mood: 'idle',    text: '关键：先钉死主语（线程）和范围（代码段）。接下来逐个场景看完整演示 →' };
}

// C 代码 · 逐行讲解节拍
const C_LINES = [
  '// 异步阻塞（epoll）：socket 全部设为非阻塞，线程睡在 epoll_wait',
  'int epfd = epoll_create1(0);',
  'for (int i = 0; i < nfds; i++) {',
  '    fcntl(fds[i], F_SETFL, O_NONBLOCK);           // read/write 本身永不阻塞',
  '    struct epoll_event ev = { .events = EPOLLIN, .data.fd = fds[i] };',
  '    epoll_ctl(epfd, EPOLL_CTL_ADD, fds[i], &ev);  // 下单 + 领餐铃',
  '}',
  'while (1) {',
  '    // 没活干，线程睡死在这里 ← 阻塞（= 送餐员坐下等铃响）',
  '    int n = epoll_wait(epfd, events, MAX_EVENTS, -1);',
  '    for (int i = 0; i < n; i++)',
  '        handle(events[i].data.fd);   // 哪个先来处理哪个 ← 异步（顺序不定）',
  '}',
];

function* cSteps() {
  yield { lines: [2],            text: '创建 epoll 实例（= 餐厅的叫号系统）' };
  yield { lines: [3,4,5,6,7],    text: '所有 socket 设 O_NONBLOCK 并注册：read/write 永不阻塞（下单 + 领餐铃）' };
  yield { lines: [10],           text: 'epoll_wait(-1)：没活干，线程睡死在这 ← 阻塞（送餐员坐下等铃）' };
  yield { lines: [11, 12],       text: '就绪几单处理几单，哪个先来处理哪个 ← 异步（顺序不定）' };
  yield { lines: [],             text: '一句话：等一个还没来的事件不可能零成本——要么自己睡，要么外包给别的线程/内核' };
}

// ===== 数据总结：真实跑一遍四个场景，汇总时间账（保证数字与场景永远一致）=====
function computeSummary() {
  const defs = [
    ['sb',  '同步阻塞',   syncBlocking],
    ['snb', '同步非阻塞', syncNonBlocking],
    ['ab',  '异步阻塞',   asyncBlocking],
    ['anb', '异步非阻塞', asyncNonBlocking],
  ];
  return defs.map(([quad, title, fn]) => {
    const kitchen = createKitchen();
    const state = { served: [], stats: { total: 0, work: 0, chore: 0, wait: 0 } };
    const gen = fn(kitchen, state);
    while (true) {
      kitchen.tick();
      const r = gen.next();
      if (r.done) break;
      const c = r.value.cost;
      if (c && c !== 'free') { state.stats.total++; state.stats[c]++; }
    }
    return { quad, title, stats: state.stats, order: state.served.join('→') };
  });
}

function* sumSteps() {
  const s = computeSummary();
  const [sb, snb, ab, anb] = s.map(x => x.stats);
  yield { quad: 'sb',  text: `同步阻塞：${sb.total} tick 里 ${sb.wait} tick 在睡——${Math.round(sb.wait / sb.total * 100)}% 的时间线程是死的` };
  yield { quad: 'snb', text: `同步非阻塞：同样 ${snb.total} tick，没睡，但 ${snb.chore} tick 全是空转跑腿` };
  yield { quad: 'ab',  text: `异步阻塞：只要 ${ab.total} tick！等待时睡 ${ab.wait} tick——但没活干，睡得心安理得` };
  yield { quad: 'anb', text: `异步非阻塞：${anb.total} tick，阻塞等待 ${anb.wait}——等待的时间全变成有用功` };
  yield { quad: 'all', text: `同样的三桌菜：同步 ${sb.total} tick，异步 ${ab.total} tick。同步/异步决定吞吐，阻塞/非阻塞决定线程怎么等` };
}

// Node 环境下导出，供 test.js 直接 require；浏览器里这些就是全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TABLES, COOK_TICKS, createKitchen,
    syncBlocking, syncNonBlocking, asyncBlocking, asyncNonBlocking,
    overviewSteps, C_LINES, cSteps, computeSummary, sumSteps,
  };
}
