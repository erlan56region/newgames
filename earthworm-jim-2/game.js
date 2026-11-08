/* =====================================================================
   EARTHWORM JIM 2 — playable fan prototype
   Original engine + art, inspired by the classic mechanics.
   Mechanics ported: run/jump, plasma blaster (+ charged mega-plasma),
   head-whip, head-helicopter (slow fall), hook grapple-swing,
   Snott slime-cling & wall-jump, enemies, items, Psy-Crow boss.
   ===================================================================== */
(function () {
  'use strict';
  const W = (typeof window !== 'undefined') ? window : globalThis;
  const HAS_DOM = typeof document !== 'undefined';
  const LEVELS = W.LEVELS || [];
  const THEMES = W.THEMES || {};

  // ---------------- constants ----------------
  const TILE = 36, VIEW_W = 960, VIEW_H = 540;
  const GRAV = 2050, MOVE = 252, ACCEL = 1900, FRICTION = 1700, AIR_ACCEL = 1250;
  const JUMP_V = 730, JUMP_CUT = 0.45, MAX_FALL = 640, HELI_FALL = 98, CHUTE_FALL = 74;
  const CLIMB = 135, SLIDE = 42, WALLJUMP_X = 305, WALLJUMP_Y = 660;
  const COYOTE = 0.09, JUMP_BUFFER = 0.11;
  const GRAPPLE_RANGE = 250, PUMP = 950, REEL = 175;
  const PLASMA_SPEED = 680, PLASMA_DMG = 1, PLASMA_COST = 4;
  const MEGA_SPEED = 560, MEGA_DMG = 3, MEGA_COST = 18, CHARGE_TIME = 0.7, FIRE_CD = 0.16;
  const AMMO_REGEN = 11, WHIP_TIME = 0.18, WHIP_RANGE = 50, WHIP_DMG = 2, WHIP_CD = 0.30;
  const INVULN = 1.15, PW = 26, PH = 40;

  // ---------------- utils ----------------
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
  const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // ---------------- character / background art ----------------
  const Art = {
    imgs: {}, started: false,
    files: {
      jim: 'art/sprites/jim.png', 'jim-run-0': 'art/sprites/jim-run-0.png',
      'jim-run-1': 'art/sprites/jim-run-1.png', 'jim-run-2': 'art/sprites/jim-run-2.png',
      'jim-run-3': 'art/sprites/jim-run-3.png',
      psy: 'art/sprites/psy-crow.png', evil: 'art/sprites/evil-cat.png',
      bob: 'art/sprites/bob.png', mucus: 'art/sprites/major-mucus.png',
      queen: 'art/sprites/queen.png', peter: 'art/sprites/peter.png',
      snott: 'art/sprites/snott.png', 'bg-junk': 'art/bg-junk.jpg'
    },
    load() {
      if (!HAS_DOM || this.started) return;
      this.started = true;
      for (const k in this.files) {
        const im = new Image();
        im.src = this.files[k];
        this.imgs[k] = im;
      }
    },
    get(k) {
      const im = this.imgs[k];
      const w = im && (im.naturalWidth || im.width);
      return (im && im.complete !== false && w > 0) ? im : null;
    }
  };
  const BOSS_INFO = {
    psy:   { name: 'PSY-CROW · ПСАЙ-ВОРОН',       hp: 46, w: 74, h: 96,  fly: true,  artH: 128 },
    evil:  { name: 'EVIL THE CAT · КОТ ЗЛО',       hp: 22, w: 52, h: 62,  fly: false, artH: 104 },
    mucus: { name: 'MAJOR MUCUS · МАЙОР СЛИЗЬ',    hp: 30, w: 66, h: 62,  fly: true,  artH: 112 },
    bob:   { name: 'BOB · БОБ-УБИЙЦА',             hp: 26, w: 50, h: 62,  fly: false, artH: 104 },
    queen: { name: 'QUEEN SLUG-FOR-A-BUTT · КОРОЛЕВА', hp: 64, w: 104, h: 78, fly: false, artH: 132 }
  };

  // ---------------- input ----------------
  const keys = new Set();
  const touch = { left: 0, right: 0, up: 0, down: 0, jump: 0, shoot: 0, whip: 0 };
  const Input = {
    state: { left: 0, right: 0, up: 0, down: 0, jump: 0, shoot: 0, whip: 0 },
    prev: {}, edge: {}, edgeUp: {},
    compute() {
      const s = this.state;
      s.left = keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
      s.right = keys.has('ArrowRight') || keys.has('KeyD') || touch.right;
      s.up = keys.has('ArrowUp') || keys.has('KeyW') || touch.up;
      s.down = keys.has('ArrowDown') || keys.has('KeyS') || touch.down;
      s.jump = keys.has('Space') || keys.has('KeyZ') || touch.jump;
      s.shoot = keys.has('KeyJ') || keys.has('KeyX') || touch.shoot;
      s.whip = keys.has('KeyK') || keys.has('KeyC') || touch.whip;
    },
    beginFrame() {
      this.compute();
      for (const k in this.state) {
        const cur = !!this.state[k], pv = !!this.prev[k];
        this.edge[k] = cur && !pv; this.edgeUp[k] = pv && !cur; this.prev[k] = cur;
      }
    },
    pressed(k) { return !!this.edge[k]; },
    released(k) { return !!this.edgeUp[k]; },
    down(k) { return !!this.state[k]; }
  };

  // ---------------- audio (synth, no assets) ----------------
  const Audio = {
    ctx: null, muted: false, musicTimer: 0, musicStep: 0,
    init() {
      if (this.ctx || !HAS_DOM) return;
      try { this.ctx = new (W.AudioContext || W.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    },
    beep(freq, dur, type, vol, slideTo) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
      src.buffer = buf; g.gain.value = vol || 0.2; src.connect(g); g.connect(this.ctx.destination); src.start();
    },
    sfx(name) {
      switch (name) {
        case 'shoot': this.beep(720, 0.12, 'square', 0.10, 240); break;
        case 'mega': this.beep(180, 0.32, 'sawtooth', 0.16, 720); this.noise(0.18, 0.10); break;
        case 'jump': this.beep(320, 0.14, 'square', 0.10, 620); break;
        case 'whip': this.noise(0.12, 0.14); this.beep(500, 0.08, 'triangle', 0.06, 900); break;
        case 'grapple': this.beep(420, 0.10, 'triangle', 0.10, 760); break;
        case 'hit': this.beep(300, 0.10, 'square', 0.12, 120); break;
        case 'hurt': this.beep(220, 0.28, 'sawtooth', 0.16, 70); break;
        case 'pickup': this.beep(660, 0.09, 'square', 0.10, 990); this.beep(990, 0.10, 'square', 0.08, 1320); break;
        case 'life': this.beep(523, 0.1, 'square', 0.12); this.beep(784, 0.12, 'square', 0.12); this.beep(1046, 0.16, 'square', 0.12); break;
        case 'explode': this.noise(0.4, 0.25); this.beep(120, 0.4, 'sawtooth', 0.14, 40); break;
        case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 'square', 0.13), i * 130)); break;
        case 'boss': this.beep(140, 0.5, 'sawtooth', 0.16, 90); break;
      }
    },
    music(dt) {
      if (!this.ctx || this.muted) return;
      this.musicTimer -= dt;
      if (this.musicTimer <= 0) {
        this.musicTimer = 0.28;
        const bass = [110, 110, 146, 110, 130, 130, 98, 110];
        const arp = [440, 554, 659, 554, 587, 659, 494, 554];
        const i = this.musicStep % 8;
        this.beep(bass[i], 0.22, 'triangle', 0.05);
        if (this.musicStep % 2 === 0) this.beep(arp[i], 0.12, 'square', 0.025);
        this.musicStep++;
      }
    }
  };

  // ---------------- level parsing ----------------
  function parseLevel(def) {
    const rows = def.rows, H = rows.length, Wc = rows[0].length;
    const grid = rows.map(r => r.split(''));
    const L = {
      def, grid, cols: Wc, rowsN: H, w: Wc * TILE, h: H * TILE,
      theme: THEMES[def.theme] || THEMES.tangerine, themeName: def.theme,
      hooks: [], items: [], enemies: [], allies: [], start: { x: 2 * TILE, y: 2 * TILE },
      goal: null, bossSpawn: null, isBoss: !!def.boss, bossKind: def.boss || null
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < Wc; x++) {
      const c = grid[y][x], cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
      switch (c) {
        case 'o': L.hooks.push({ x: cx, y: cy }); grid[y][x] = '.'; break;
        case 'w': L.items.push(mkItem('worm', cx, cy)); grid[y][x] = '.'; break;
        case 'a': L.items.push(mkItem('ammo', cx, cy)); grid[y][x] = '.'; break;
        case '+': L.items.push(mkItem('health', cx, cy)); grid[y][x] = '.'; break;
        case 'l': L.items.push(mkItem('life', cx, cy)); grid[y][x] = '.'; break;
        case 'e': L.enemies.push(mkEnemy('crow', x * TILE + 4, y * TILE + TILE - 30)); grid[y][x] = '.'; break;
        case 'f': L.enemies.push(mkEnemy('flyer', cx - 16, cy - 12)); grid[y][x] = '.'; break;
        case 'p': L.start = { x: x * TILE + (TILE - PW) / 2, y: y * TILE + TILE - PH }; grid[y][x] = '.'; break;
        case 'P': L.allies.push({ type: 'peter', x: cx - 14, y: y * TILE + TILE - 34, w: 28, h: 34, vx: 0, vy: 0, t: 0, onGround: false }); grid[y][x] = '.'; break;
        case 'g': L.goal = { x: x * TILE + 4, y: y * TILE - TILE + 6, w: TILE - 8, h: TILE * 2 - 6 }; grid[y][x] = '.'; break;
        case 'b': L.bossSpawn = { x: cx, y: cy }; grid[y][x] = '.'; break;
      }
    }
    return L;
  }
  function mkItem(type, cx, cy) { return { type, x: cx - 11, y: cy - 11, w: 22, h: 22, t: Math.random() * 6, dead: false }; }
  function mkEnemy(type, x, y) {
    if (type === 'flyer') return { type, x, y, w: 32, h: 24, vx: 60, hp: 2, t: Math.random() * 6, baseY: y, dir: 1, hurt: 0, dead: false };
    return { type, x, y, w: 30, h: 30, vx: 0, vy: 0, dir: Math.random() < .5 ? -1 : 1, hp: 2, onGround: false, hurt: 0, dead: false, flap: 0 };
  }

  // ---------------- tile helpers ----------------
  function tileAt(L, tx, ty) {
    if (tx < 0 || tx >= L.cols) return '#';
    if (ty < 0 || ty >= L.rowsN) return '.';
    return L.grid[ty][tx];
  }
  const isSolid = c => c === '#' || c === 'S';
  function solid(L, tx, ty) { return isSolid(tileAt(L, tx, ty)); }
  function resolveX(L, e) {
    if (e.vx > 0) {
      const tx = Math.floor((e.x + e.w) / TILE), t0 = Math.floor(e.y / TILE), t1 = Math.floor((e.y + e.h - 1) / TILE);
      for (let ty = t0; ty <= t1; ty++) if (solid(L, tx, ty)) { e.x = tx * TILE - e.w - 0.01; e.vx = 0; e.hitWall = 1; return; }
    } else if (e.vx < 0) {
      const tx = Math.floor(e.x / TILE), t0 = Math.floor(e.y / TILE), t1 = Math.floor((e.y + e.h - 1) / TILE);
      for (let ty = t0; ty <= t1; ty++) if (solid(L, tx, ty)) { e.x = (tx + 1) * TILE + 0.01; e.vx = 0; e.hitWall = -1; return; }
    }
  }
  function resolveY(L, e, prevBottom, oneWay) {
    if (e.vy > 0) {
      const ty = Math.floor((e.y + e.h) / TILE), t0 = Math.floor(e.x / TILE), t1 = Math.floor((e.x + e.w - 1) / TILE);
      for (let tx = t0; tx <= t1; tx++) {
        const c = tileAt(L, tx, ty);
        if (isSolid(c) || (oneWay && c === '=' && prevBottom <= ty * TILE + 3)) {
          e.y = ty * TILE - e.h - 0.01; e.vy = 0; e.onGround = true; return;
        }
      }
    } else if (e.vy < 0) {
      const ty = Math.floor(e.y / TILE), t0 = Math.floor(e.x / TILE), t1 = Math.floor((e.x + e.w - 1) / TILE);
      for (let tx = t0; tx <= t1; tx++) if (solid(L, tx, ty)) { e.y = (ty + 1) * TILE + 0.01; e.vy = 0; return; }
    }
  }
  function tileMove(L, e, dt, oneWay) {
    e.hitWall = 0;
    e.x += e.vx * dt; resolveX(L, e);
    const pb = e.y + e.h; e.y += e.vy * dt; e.onGround = false; resolveY(L, e, pb, oneWay);
  }
  function slimeNear(L, e) {
    const ty0 = Math.floor((e.y + 4) / TILE), ty1 = Math.floor((e.y + e.h - 4) / TILE);
    const lx = Math.floor((e.x - 3) / TILE), rx = Math.floor((e.x + e.w + 3) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (tileAt(L, rx, ty) === 'S') return { dir: 1, tx: rx };
      if (tileAt(L, lx, ty) === 'S') return { dir: -1, tx: lx };
    }
    return null;
  }

  // ---------------- game state ----------------
  const Game = {
    state: 'title', levelIndex: 0, L: null, player: null,
    projectiles: [], particles: [], boss: null,
    cam: { x: 0, y: 0 }, worms: 0, lives: 3, time: 0, shake: 0,
    unlocked: 1, goalOpen: true, message: '', msgT: 0,

    loadLevel(i) {
      this.levelIndex = i;
      this.L = parseLevel(LEVELS[i]);
      const L = this.L;
      this.player = {
        x: L.start.x, y: L.start.y, w: PW, h: PH, vx: 0, vy: 0, facing: 1,
        onGround: false, health: 100, ammo: 100, invuln: 0,
        coyote: 0, jumpBuf: 0, fireCd: 0, charge: 0, charging: false,
        whip: 0, whipCd: 0, grappling: false, grapple: null,
        clinging: false, clingLock: 0, heli: false, chute: false,
        runT: 0, muzzle: 0, safe: { x: L.start.x, y: L.start.y }, dead: false
      };
      this.projectiles = []; this.particles = [];
      this.boss = L.bossSpawn ? mkBoss(L.bossKind || 'psy', L.bossSpawn.x, L.bossSpawn.y) : null;
      this.goalOpen = !this.boss;
      this.cam.x = clamp(this.player.x - VIEW_W / 2, 0, Math.max(0, L.w - VIEW_W));
      this.cam.y = clamp(this.player.y - VIEW_H / 2, 0, Math.max(0, L.h - VIEW_H));
      this.time = 0; this.shake = 0;
      if (this.boss) Audio.sfx('boss');
      this.toast(LEVELS[i].name, 2.2);
      this.updateHUD();
    },

    start(i) {
      Audio.init(); Art.load();
      this.worms = 0; this.lives = 3;
      this.loadLevel(i || 0);
      this.state = 'playing';
      if (HAS_DOM) UI.showGame();
    },

    toast(msg, t) { this.message = msg; this.msgT = t || 1.6; if (HAS_DOM) UI.toast(msg); },

    // ---------- update ----------
    update(dt) {
      if (this.state !== 'playing') return;
      this.time += dt;
      if (this.msgT > 0) this.msgT -= dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);
      Audio.music(dt);
      const L = this.L, p = this.player;

      this.updatePlayer(dt, L, p);
      this.updateEnemies(dt, L);
      this.updateAllies(dt, L);
      if (this.boss) this.updateBoss(dt, L);
      this.updateProjectiles(dt, L);
      this.updateItems(dt, L);
      this.updateParticles(dt);
      this.updateCamera(dt, L);

      // goal (trigger on overlap OR crossing the exit line, so you can't overshoot it)
      if (L.goal && this.goalOpen && (aabb(p, L.goal) || p.x + p.w / 2 >= L.goal.x + L.goal.w / 2)) this.win();
      if (HAS_DOM) this.updateHUD();
    },

    updatePlayer(dt, L, p) {
      if (p.invuln > 0) p.invuln -= dt;
      if (p.fireCd > 0) p.fireCd -= dt;
      if (p.whipCd > 0) p.whipCd -= dt;
      if (p.whip > 0) p.whip -= dt;
      if (p.muzzle > 0) p.muzzle -= dt;
      if (p.clingLock > 0) p.clingLock -= dt;
      const ix = (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0);

      // ----- grapple swing -----
      if (p.grappling) {
        const g = p.grapple;
        p.vy += GRAV * dt;
        p.vx += ix * PUMP * dt;
        p.vx *= 0.999;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (Input.down('up')) g.len = Math.max(48, g.len - REEL * dt);
        if (Input.down('down')) g.len = Math.min(GRAPPLE_RANGE, g.len + REEL * dt);
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        let dx = cx - g.hx, dy = cy - g.hy, d = Math.hypot(dx, dy) || 0.001;
        if (d > g.len) {
          const nx = dx / d, ny = dy / d;
          p.x = g.hx + nx * g.len - p.w / 2; p.y = g.hy + ny * g.len - p.h / 2;
          const radial = p.vx * nx + p.vy * ny;
          if (radial > 0) { p.vx -= radial * nx; p.vy -= radial * ny; }
        }
        if (Math.abs(p.vx) > 12) p.facing = sign(p.vx);
        if (Input.pressed('jump') || Input.pressed('whip')) {
          p.grappling = false; p.grapple = null;
          if (Input.pressed('jump')) p.vy -= 150;
          Audio.sfx('jump');
        }
        if (p.y > L.h + 120) this.die();
        this.handleCombatInput(dt, p);
        return;
      }

      // ----- Snott slime cling -----
      const sl = slimeNear(L, p);
      if (p.clinging) {
        if (!sl || p.clingLock > 0) { p.clinging = false; }
        else {
          const away = (ix === -sl.dir);
          if (Input.pressed('jump') && away) {
            p.vx = -sl.dir * WALLJUMP_X; p.vy = -WALLJUMP_Y; p.facing = -sl.dir;
            p.clinging = false; p.clingLock = 0.2; Audio.sfx('jump');
          } else {
            p.vx = 0; p.facing = -sl.dir;
            p.x = sl.dir > 0 ? sl.tx * TILE - p.w - 0.5 : (sl.tx + 1) * TILE + 0.5;
            const climbing = Input.down('up') || Input.down('jump');
            if (climbing) p.vy = -CLIMB; else if (Input.down('down')) p.vy = CLIMB; else p.vy = SLIDE;
            const pb = p.y + p.h; p.y += p.vy * dt; p.onGround = false; resolveY(L, p, pb, false);
            // mantle: when Jim reaches the top of the slime, Snott hauls him up onto it
            if (climbing) {
              let R = Math.floor(p.y / TILE);
              while (R > 0 && isSolid(tileAt(L, sl.tx, R - 1))) R--;
              if (Math.floor(p.y / TILE) <= R) {
                p.y = R * TILE - p.h - 1; p.x = sl.tx * TILE + (TILE - p.w) / 2;
                p.vy = 0; p.vx = 0; p.clinging = false; p.clingLock = 0.18; p.onGround = true;
                Audio.sfx('jump');
              }
            }
            if (p.onGround) p.clinging = false;
            this.handleCombatInput(dt, p);
            this.checkHazards(L, p);
            return;
          }
        }
      } else if (sl && !p.onGround && p.clingLock <= 0 && (Input.down('down') || ix === sl.dir)) {
        p.clinging = true; p.vy = 0; Audio.sfx('grapple');
      }

      // ----- normal movement -----
      const accel = p.onGround ? ACCEL : AIR_ACCEL;
      if (ix !== 0) { p.vx += ix * accel * dt; p.vx = clamp(p.vx, -MOVE, MOVE); p.facing = ix; }
      else if (p.onGround) { const f = FRICTION * dt; if (Math.abs(p.vx) <= f) p.vx = 0; else p.vx -= sign(p.vx) * f; }
      else { p.vx *= (1 - 0.6 * dt); }

      // gravity
      p.vy += GRAV * dt;
      // helicopter / parachute slow-fall
      p.heli = false; p.chute = false;
      if (!p.onGround && p.vy > 0) {
        if (Input.down('jump')) { p.vy = Math.min(p.vy, HELI_FALL); p.heli = true; }
        else if (Input.down('down')) { p.vy = Math.min(p.vy, CHUTE_FALL); p.chute = true; }
      }
      p.vy = Math.min(p.vy, MAX_FALL);

      // coyote + buffer
      if (p.onGround) p.coyote = COYOTE; else if (p.coyote > 0) p.coyote -= dt;
      if (Input.pressed('jump')) p.jumpBuf = JUMP_BUFFER; else if (p.jumpBuf > 0) p.jumpBuf -= dt;
      if (p.jumpBuf > 0 && p.coyote > 0) {
        p.vy = -JUMP_V; p.onGround = false; p.coyote = 0; p.jumpBuf = 0; Audio.sfx('jump');
        this.dust(p.x + p.w / 2, p.y + p.h, 6);
      }
      if (Input.released('jump') && p.vy < 0) p.vy *= JUMP_CUT;

      // whip / grapple trigger
      if (Input.pressed('whip') && p.whipCd <= 0) {
        const hook = this.findHook(L, p);
        if (hook) {
          p.grappling = true;
          p.grapple = { hx: hook.x, hy: hook.y, len: clamp(dist(p.x + p.w / 2, p.y + p.h / 2, hook.x, hook.y), 50, GRAPPLE_RANGE) };
          Audio.sfx('grapple');
        } else {
          p.whip = WHIP_TIME; p.whipCd = WHIP_CD; Audio.sfx('whip');
          this.whipHit(L, p);
        }
      }

      tileMove(L, p, dt, !Input.down('down'));
      if (p.onGround) { p.safe = { x: p.x, y: p.y }; if (Math.abs(p.vx) > 20) p.runT += dt * Math.abs(p.vx) * 0.02; }

      this.handleCombatInput(dt, p);
      this.checkHazards(L, p);
      if (p.y > L.h + 120) this.die();
      // enemy contact
      for (const e of L.enemies) if (!e.dead && aabb(p, e)) this.hurt(20, e.x + e.w / 2);
      if (this.boss && !this.boss.dead && aabb(p, this.boss)) this.hurt(24, this.boss.x + this.boss.w / 2);
    },

    handleCombatInput(dt, p) {
      // ammo regen
      if (!Input.down('shoot')) { p.ammo = Math.min(100, p.ammo + AMMO_REGEN * dt); }
      // charge + fire
      if (Input.pressed('shoot')) { p.charging = true; p.charge = 0; this.fire(p, false); }
      if (p.charging && Input.down('shoot')) {
        p.charge += dt;
        if (p.charge >= CHARGE_TIME && p.fireCd <= 0) { /* ready */ }
      }
      if (p.charging && Input.released('shoot')) {
        if (p.charge >= CHARGE_TIME) this.fire(p, true);
        p.charging = false; p.charge = 0;
      }
    },

    fire(p, mega) {
      const cost = mega ? MEGA_COST : PLASMA_COST;
      if (p.ammo < cost || (!mega && p.fireCd > 0)) { if (!mega) Audio.sfx('hit'); return; }
      p.ammo -= cost; p.fireCd = FIRE_CD; p.muzzle = 0.09;
      let dx = p.facing, dy = 0;
      if (Input.down('up') && !p.grappling) { dx = 0; dy = -1; }
      const sp = mega ? MEGA_SPEED : PLASMA_SPEED;
      const bx = p.x + p.w / 2 + (dy === 0 ? p.facing * 18 : 0) - (mega ? 9 : 5);
      const by = p.y + 14 + (dy < 0 ? -10 : 0);
      this.projectiles.push({
        x: bx, y: by, w: mega ? 18 : 10, h: mega ? 18 : 8,
        vx: dx * sp, vy: dy * sp, dmg: mega ? MEGA_DMG : PLASMA_DMG,
        mega, pierce: mega, life: 1.4, enemy: false, hit: []
      });
      Audio.sfx(mega ? 'mega' : 'shoot');
      if (mega) this.shake = 6;
    },

    findHook(L, p) {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      let best = null, bd = GRAPPLE_RANGE;
      for (const h of L.hooks) {
        if (h.y > cy + 30) continue;
        const d = dist(cx, cy, h.x, h.y);
        if (d < bd) { bd = d; best = h; }
      }
      return best;
    },

    whipHit(L, p) {
      const hb = { x: p.facing > 0 ? p.x + p.w : p.x - WHIP_RANGE, y: p.y + 4, w: WHIP_RANGE, h: p.h - 8 };
      for (const e of L.enemies) if (!e.dead && aabb(hb, e)) this.damageEnemy(e, WHIP_DMG, p.facing);
      if (this.boss && !this.boss.dead && aabb(hb, this.boss)) this.damageBoss(WHIP_DMG);
    },

    checkHazards(L, p) {
      const t0 = Math.floor(p.x / TILE), t1 = Math.floor((p.x + p.w - 1) / TILE);
      const r0 = Math.floor(p.y / TILE), r1 = Math.floor((p.y + p.h - 1) / TILE);
      for (let ty = r0; ty <= r1; ty++) for (let tx = t0; tx <= t1; tx++) {
        const c = tileAt(L, tx, ty);
        if (c === '~') { this.die(); return; }
        if (c === '^') { this.hurt(34, p.x + p.w / 2); p.vy = -300; }
      }
    },

    hurt(amount, fromX) {
      const p = this.player;
      if (p.invuln > 0 || p.dead) return;
      p.health -= amount; p.invuln = INVULN;
      p.vx = sign((p.x + p.w / 2) - fromX) * 270 || 270; p.vy = -260;
      p.grappling = false; p.clinging = false; this.shake = 7;
      Audio.sfx('hurt'); this.burst(p.x + p.w / 2, p.y + p.h / 2, '#ff5e3a', 10);
      if (p.health <= 0) this.die();
    },

    die() {
      const p = this.player;
      if (p.dead) return;
      p.dead = true; this.lives--;
      Audio.sfx('explode'); this.burst(p.x + p.w / 2, p.y + p.h / 2, '#8dff5a', 24); this.shake = 10;
      if (this.lives < 0) { this.gameOver(); return; }
      // respawn at last safe spot
      setTimeout(() => {
        if (this.state !== 'playing') return;
        p.dead = false; p.health = 100; p.ammo = 100; p.invuln = 1.2;
        p.vx = 0; p.vy = 0; p.grappling = false; p.clinging = false;
        p.x = p.safe.x; p.y = p.safe.y - 2;
        this.toast('Осталось жизней: ' + this.lives, 1.4);
      }, HAS_DOM ? 650 : 0);
      if (!HAS_DOM) { p.dead = false; p.health = 100; p.x = p.safe.x; p.y = p.safe.y; }
    },

    // ---------- enemies ----------
    updateEnemies(dt, L) {
      for (const e of L.enemies) {
        if (e.dead) continue;
        if (e.hurt > 0) e.hurt -= dt;
        if (e.type === 'crow') {
          e.flap += dt * 10;
          e.vx = e.dir * 72; e.vy += GRAV * dt; e.vy = Math.min(e.vy, MAX_FALL);
          tileMove(L, e, dt, true);
          // turn at wall or ledge
          const aheadX = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
          const footY = Math.floor((e.y + e.h + 3) / TILE);
          const wallTx = Math.floor(aheadX / TILE), midTy = Math.floor((e.y + e.h / 2) / TILE);
          const groundAhead = isSolid(tileAt(L, Math.floor(aheadX / TILE), footY)) || tileAt(L, Math.floor(aheadX / TILE), footY) === '=';
          if (e.hitWall || (e.onGround && !groundAhead)) e.dir *= -1;
        } else { // flyer
          e.t += dt;
          const p = this.player, dir = sign((p.x) - e.x) || 1;
          e.x += dir * 52 * dt;
          e.y = e.baseY + Math.sin(e.t * 2.2) * 26;
          e.dir = dir;
        }
      }
    },
    damageEnemy(e, dmg, dir) {
      e.hp -= dmg; e.hurt = 0.15; e.vx = (dir || 1) * 120; Audio.sfx('hit');
      this.burst(e.x + e.w / 2, e.y + e.h / 2, '#ffd23f', 6);
      if (e.hp <= 0) {
        e.dead = true; Audio.sfx('explode'); this.burst(e.x + e.w / 2, e.y + e.h / 2, '#ff8a5c', 14);
        if (Math.random() < 0.6) this.L.items.push(mkItem('worm', e.x + e.w / 2, e.y + e.h / 2));
        this.addWorm(2);
      }
    },

    // ---------- companions ----------
    updateAllies(dt, L) {
      const p = this.player;
      for (const a of L.allies) {
        a.t += dt;
        const targetX = p.x - p.facing * 54;
        const dx = targetX - a.x;
        a.vx = clamp(dx * 4, -190, 190);
        a.vy += GRAV * dt; a.vy = Math.min(a.vy, MAX_FALL);
        if (a.onGround && (p.y + p.h < a.y - 30 || a.hitWall)) a.vy = -560;
        tileMove(L, a, dt, true);
        if (a.y > L.h + 80) { a.x = p.x - 40; a.y = p.y - 20; a.vy = 0; }
        // Peter's nervous energy helps recharge the blaster when he is close.
        if (dist(a.x, a.y, p.x, p.y) < 130) p.ammo = Math.min(100, p.ammo + 5 * dt);
      }
    },

    // ---------- boss ----------
    updateBoss(dt, L) {
      const b = this.boss; if (!b || b.dead) return;
      const p = this.player;
      if (!b.active) {
        if (dist(p.x, p.y, b.x, b.y) > 560) return;
        b.active = true; Audio.sfx('boss');
        this.toast((BOSS_INFO[b.kind] || BOSS_INFO.psy).name, 2.2);
      }
      b.t += dt; if (b.hurt > 0) b.hurt -= dt;
      b.actionT -= dt;
      b.dir = sign((p.x + p.w / 2) - (b.x + b.w / 2)) || 1;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const aim = Math.atan2((p.y + p.h / 2) - cy, (p.x + p.w / 2) - cx);
      const shot = (ang, sp, dmg, kind, grav, size) => {
        const s = size || 12;
        this.projectiles.push({ x: cx - s / 2, y: cy - s / 2, w: s, h: s, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg, life: 3.2, enemy: true, kind: kind || 'bullet', grav: !!grav });
        Audio.sfx('shoot');
      };

      if (b.kind === 'psy') {
        if (b.state === 'hover') {
          const tx = b.homeX + Math.sin(b.t * 1.1) * Math.min(260, L.w * 0.22);
          b.x += (tx - b.x) * Math.min(1, dt * 2);
          b.y = b.homeY + Math.sin(b.t * 2) * 22;
          if (b.actionT <= 0) {
            b.state = Math.random() < 0.5 ? 'shoot' : 'swoop';
            b.actionT = b.state === 'shoot' ? 1.1 : 1.4;
            if (b.state === 'swoop') { b.targetX = p.x; b.targetY = p.y - 10; b.swoopT = 0; }
            if (b.state === 'shoot') b.shots = 0;
          }
        } else if (b.state === 'shoot') {
          b.y += (b.homeY - b.y) * Math.min(1, dt * 3);
          if (b.actionT <= 0.8 && b.shots < 3 && Math.floor(b.t * 6) !== b.lastShot) {
            b.lastShot = Math.floor(b.t * 6); b.shots++; shot(aim, 300, 16, 'bullet');
          }
          if (b.actionT <= 0) { b.state = 'hover'; b.actionT = rand(1.2, 2.2); }
        } else if (b.state === 'swoop') {
          b.swoopT += dt;
          if (b.swoopT < 0.7) { b.x += (b.targetX - b.x) * Math.min(1, dt * 4); b.y += (b.targetY - b.y) * Math.min(1, dt * 4); }
          else { b.x += (b.homeX - b.x) * Math.min(1, dt * 2.5); b.y += (b.homeY - b.y) * Math.min(1, dt * 2.5); }
          if (b.actionT <= 0) { b.state = 'hover'; b.actionT = rand(1.2, 2.0); }
        }
      } else if (b.kind === 'evil') {
        b.vy = (b.vy || 0) + GRAV * dt; b.vy = Math.min(b.vy, MAX_FALL);
        if (b.state === 'stalk') {
          b.vx = b.dir * 125;
          if (b.actionT <= 0) {
            if (Math.random() < 0.55) { b.state = 'pounce'; b.vx = b.dir * 330; b.vy = -540; b.actionT = 1.1; }
            else { b.state = 'shoot'; b.shots = 0; b.actionT = 1.0; b.vx = 0; }
          }
        } else if (b.state === 'pounce') {
          if (b.onGround && b.actionT < 0.75) { b.state = 'stalk'; b.actionT = rand(0.9, 1.6); this.dust(cx, b.y + b.h, 8); }
        } else if (b.state === 'shoot') {
          b.vx = 0;
          if (b.shots < 3 && Math.floor(b.t * 7) !== b.lastShot) { b.lastShot = Math.floor(b.t * 7); b.shots++; shot(aim + rand(-0.12, 0.12), 280, 14, 'hairball', true); }
          if (b.actionT <= 0) { b.state = 'stalk'; b.actionT = rand(1.0, 1.7); }
        }
        tileMove(L, b, dt, false);
      } else if (b.kind === 'mucus') {
        b.x = b.homeX + Math.sin(b.t * 0.9) * 90;
        b.y = b.homeY + Math.sin(b.t * 1.7) * 26;
        if (b.state === 'hover' && b.actionT <= 0) { b.state = 'drop'; b.shots = 0; b.actionT = 1.2; }
        else if (b.state === 'drop') {
          if (b.shots < 4 && Math.floor(b.t * 5) !== b.lastShot) { b.lastShot = Math.floor(b.t * 5); b.shots++; shot(Math.PI / 2 + rand(-0.35, 0.35), 190, 15, 'slime', true, 14); }
          if (b.actionT <= 0) {
            b.state = 'hover'; b.actionT = rand(1.3, 2.1);
            if (L.enemies.filter(e => !e.dead).length < 10) L.enemies.push(mkEnemy('flyer', b.x + rand(-40, 40), b.y + 30));
          }
        }
      } else if (b.kind === 'bob') {
        b.vy = (b.vy || 0) + GRAV * dt; b.vy = Math.min(b.vy, MAX_FALL);
        if (b.state === 'walk') {
          b.vx = b.dir * 78;
          if (b.actionT <= 0) { b.state = 'shoot'; b.shots = 0; b.actionT = 0.9; b.vx = 0; }
          if (b.onGround && Math.random() < dt * 0.35) b.vy = -420;
        } else if (b.state === 'shoot') {
          b.vx = 0;
          if (b.shots < 1 && b.actionT < 0.65) { b.shots = 1; for (let i = -2; i <= 2; i++) shot(aim + i * 0.16, 240, 12, 'bubble', false, 13); }
          if (b.actionT <= 0) { b.state = 'walk'; b.actionT = rand(1.1, 1.8); }
        }
        tileMove(L, b, dt, false);
      } else if (b.kind === 'queen') {
        b.vy = (b.vy || 0) + GRAV * dt; b.vy = Math.min(b.vy, MAX_FALL);
        b.vx = b.dir * 34;
        if (b.state === 'idle' && b.actionT <= 0) {
          const r = Math.random();
          b.state = r < 0.45 ? 'spit' : r < 0.75 ? 'summon' : 'slam';
          b.shots = 0; b.actionT = b.state === 'spit' ? 1.0 : 0.8;
        } else if (b.state === 'spit') {
          b.vx = 0;
          if (b.shots < 1 && b.actionT < 0.6) { b.shots = 1; for (let i = -2; i <= 2; i++) shot(aim + i * 0.18, 260, 16, 'slime', true, 15); }
          if (b.actionT <= 0) { b.state = 'idle'; b.actionT = rand(1.2, 1.9); }
        } else if (b.state === 'summon') {
          b.vx = 0;
          if (b.shots < 1) { b.shots = 1; for (let i = 0; i < 2; i++) if (L.enemies.filter(e => !e.dead).length < 12) L.enemies.push(mkEnemy('crow', b.x + rand(-90, 90), b.y - 20)); }
          if (b.actionT <= 0) { b.state = 'idle'; b.actionT = rand(1.3, 2.0); }
        } else if (b.state === 'slam') {
          b.vx = 0;
          if (b.shots < 1 && b.actionT < 0.45) {
            b.shots = 1; this.shake = 10; this.dust(cx, b.y + b.h, 16);
            const gy = b.y + b.h - 14;
            this.projectiles.push({ x: cx, y: gy, w: 22, h: 14, vx: -280, vy: 0, dmg: 18, life: 2.4, enemy: true, kind: 'wave' });
            this.projectiles.push({ x: cx, y: gy, w: 22, h: 14, vx: 280, vy: 0, dmg: 18, life: 2.4, enemy: true, kind: 'wave' });
          }
          if (b.actionT <= 0) { b.state = 'idle'; b.actionT = rand(1.4, 2.1); }
        }
        tileMove(L, b, dt, false);
      }
      b.x = clamp(b.x, TILE, L.w - TILE - b.w);
      if (!BOSS_INFO[b.kind].fly) b.y = Math.min(b.y, L.h - TILE - b.h);
    },
    damageBoss(dmg) {
      const b = this.boss; if (!b || b.dead || b.hurt > 0) return;
      b.hp -= dmg; b.hurt = 0.12; Audio.sfx('hit'); this.burst(b.x + b.w / 2, b.y + b.h / 2, '#ffd23f', 8);
      if (b.hp <= 0) {
        b.dead = true; Audio.sfx('explode'); this.shake = 14;
        for (let i = 0; i < 40; i++) this.burst(b.x + b.w / 2 + rand(-30, 30), b.y + b.h / 2 + rand(-30, 30), ['#ff5e3a', '#ffd23f', '#8dff5a'][i % 3], 6);
        this.goalOpen = true;
        const nm = (BOSS_INFO[b.kind] || BOSS_INFO.psy).name.split(' · ')[0];
        this.toast(nm + ' ПОВЕРЖЕН! К выходу →', 3);
        setTimeout(() => { if (this.state === 'playing') this.win(); }, HAS_DOM ? 1400 : 0);
      }
    },

    // ---------- projectiles ----------
    updateProjectiles(dt, L) {
      const p = this.player;
      for (const b of this.projectiles) {
        if (b.dead) continue;
        if (b.grav) b.vy += 720 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0) { b.dead = true; continue; }
        const tx = Math.floor((b.x + b.w / 2) / TILE), ty = Math.floor((b.y + b.h / 2) / TILE);
        if (isSolid(tileAt(L, tx, ty))) { b.dead = true; this.burst(b.x, b.y, b.mega ? '#ffd23f' : '#4cc9f0', 5); continue; }
        if (b.enemy) {
          if (aabb(b, p)) { b.dead = true; this.hurt(b.dmg, b.x); }
        } else {
          for (const e of L.enemies) {
            if (e.dead || (b.hit && b.hit.includes(e))) continue;
            if (aabb(b, e)) { this.damageEnemy(e, b.dmg, sign(b.vx)); if (b.pierce) { b.hit.push(e); } else { b.dead = true; break; } }
          }
          if (this.boss && !this.boss.dead && aabb(b, this.boss)) { this.damageBoss(b.dmg); if (!b.pierce) b.dead = true; }
        }
      }
      this.projectiles = this.projectiles.filter(b => !b.dead);
    },

    // ---------- items ----------
    updateItems(dt, L) {
      const p = this.player;
      for (const it of L.items) {
        if (it.dead) continue; it.t += dt;
        if (aabb(p, { x: it.x - 3, y: it.y - 3, w: it.w + 6, h: it.h + 6 })) {
          it.dead = true; this.burst(it.x + it.w / 2, it.y + it.h / 2, '#8dff5a', 8);
          if (it.type === 'worm') { this.addWorm(1); Audio.sfx('pickup'); }
          else if (it.type === 'ammo') { p.ammo = Math.min(100, p.ammo + 45); Audio.sfx('pickup'); this.toast('+45 патронов', 1); }
          else if (it.type === 'health') { p.health = Math.min(100, p.health + 35); Audio.sfx('pickup'); this.toast('+35 здоровья', 1); }
          else if (it.type === 'life') { this.lives++; Audio.sfx('life'); this.toast('+1 жизнь!', 1.4); }
        }
      }
      L.items = L.items.filter(it => !it.dead);
    },
    addWorm(n) {
      this.worms += n;
      if (this.worms >= 100) { this.worms -= 100; this.lives++; Audio.sfx('life'); this.toast('100 червячков → +1 жизнь!', 1.6); }
    },

    // ---------- particles ----------
    burst(x, y, color, n) { for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: rand(-160, 160), vy: rand(-220, 40), life: rand(.3, .7), color, size: rand(2, 5) }); },
    dust(x, y, n) { for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: rand(-70, 70), vy: rand(-60, -10), life: rand(.2, .4), color: '#cfe8ff', size: rand(2, 4) }); },
    updateParticles(dt) {
      for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 500 * dt; q.life -= dt; }
      this.particles = this.particles.filter(q => q.life > 0);
    },

    updateCamera(dt, L) {
      const p = this.player;
      const tx = clamp(p.x + p.w / 2 - VIEW_W / 2 + p.facing * 40, 0, Math.max(0, L.w - VIEW_W));
      const ty = clamp(p.y + p.h / 2 - VIEW_H / 2, 0, Math.max(0, L.h - VIEW_H));
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6);
      this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 6);
    },

    win() {
      if (this.state !== 'playing') return;
      this.state = 'win'; Audio.sfx('win');
      this.unlocked = Math.max(this.unlocked, this.levelIndex + 2);
      if (HAS_DOM) UI.showWin(this.levelIndex, this.worms, this.lives);
    },
    gameOver() { this.state = 'over'; if (HAS_DOM) UI.showOver(this.worms); },

    updateHUD() {
      if (!HAS_DOM) return;
      const p = this.player;
      UI.set('healthBar', 'style.width', clamp(p.health, 0, 100) + '%');
      UI.set('ammoBar', 'style.width', clamp(p.ammo, 0, 100) + '%');
      UI.text('wormCount', this.worms); UI.text('lifeCount', Math.max(0, this.lives));
      UI.text('levelName', LEVELS[this.levelIndex].name);
      UI.text('levelSub', LEVELS[this.levelIndex].sub);
      const cw = UI.el('chargeWrap');
      if (cw) { if (p.charging && p.charge > 0.12) { cw.classList.remove('hidden'); UI.set('chargeBar', 'style.width', Math.min(100, p.charge / CHARGE_TIME * 100) + '%'); } else cw.classList.add('hidden'); }
      const bb = UI.el('bossBar');
      if (bb) {
        if (this.boss && this.boss.active && !this.boss.dead) {
          bb.classList.remove('hidden');
          UI.text('bossName', (BOSS_INFO[this.boss.kind] || BOSS_INFO.psy).name);
          UI.set('bossFill', 'style.width', clamp(this.boss.hp / this.boss.maxHp * 100, 0, 100) + '%');
        } else bb.classList.add('hidden');
      }
    }
  };

  function mkBoss(kind, x, y) {
    const info = BOSS_INFO[kind] || BOSS_INFO.psy;
    const bx = x - info.w / 2;
    const by = info.fly ? y - info.h / 2 : y - info.h;
    return {
      kind, x: bx, y: by, w: info.w, h: info.h, homeX: bx, homeY: by,
      hp: info.hp, maxHp: info.hp, t: 0, state: info.fly ? 'hover' : (kind === 'queen' ? 'idle' : kind === 'bob' ? 'walk' : 'stalk'),
      actionT: 1.6, hurt: 0, dead: false, active: false, dir: -1, shots: 0, lastShot: -1,
      swoopT: 0, targetX: 0, targetY: 0, vx: 0, vy: 0, onGround: false
    };
  }

  // =====================================================================
  //  RENDERING
  // =====================================================================
  function render(ctx) {
    const G = Game, L = G.L;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (!L) { return; }
    drawBackground(ctx, L);
    let sx = 0, sy = 0;
    if (G.shake > 0) { sx = rand(-G.shake, G.shake); sy = rand(-G.shake, G.shake); }
    ctx.save();
    ctx.translate(-Math.round(G.cam.x) + sx, -Math.round(G.cam.y) + sy);
    drawTiles(ctx, L);
    drawHooks(ctx, L);
    drawGoal(ctx, L);
    for (const it of L.items) drawItem(ctx, it);
    for (const e of L.enemies) if (!e.dead) drawEnemy(ctx, e);
    for (const a of L.allies) drawAlly(ctx, a);
    if (G.boss && !G.boss.dead) drawBoss(ctx, G.boss);
    for (const b of G.projectiles) drawProjectile(ctx, b);
    drawPlayer(ctx, G.player);
    for (const q of G.particles) { ctx.globalAlpha = Math.max(0, q.life * 1.6); ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawArt(ctx, key, cx, by, h, flip, flash) {
    const im = Art.get(key); if (!im) return false;
    const w = h * (im.naturalWidth || im.width) / (im.naturalHeight || im.height);
    ctx.save();
    ctx.translate(cx, by);
    if (flip) ctx.scale(-1, 1);
    if (flash) ctx.filter = 'brightness(1.9) saturate(0.5)';
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }
  function shadow(ctx, cx, by, w) {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(cx, by, w, w * 0.22, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  function drawAlly(ctx, a) {
    shadow(ctx, a.x + a.w / 2, a.y + a.h + 2, 16);
    const bob = a.onGround ? Math.sin(a.t * 8) * 1.5 : 0;
    if (!drawArt(ctx, 'peter', a.x + a.w / 2, a.y + a.h + bob, 52, a.vx < -8, false)) {
      ctx.fillStyle = '#b98a4a'; ctx.fillRect(a.x, a.y, a.w, a.h);
    }
  }

  function drawBackground(ctx, L) {
    const th = L.theme, cam = Game.cam, t = Game.time, name = L.themeName;
    const grd = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grd.addColorStop(0, th.skyTop); grd.addColorStop(1, th.skyBot);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (name === 'tangerine' && Art.get('bg-junk')) {
      const im = Art.get('bg-junk');
      const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
      const scale = Math.max(VIEW_W / iw, VIEW_H / ih) * 1.15;
      const w = iw * scale, h = ih * scale;
      const ox = -((cam.x * 0.18) % Math.max(1, w - VIEW_W));
      ctx.drawImage(im, ox, VIEW_H - h, w, h);
      if (w + ox < VIEW_W) ctx.drawImage(im, ox + w, VIEW_H - h, w, h);
      ctx.fillStyle = 'rgba(20,10,0,.12)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      return;
    }
    if (name === 'space') {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 90; i++) {
        const x = ((i * 137.5 - cam.x * 0.25) % (VIEW_W + 40) + VIEW_W + 40) % (VIEW_W + 40) - 20;
        const y = (i * 89.3) % VIEW_H;
        ctx.globalAlpha = 0.25 + (i % 5) * 0.15 + Math.sin(t * 2 + i) * 0.08;
        ctx.fillRect(x, y, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
      }
      ctx.globalAlpha = 1;
      const px = 760 - cam.x * 0.12;
      const pg = ctx.createRadialGradient(px - 20, 100, 10, px, 120, 80);
      pg.addColorStop(0, '#b388ff'); pg.addColorStop(1, '#3a2a6a');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, 120, 70, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(179,136,255,.35)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(px, 120, 105, 24, -0.3, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(20,16,50,.8)';
      for (let i = 0; i < 5; i++) { const sx = 120 + i * 190 - cam.x * 0.35; ctx.fillRect(sx, 330 + (i % 2) * 30, 70, 110); ctx.fillRect(sx + 20, 300 + (i % 2) * 30, 12, 40); }
    } else if (name === 'water') {
      ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = '#9fe8ff';
      for (let i = 0; i < 5; i++) { const x = 100 + i * 210 - cam.x * 0.2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x + 220, VIEW_H); ctx.lineTo(x + 60, VIEW_H); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const x = ((i * 220 - cam.x * 0.4) % (VIEW_W + 240) + VIEW_W + 240) % (VIEW_W + 240) - 120;
        ctx.strokeStyle = 'rgba(120,200,230,.35)'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(x, 150 + (i % 2) * 90, 46, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(10,40,70,.55)'; ctx.beginPath(); ctx.arc(x, 150 + (i % 2) * 90, 38, 0, 7); ctx.fill(); ctx.lineWidth = 1;
      }
      ctx.fillStyle = 'rgba(180,240,255,.35)';
      for (let i = 0; i < 24; i++) { const x = (i * 97 + t * 18) % VIEW_W, y = (VIEW_H - ((i * 173 + t * 40) % VIEW_H)); ctx.beginPath(); ctx.arc(x, y, 2 + i % 3, 0, 7); ctx.fill(); }
    } else if (name === 'hive') {
      ctx.strokeStyle = 'rgba(255,170,90,.16)'; ctx.lineWidth = 2;
      for (let row = 0; row < 6; row++) for (let col = 0; col < 12; col++) {
        const x = col * 92 + (row % 2) * 46 - (cam.x * 0.25 % 92), y = row * 78 + 20;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; const vx = x + Math.cos(a) * 40, vy = y + Math.sin(a) * 40; k ? ctx.lineTo(vx, vy) : ctx.moveTo(vx, vy); }
        ctx.closePath(); ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(30,8,40,.75)';
      for (let i = 0; i < 7; i++) { const x = i * 170 - cam.x * 0.4; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 40, 90, x + 18, 170); ctx.quadraticCurveTo(x + 70, 100, x + 90, 0); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = 'rgba(198,255,61,.25)';
      for (let i = 0; i < 14; i++) { const x = (i * 151 - cam.x * 0.5) % VIEW_W, y = 60 + (i * 67) % 220 + Math.sin(t + i) * 6; ctx.beginPath(); ctx.arc((x + VIEW_W) % VIEW_W, y, 3, 0, 7); ctx.fill(); }
    } else { // slime / gut
      ctx.fillStyle = 'rgba(10,20,15,.35)';
      for (let i = 0; i < 8; i++) {
        const x = i * 150 - (cam.x * 0.3 % 150);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 30, 120 + (i % 3) * 30, x + 10, 230 + (i % 2) * 40); ctx.lineTo(x + 44, 0); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(157,255,106,.22)'; ctx.lineWidth = 5;
      for (let i = 0; i < 6; i++) { const x = 80 + i * 180 - cam.x * 0.45; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 30, 90, x - 30, 160, x + 12, 250 + (i % 3) * 30); ctx.stroke(); }
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(157,255,106,.30)';
      for (let i = 0; i < 20; i++) { const x = (i * 113 - cam.x * 0.6) % VIEW_W, y = (VIEW_H - ((i * 197 + t * 26) % VIEW_H)); ctx.beginPath(); ctx.arc((x + VIEW_W) % VIEW_W, y, 2 + i % 4, 0, 7); ctx.fill(); }
    }
    // distant ground silhouette for depth
    ctx.fillStyle = th.hill1; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(0, VIEW_H);
    for (let x = 0; x <= VIEW_W; x += 24) ctx.lineTo(x, VIEW_H - 46 + Math.sin((x + cam.x * 0.3) * 0.008) * 22);
    ctx.lineTo(VIEW_W, VIEW_H); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }

  function drawTiles(ctx, L) {
    const th = L.theme, cam = Game.cam;
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(L.cols - 1, Math.ceil((cam.x + VIEW_W) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(L.rowsN - 1, Math.ceil((cam.y + VIEW_H) / TILE) + 1);
    const t = Game.time;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = L.grid[y][x]; if (c === '.') continue;
      const px = x * TILE, py = y * TILE;
      if (c === '#' || c === 'S') {
        ctx.fillStyle = c === 'S' ? '#1f7a3a' : th.block;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px, py + TILE - 6, TILE, 6);
        if (!isSolid(tileAt(L, x, y - 1))) { ctx.fillStyle = c === 'S' ? th.slime : th.groundTop; ctx.fillRect(px, py, TILE, 6); }
        if (c === 'S') { // slime bubbles
          ctx.fillStyle = 'rgba(157,255,106,.55)';
          for (let i = 0; i < 3; i++) { const by = py + 8 + ((i * 11 + t * 22 + x * 7) % (TILE - 12)); ctx.beginPath(); ctx.arc(px + 8 + i * 10, by, 3, 0, 7); ctx.fill(); }
          ctx.strokeStyle = 'rgba(157,255,106,.5)'; ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
        } else {
          ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
          ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(px + 2, py + 2, TILE - 4, 3);
          if (L.themeName === 'slime' || L.themeName === 'hive') {
            ctx.fillStyle = 'rgba(157,255,106,.10)';
            ctx.beginPath(); ctx.arc(px + 10 + (x * 7 % 12), py + 14 + (y * 5 % 10), 5, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(px + 24 - (x * 3 % 8), py + 26, 3, 0, 7); ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(0,0,0,.25)';
            ctx.beginPath(); ctx.arc(px + 6, py + 6, 2, 0, 7); ctx.arc(px + TILE - 6, py + TILE - 8, 2, 0, 7); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.moveTo(px + 8, py + TILE - 10); ctx.lineTo(px + TILE - 10, py + 12); ctx.stroke();
          }
        }
      } else if (c === '=') {
        ctx.fillStyle = th.groundTop; ctx.fillRect(px, py, TILE, 8);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(px, py + 8, TILE, 3);
      } else if (c === '^') {
        ctx.fillStyle = '#c9d4e6';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(px + i * 12, py + TILE); ctx.lineTo(px + i * 12 + 6, py + 12); ctx.lineTo(px + i * 12 + 12, py + TILE); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = '#8a97ad'; ctx.fillRect(px, py + TILE - 5, TILE, 5);
      } else if (c === '~') {
        ctx.fillStyle = th.hazard; ctx.fillRect(px, py + 6, TILE, TILE - 6);
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        for (let i = 0; i < TILE; i += 6) ctx.fillRect(px + i, py + 6 + Math.sin(t * 4 + i * .4 + x) * 3, 4, 3);
        ctx.fillStyle = 'rgba(255,210,63,.4)'; ctx.fillRect(px, py + 6, TILE, 3);
      }
    }
  }

  function drawHooks(ctx, L) {
    for (const h of L.hooks) {
      ctx.strokeStyle = '#c9d4e6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(h.x, h.y - 14); ctx.lineTo(h.x, h.y - 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y + 2, 6, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(h.x, h.y - 14, 3, 0, 7); ctx.fill();
      ctx.lineWidth = 1;
    }
  }
  function drawGoal(ctx, L) {
    if (!L.goal) return; const g = L.goal, t = Game.time, open = Game.goalOpen;
    ctx.save(); ctx.globalAlpha = open ? 1 : 0.35;
    const grd = ctx.createLinearGradient(g.x, g.y, g.x + g.w, g.y);
    grd.addColorStop(0, '#8dff5a'); grd.addColorStop(.5, '#4cc9f0'); grd.addColorStop(1, '#b388ff');
    ctx.fillStyle = grd; ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.sin(t * 4) * 0.2) + ')'; ctx.fillRect(g.x + 4, g.y + 4, g.w - 8, g.h - 8);
    ctx.fillStyle = '#04121a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(open ? 'EXIT' : '🔒', g.x + g.w / 2, g.y + g.h / 2);
    ctx.textAlign = 'left'; ctx.restore();
  }

  function drawItem(ctx, it) {
    const bob = Math.sin(it.t * 3) * 3, x = it.x + it.w / 2, y = it.y + it.h / 2 + bob;
    ctx.save(); ctx.translate(x, y);
    if (it.type === 'worm') {
      ctx.strokeStyle = '#ff9ecb'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-8, 4); ctx.quadraticCurveTo(-2, -6, 2, 2); ctx.quadraticCurveTo(6, 8, 9, -2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, -3, 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#04121a'; ctx.beginPath(); ctx.arc(8.6, -3, 1.1, 0, 7); ctx.fill();
    } else if (it.type === 'ammo') {
      ctx.fillStyle = '#0a2a3a'; ctx.fillRect(-8, -10, 16, 20); ctx.fillStyle = '#4cc9f0'; ctx.fillRect(-6, -8, 12, 16);
      ctx.fillStyle = '#fff'; ctx.fillRect(-2, -5, 4, 10); ctx.fillRect(-5, -2, 10, 4);
    } else if (it.type === 'health') {
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(-4, -3, 5, 0, 7); ctx.arc(4, -3, 5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(0, 9); ctx.lineTo(9, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-1.5, -4, 3, 8); ctx.fillRect(-4, -1.5, 8, 3);
    } else if (it.type === 'life') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#e0a878'; ctx.beginPath(); ctx.arc(0, -2, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#04121a'; ctx.fillRect(-3, -3, 2, 2); ctx.fillRect(1, -3, 2, 2);
      ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(ctx, e) {
    shadow(ctx, e.x + e.w / 2, e.y + e.h + 2, e.w * 0.45);
    ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    if (e.hurt > 0) ctx.globalAlpha = 0.6;
    ctx.scale(e.dir < 0 ? -1 : 1, 1);
    ctx.lineJoin = 'round';
    if (e.type === 'crow') {
      const flap = Math.sin(e.flap) * 5;
      // tail feathers
      ctx.fillStyle = '#14141c'; ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-22, -6); ctx.lineTo(-19, 2); ctx.lineTo(-24, 6); ctx.lineTo(-12, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      // body
      ctx.fillStyle = '#20202c'; ctx.beginPath(); ctx.ellipse(0, 3, 13, 10, 0, 0, 7); ctx.fill(); ctx.stroke();
      // wing feathers
      ctx.fillStyle = '#2e2e3e'; ctx.beginPath(); ctx.ellipse(-3, -1 + flap, 9, 5, -0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#101018'; ctx.beginPath(); ctx.moveTo(-9, 1 + flap); ctx.lineTo(-2, 4 + flap); ctx.moveTo(-7, -2 + flap); ctx.lineTo(0, 1 + flap); ctx.stroke();
      // head + beak
      ctx.fillStyle = '#20202c'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(8, -5, 7, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff9e3d'; ctx.beginPath(); ctx.moveTo(13, -7); ctx.lineTo(24, -4); ctx.lineTo(13, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c96a1a'; ctx.beginPath(); ctx.moveTo(13, -1); ctx.lineTo(21, -3); ctx.lineTo(13, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(9, -7, 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#04121a'; ctx.beginPath(); ctx.arc(10, -7, 1.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ff9e3d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(-5, 17); ctx.moveTo(4, 12); ctx.lineTo(5, 17); ctx.stroke();
    } else {
      const flap = Math.sin(e.t * 12) * 7;
      ctx.strokeStyle = '#2a1450'; ctx.fillStyle = '#9a6cf0';
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-16, -8 + flap, -22, flap * .4); ctx.quadraticCurveTo(-12, 6, -4, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(16, -8 + flap, 22, flap * .4); ctx.quadraticCurveTo(12, 6, 4, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7a4fd0'; ctx.beginPath(); ctx.ellipse(0, 1, 9, 10, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3, -2, 3.4, 0, 7); ctx.arc(4, -2, 3.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(-2, -1, 1.6, 0, 7); ctx.arc(5, -1, 1.6, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2a1450'; ctx.beginPath(); ctx.moveTo(-3, 6); ctx.quadraticCurveTo(0, 8, 3, 6); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoss(ctx, b) {
    const info = BOSS_INFO[b.kind] || BOSS_INFO.psy;
    const cx = b.x + b.w / 2, by = b.y + b.h;
    shadow(ctx, cx, by + 3, b.w * 0.55);
    const bob = info.fly ? Math.sin(b.t * 3) * 4 : 0;
    if (drawArt(ctx, b.kind, cx, by + bob, info.artH, b.dir < 0, b.hurt > 0)) return;
    drawBossVector(ctx, b);
  }
  function drawBossVector(ctx, b) {
    ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    if (b.hurt > 0) ctx.globalAlpha = 0.55;
    ctx.scale(b.dir < 0 ? -1 : 1, 1);
    const flap = Math.sin(b.t * 8) * 10;
    // wings
    ctx.fillStyle = '#1a1a22'; ctx.beginPath(); ctx.ellipse(-26, -6 + flap, 22, 10, -0.5, 0, 7); ctx.fill();
    // yellow suit body
    ctx.fillStyle = '#f4b81e'; ctx.beginPath(); ctx.ellipse(0, 12, 24, 26, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#c98f12'; ctx.fillRect(-22, 14, 44, 5);
    // glass dome + crow head
    ctx.fillStyle = 'rgba(180,220,255,.45)'; ctx.beginPath(); ctx.arc(2, -16, 20, 0, 7); ctx.fill();
    ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(2, -16, 20, 0, 7); ctx.stroke();
    ctx.fillStyle = '#1a1a22'; ctx.beginPath(); ctx.arc(2, -14, 12, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(-2, -16, 3.5, 0, 7); ctx.arc(7, -16, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff9e3d'; ctx.beginPath(); ctx.moveTo(12, -12); ctx.lineTo(26, -10); ctx.lineTo(12, -6); ctx.closePath(); ctx.fill();
    // blaster
    ctx.fillStyle = '#c62828'; ctx.fillRect(18, 6, 20, 9);
    ctx.restore();
  }

  function drawProjectile(ctx, b) {
    ctx.save();
    let col = '#8dff5a', glow = '#4cc9f0';
    if (b.enemy) {
      if (b.kind === 'slime') { col = '#9dff6a'; glow = '#c6ff3d'; }
      else if (b.kind === 'bubble') { col = 'rgba(140,220,255,.8)'; glow = '#4cc9f0'; }
      else if (b.kind === 'hairball') { col = '#c98f5a'; glow = '#ff9e3d'; }
      else if (b.kind === 'wave') { col = '#ff8a5c'; glow = '#ffd23f'; }
      else { col = '#ff2d55'; glow = '#ff2d55'; }
    } else if (b.mega) { col = '#ffd23f'; glow = '#ff5e3a'; }
    ctx.fillStyle = col; ctx.shadowColor = glow; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, 7); ctx.fill();
    if (b.kind === 'bubble') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1; }
    ctx.restore();
  }

  function drawPlayer(ctx, p) {
    if (p.dead) return;
    if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) return;
    const cx = p.x + p.w / 2, by = p.y + p.h;
    if (p.grappling && p.grapple) {
      ctx.strokeStyle = '#ff9ecb'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(cx, p.y + 8); ctx.lineTo(p.grapple.hx, p.grapple.hy); ctx.stroke(); ctx.lineWidth = 1;
    }
    const moving = p.onGround && Math.abs(p.vx) > 20;
    const frame = moving ? 'jim-run-' + (Math.floor(p.runT * 3) % 4) : 'jim';
    const key = Art.get(frame) ? frame : 'jim';
    shadow(ctx, cx, by + 2, 20);
    // Snott rides on the backpack / opens as a parachute
    if (p.clinging || p.chute) {
      drawArt(ctx, 'snott', cx - p.facing * 20, by - 8, p.chute ? 46 : 34, p.facing < 0, false);
      if (p.chute) {
        ctx.save(); ctx.strokeStyle = 'rgba(157,255,106,.7)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, p.y - 14, 30, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 28, p.y - 12); ctx.lineTo(cx - 8, p.y + 8); ctx.moveTo(cx + 28, p.y - 12); ctx.lineTo(cx + 8, p.y + 8); ctx.stroke();
        ctx.restore();
      }
    }
    const lean = moving ? Math.sin(p.runT * 6) * 0.03 : 0;
    ctx.save(); ctx.translate(cx, by); ctx.rotate(lean); ctx.translate(-cx, -by);
    const drawn = drawArt(ctx, key, cx, by + 2, 80, p.facing < 0, false);
    ctx.restore();
    if (!drawn) { drawPlayerVector(ctx, p); return; }
    // head-whip tendril over the illustrated body
    if (p.whip > 0) {
      const ext = WHIP_RANGE * (1 - p.whip / WHIP_TIME) + 18;
      ctx.save(); ctx.strokeStyle = '#e8a87c'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, p.y + 10); ctx.quadraticCurveTo(cx + p.facing * ext * 0.6, p.y + 2, cx + p.facing * ext, p.y + 12); ctx.stroke();
      ctx.fillStyle = '#e8a87c'; ctx.beginPath(); ctx.arc(cx + p.facing * ext, p.y + 12, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#04121a'; ctx.beginPath(); ctx.arc(cx + p.facing * (ext + 2), p.y + 10, 1.6, 0, 7); ctx.fill();
      ctx.restore();
    }
    if (p.heli) {
      ctx.save(); ctx.translate(cx, p.y - 4); ctx.rotate(Game.time * 30);
      ctx.fillStyle = 'rgba(232,168,124,.9)'; ctx.fillRect(-24, -2.5, 48, 5);
      ctx.restore();
      ctx.strokeStyle = 'rgba(232,168,124,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, p.y - 4, 26, 7, 0, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    }
    if (p.muzzle > 0) {
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(cx + p.facing * 34, p.y + 24, 7, 0, 7); ctx.fill();
    }
    if (p.charging && p.charge > 0.15) {
      const r = 5 + Math.min(1, p.charge / CHARGE_TIME) * 9;
      ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(Game.time * 18) * 0.2;
      ctx.fillStyle = p.charge >= CHARGE_TIME ? '#ffd23f' : '#4cc9f0';
      ctx.beginPath(); ctx.arc(cx + p.facing * 30, p.y + 24, r, 0, 7); ctx.fill(); ctx.restore();
    }
  }

  function drawPlayerVector(ctx, p) {
    if (p.dead) return;
    if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) return; // blink
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    // grapple rope
    if (p.grappling && p.grapple) {
      ctx.strokeStyle = '#ff9ecb'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(cx, p.y + 6); ctx.lineTo(p.grapple.hx, p.grapple.hy); ctx.stroke(); ctx.lineWidth = 1;
    }
    ctx.save(); ctx.translate(cx, cy); ctx.scale(p.facing < 0 ? -1 : 1, 1);
    const run = p.onGround && Math.abs(p.vx) > 20 ? Math.sin(p.runT * 6) : 0;
    // legs
    ctx.fillStyle = '#2f7fd6';
    ctx.fillRect(-9, 8, 7, 12 + run * 3); ctx.fillRect(2, 8, 7, 12 - run * 3);
    ctx.fillStyle = '#1b5fa8'; ctx.fillRect(-11, 18 + run * 3, 9, 4); ctx.fillRect(2, 18 - run * 3, 9, 4);
    // torso (white suit)
    ctx.fillStyle = '#f2f6ff'; roundRect(ctx, -11, -10, 22, 22, 6); ctx.fill();
    ctx.strokeStyle = '#2f7fd6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke();
    // back arm
    ctx.fillStyle = '#2f7fd6'; ctx.fillRect(-12, -6, 6, 12);
    // head / worm neck
    ctx.fillStyle = '#e0a878';
    if (p.whip > 0) { // head extends forward as whip
      const ext = WHIP_RANGE * (1 - p.whip / WHIP_TIME) + 14;
      ctx.strokeStyle = '#e0a878'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(ext * .6, -16, ext, -8); ctx.stroke();
      ctx.fillStyle = '#e0a878'; ctx.beginPath(); ctx.arc(ext, -8, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#04121a'; ctx.fillRect(ext + 1, -10, 2, 2);
    } else if (p.heli) { // spinning helicopter head
      ctx.save(); ctx.translate(0, -16); ctx.rotate(Game.time * 30);
      ctx.fillStyle = '#e0a878'; ctx.fillRect(-18, -3, 36, 6); ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(224,168,120,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -16, 20, 6, 0, 0, 7); ctx.stroke();
    } else { // normal curved worm head
      ctx.strokeStyle = '#e0a878'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-2, -8); ctx.quadraticCurveTo(-8, -26, 6, -28); ctx.stroke();
      ctx.fillStyle = '#e0a878'; ctx.beginPath(); ctx.arc(7, -28, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9, -30, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#04121a'; ctx.beginPath(); ctx.arc(10, -30, 1.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#a8744a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(8, -25, 3, 0.1, 2.2); ctx.stroke();
    }
    // front arm + blaster
    ctx.fillStyle = '#2f7fd6'; ctx.fillRect(6, -4, 8, 8);
    ctx.fillStyle = '#c62828'; ctx.fillRect(12, -3, 14, 7);
    ctx.fillStyle = '#8a1c1c'; ctx.fillRect(24, -2, 4, 5);
    if (p.muzzle > 0) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(30, 0, 6, 0, 7); ctx.fill(); }
    // cling indicator
    if (p.clinging) { ctx.fillStyle = 'rgba(157,255,106,.6)'; ctx.beginPath(); ctx.arc(-12, 0, 5, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // =====================================================================
  //  DOM / UI wiring  (browser only)
  // =====================================================================
  const UI = {
    el(id) { return document.getElementById(id); },
    text(id, v) { const e = this.el(id); if (e) e.textContent = v; },
    set(id, path, v) { const e = this.el(id); if (e) { const parts = path.split('.'); let o = e; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = v; } },
    show(id) { const e = this.el(id); if (e) e.classList.remove('hidden'); },
    hide(id) { const e = this.el(id); if (e) e.classList.add('hidden'); },
    toastT: null,
    toast(msg) { const t = this.el('toast'); if (!t) return; t.textContent = msg; t.classList.remove('hidden'); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.add('hidden'), 1600); },
    hideAllScreens() { ['titleScreen', 'levelScreen', 'rosterScreen', 'howScreen', 'pauseScreen', 'winScreen', 'overScreen'].forEach(id => this.hide(id)); },
    showGame() { this.hideAllScreens(); this.show('hud'); if (matchMedia('(pointer:coarse)').matches) this.show('touch'); },
    showTitle() { this.hideAllScreens(); this.hide('hud'); this.hide('touch'); this.hide('bossBar'); this.show('titleScreen'); Game.state = 'title'; },
    showWin(i, worms, lives) {
      this.hide('touch'); this.show('winScreen');
      const last = i >= LEVELS.length - 1;
      this.text('winTitle', last ? '🏆 ИГРА ПРОЙДЕНА!' : '✅ Уровень пройден!');
      this.text('winStats', '🪱 Червячков: ' + worms + '   🧑 Жизней: ' + Math.max(0, lives));
      const nb = document.querySelector('#winScreen [data-action="next"]');
      if (nb) nb.style.display = last ? 'none' : '';
    },
    showOver(worms) { this.hide('touch'); this.show('overScreen'); this.text('overStats', '🪱 Собрано червячков: ' + worms); },
    buildLevelCards() {
      const wrap = this.el('levelCards'); if (!wrap) return; wrap.innerHTML = '';
      LEVELS.forEach((lv, i) => {
        const locked = i + 1 > Game.unlocked;
        const card = document.createElement('div');
        card.className = 'lcard' + (locked ? ' locked' : '');
        card.innerHTML = '<div class="thumb"><span class="no">' + (i + 1) + '</span><img src="' + lv.concept + '" alt=""></div>' +
          '<div class="body"><h3>' + lv.name + '</h3><p>' + lv.sub + '</p><div class="mech">' + (locked ? '🔒 Заблокировано' : lv.mech) + '</div></div>';
        if (!locked) card.addEventListener('click', () => Game.start(i));
        wrap.appendChild(card);
      });
    }
  };

  function boot() {
    Art.load();
    const canvas = UI.el('game'), ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;

    // keyboard
    addEventListener('keydown', e => {
      const codes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyZ', 'KeyJ', 'KeyX', 'KeyK', 'KeyC'];
      if (codes.includes(e.code)) { keys.add(e.code); e.preventDefault(); }
      if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
      if (e.code === 'KeyM') toggleMute();
    });
    addEventListener('keyup', e => { keys.delete(e.code); });
    addEventListener('blur', () => keys.clear());

    // touch
    document.querySelectorAll('#touch .tbtn').forEach(btn => {
      const k = btn.dataset.key;
      const on = e => { e.preventDefault(); touch[k] = 1; Audio.init(); };
      const off = e => { e.preventDefault(); touch[k] = 0; };
      btn.addEventListener('pointerdown', on); btn.addEventListener('pointerup', off);
      btn.addEventListener('pointerleave', off); btn.addEventListener('pointercancel', off);
    });

    // menu buttons
    document.body.addEventListener('click', e => {
      const b = e.target.closest('[data-action]'); if (!b) return;
      const a = b.dataset.action; Audio.init();
      if (a === 'start') Game.start(0);
      else if (a === 'levels') { UI.hideAllScreens(); UI.buildLevelCards(); UI.show('levelScreen'); Game.state = 'levels'; }
      else if (a === 'roster') { UI.hideAllScreens(); UI.show('rosterScreen'); Game.state = 'roster'; }
      else if (a === 'how') { UI.hideAllScreens(); UI.show('howScreen'); Game.state = 'how'; }
      else if (a === 'back-title') UI.showTitle();
      else if (a === 'resume') togglePause();
      else if (a === 'restart') { UI.hideAllScreens(); Game.start(Game.levelIndex); }
      else if (a === 'quit') UI.showTitle();
      else if (a === 'next') { const n = Game.levelIndex + 1; if (n < LEVELS.length) Game.start(n); else UI.showTitle(); }
    });
    UI.el('pauseBtn').addEventListener('click', togglePause);
    UI.el('muteBtn').addEventListener('click', toggleMute);

    function togglePause() {
      if (Game.state === 'playing') { Game.state = 'paused'; UI.show('pauseScreen'); }
      else if (Game.state === 'paused') { Game.state = 'playing'; UI.hide('pauseScreen'); }
    }
    function toggleMute() { Audio.muted = !Audio.muted; UI.text('muteBtn', Audio.muted ? '🔇' : '🔊'); }

    // main loop
    let last = performance.now();
    function frame(now) {
      let dt = (now - last) / 1000; last = now; dt = Math.min(dt, 1 / 30);
      Input.beginFrame();
      if (Game.state === 'playing') Game.update(dt);
      if (Game.L) render(ctx);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    UI.showTitle();
  }

  // expose for debugging / smoke tests
  W.__EWJ = {
    Game, Input, Audio, Art, BOSS_INFO, render, parseLevel, LEVELS, THEMES, keys, touch,
    constants: { TILE, VIEW_W, VIEW_H },
    step(dt, input) {
      for (const k in touch) touch[k] = (input && input[k]) ? 1 : 0;
      Input.beginFrame();
      Game.update(dt);
    }
  };

  if (HAS_DOM && !W.__EWJ_NO_BOOT) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
