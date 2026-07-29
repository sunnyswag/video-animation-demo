// 逻辑层回归测试：node test.js
// 不碰 DOM，直接驱动 logic.js 里的生成器，验证四个场景的
// 上菜顺序、节拍数、时间账统计与页面展示的数据口径一致。
const L = require('./logic.js');

let failed = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`  ok  ${name}`); }
  else { failed++; console.error(`FAIL  ${name}\n      期望 ${e}\n      实际 ${a}`); }
}

// 与 ui.js / computeSummary 相同的驱动方式：每拍先让厨房走一格，再推进一步生成器
function run(genFn) {
  const kitchen = L.createKitchen();
  const state = { served: [], stats: { total: 0, work: 0, chore: 0, wait: 0 } };
  const gen = genFn(kitchen, state);
  let ticks = 0;
  while (true) {
    kitchen.tick();
    const r = gen.next();
    if (r.done) break;
    ticks++;
    const c = r.value.cost;
    if (c && c !== 'free') { state.stats.total++; state.stats[c]++; }
  }
  return { served: state.served, ticks, stats: state.stats };
}

console.log('— 四场景：上菜顺序 / 节拍数 / 时间账 —');
const sb = run(L.syncBlocking);
eq(sb.served, ['A', 'B', 'C'], '同步阻塞 上菜顺序 A→B→C');
eq(sb.ticks, 17, '同步阻塞 17 拍');
eq(sb.stats, { total: 16, work: 6, chore: 0, wait: 10 }, '同步阻塞 时间账');

const snb = run(L.syncNonBlocking);
eq(snb.served, ['A', 'B', 'C'], '同步非阻塞 上菜顺序 A→B→C');
eq(snb.ticks, 17, '同步非阻塞 17 拍');
eq(snb.stats, { total: 16, work: 6, chore: 10, wait: 0 }, '同步非阻塞 时间账');

const ab = run(L.asyncBlocking);
eq(ab.served, ['B', 'C', 'A'], '异步阻塞 上菜顺序 B→C→A');
eq(ab.ticks, 9, '异步阻塞 9 拍');
eq(ab.stats, { total: 8, work: 6, chore: 0, wait: 2 }, '异步阻塞 时间账');

const anb = run(L.asyncNonBlocking);
eq(anb.served, ['B', 'C', 'A'], '异步非阻塞 上菜顺序 B→C→A');
eq(anb.ticks, 9, '异步非阻塞 9 拍');
eq(anb.stats, { total: 8, work: 6, chore: 2, wait: 0 }, '异步非阻塞 时间账');

console.log('— 数据总结与场景口径一致 —');
const sum = L.computeSummary();
eq(sum.map(x => x.quad), ['sb', 'snb', 'ab', 'anb'], 'computeSummary 四象限顺序');
eq(sum.map(x => x.stats), [sb.stats, snb.stats, ab.stats, anb.stats], 'computeSummary 数字 = 实跑数字');
eq(sum.map(x => x.order), ['A→B→C', 'A→B→C', 'B→C→A', 'B→C→A'], 'computeSummary 上菜顺序');

console.log('— 其余分镜节拍 —');
eq(run(L.overviewSteps).ticks, 11, '总览 11 拍');
eq(run(L.cSteps).ticks, 5, 'C 代码 5 拍');
eq(run(L.sumSteps).ticks, 5, '总结 5 拍');

console.log('— 厨房模型 —');
const k = L.createKitchen();
k.submit('B'); k.tick(); k.tick();
eq(k.ready().map(o => o.table), ['B'], 'B 两拍后出锅');
k.take('B');
eq(k.ready(), [], 'take 后窗口清空');
eq(L.TABLES, ['A', 'B', 'C'], '三桌');
eq(L.COOK_TICKS, { A: 7, B: 2, C: 4 }, '做菜节拍');
eq(L.C_LINES.length, 13, 'C 代码 13 行');

console.log(failed ? `\n${failed} 项失败` : '\n全部通过 ✅');
process.exit(failed ? 1 : 0);
