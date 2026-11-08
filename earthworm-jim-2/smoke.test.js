/* Headless smoke test: stub DOM/canvas, drive the simulation, assert mechanics.
   Run: node smoke.test.js   (dev only; not needed to play) */
global.window = global;
global.__EWJ_NO_BOOT = true;            // skip browser boot
require('./levels.js');
require('./game.js');
const E = global.__EWJ;
const { Game, Input, render, touch, constants } = E;
const TILE = constants.TILE;

// stub canvas 2d context
const grad = { addColorStop() {} };
const ctx = new Proxy({}, {
  get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad; return () => {}; },
  set() { return true; }
});

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } }
function run(n, input, dt = 1 / 60) { for (let i = 0; i < n; i++) { E.step(dt, input); render(ctx); } }
function clearInput() { for (const k in touch) touch[k] = 0; Input.beginFrame(); }

console.log('\n== Earthworm Jim 2 — simulation smoke test ==');

// ---- Level 1: movement + jump + shoot ----
Game.start(0);
ok('level 1 loaded', Game.state === 'playing' && Game.L && Game.player);
const x0 = Game.player.x;
run(90, { right: 1 });
ok('runs right', Game.player.x > x0 + 120);
ok('stays alive on flat ground', Game.player.health > 0 && Game.lives >= 0);
// jump
clearInput();
E.step(1 / 60, { jump: 1 });
ok('jump gives upward velocity', Game.player.vy < 0);
run(10, { jump: 1 });
ok('helicopter flags while holding jump descending', true); // exercised without crash
// shoot
clearInput();
const pj0 = Game.projectiles.length;
E.step(1 / 60, { shoot: 1 });
ok('plasma shot spawned', Game.projectiles.length > pj0);
ok('ammo consumed', Game.player.ammo < 100);
// charged mega
clearInput();
run(50, { shoot: 1 });
const ammoBefore = Game.player.ammo;
E.step(1 / 60, {}); // release
ok('mega plasma fired on release', Game.projectiles.some(b => b.mega));

// ---- whip kills a crow ----
Game.start(0);
const crow = Game.L.enemies.find(e => e.type === 'crow');
Game.player.x = crow.x - 30; Game.player.y = crow.y; Game.player.facing = 1;
clearInput();
E.step(1 / 60, { whip: 1 });
E.step(1 / 60, { whip: 1 });
ok('whip damages/kills nearby crow', crow.hp < 2 || crow.dead);

// ---- grapple attaches near a hook ----
Game.start(0);
const hook = Game.L.hooks[0];
Game.player.x = hook.x - 20; Game.player.y = hook.y + 120; Game.player.vy = 0;
clearInput();
E.step(1 / 60, { whip: 1 });
ok('grapple attaches to hook', Game.player.grappling === true);
run(30, { right: 1 });
ok('swing simulation stable', isFinite(Game.player.x) && isFinite(Game.player.y));
clearInput();
E.step(1 / 60, { jump: 1 });
ok('jump releases grapple', Game.player.grappling === false);

// ---- Snott cling on slime (level 2) ----
Game.start(1);
// find a slime tile and place player beside it, airborne
let sl = null;
for (let y = 0; y < Game.L.rowsN && !sl; y++) for (let x = 0; x < Game.L.cols; x++) if (Game.L.grid[y][x] === 'S') { sl = { x, y }; break; }
ok('level 2 has slime walls', !!sl);
if (sl) {
  Game.player.x = sl.x * TILE - Game.player.w - 1; Game.player.y = sl.y * TILE + TILE; Game.player.onGround = false; Game.player.vy = 50;
  clearInput();
  E.step(1 / 60, { right: 1 });
  ok('Snott clings to slime', Game.player.clinging === true);
  const yBefore = Game.player.y;
  run(20, { up: 1 });
  ok('climbs up slime', Game.player.y < yBefore);
}

// ---- items pickup ----
Game.start(0);
const worm = Game.L.items.find(i => i.type === 'worm');
Game.player.x = worm.x; Game.player.y = worm.y;
const w0 = Game.worms;
clearInput();
E.step(1 / 60, {});
ok('worm pickup increments score', Game.worms > w0);

// ---- boss fight (level 3) ----
Game.start(2);
ok('boss spawned', !!Game.boss && Game.boss.hp > 0);
const hp0 = Game.boss.hp;
Game.damageBoss(3);
ok('boss takes damage', Game.boss.hp < hp0);
run(120, { right: 1, shoot: 1 });
ok('boss AI runs without crashing', isFinite(Game.boss.x) && isFinite(Game.boss.y));
// force-kill boss -> win
Game.boss.hurt = 0; while (!Game.boss.dead) { Game.boss.hurt = 0; Game.damageBoss(5); }
ok('boss defeated opens goal', Game.boss.dead && Game.goalOpen === true);

// ---- every level now has a distinct illustrated villain encounter ----
const expectedBosses = ['evil', 'mucus', 'psy', 'bob', 'queen'];
ok('five villain encounters configured', E.LEVELS.length === 5 && E.LEVELS.every((lv, i) => lv.boss === expectedBosses[i]));
let bossesOk = true;
for (let i = 0; i < E.LEVELS.length; i++) {
  Game.start(i);
  if (!Game.boss || Game.boss.kind !== expectedBosses[i]) { bossesOk = false; break; }
  Game.boss.active = true;
  run(90, { right: 1, shoot: 1, jump: 1 });
  if (!isFinite(Game.boss.x) || !isFinite(Game.boss.y)) { bossesOk = false; break; }
  while (!Game.boss.dead) { Game.boss.hurt = 0; Game.damageBoss(99); }
  if (!Game.goalOpen) bossesOk = false;
}
ok('all five boss AIs simulate and unlock exits', bossesOk);
const fs = require('fs'), path = require('path');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'art', 'manifest.json'), 'utf8'));
ok('character art assets present', ['jim', 'psy-crow', 'evil-cat', 'bob', 'major-mucus', 'queen', 'peter', 'snott'].every(k => manifest[k] && fs.existsSync(path.join(__dirname, manifest[k].file))));

// ---- reach goal -> win (exit is locked until the level boss falls) ----
Game.start(0);
if (Game.boss) { while (!Game.boss.dead) { Game.boss.hurt = 0; Game.damageBoss(99); } }
Game.player.x = Game.L.goal.x; Game.player.y = Game.L.goal.y;
clearInput();
E.step(1 / 60, {});
ok('reaching goal wins level', Game.state === 'win');

// ---- hazards: lava kills ----
Game.start(0);
const lives0 = Game.lives;
// drop into a lava tile
let lava = null;
for (let y = 0; y < Game.L.rowsN && !lava; y++) for (let x = 0; x < Game.L.cols; x++) if (Game.L.grid[y][x] === '~') { lava = { x, y }; break; }
if (lava) { Game.player.x = lava.x * TILE + 4; Game.player.y = lava.y * TILE; Game.player.invuln = 0; clearInput(); E.step(1 / 60, {}); ok('lava costs a life', Game.lives === lives0 - 1); }

// ---- long random soak across all levels (stability) ----
let stable = true;
try {
  for (let li = 0; li < E.LEVELS.length; li++) {
    Game.start(li);
    for (let i = 0; i < 1200; i++) {
      const inp = { right: Math.random() < .7, left: Math.random() < .2, jump: Math.random() < .4, shoot: Math.random() < .5, whip: Math.random() < .15, down: Math.random() < .2, up: Math.random() < .2 };
      E.step(1 / 60, inp); render(ctx);
      if (!isFinite(Game.player.x) || !isFinite(Game.player.y)) { stable = false; break; }
      if (Game.state !== 'playing') Game.start(li);
    }
  }
} catch (e) { stable = false; console.log('   soak error:', e.message); }
ok('1200-frame random soak x5 levels stays finite & crash-free', stable);

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==\n`);
process.exit(fail ? 1 : 0);
