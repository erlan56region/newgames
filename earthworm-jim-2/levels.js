/* =====================================================================
   Earthworm Jim 2 — prototype levels
   Tile legend:
     .  empty            #  solid ground/block      =  one-way platform
     S  slime wall (solid + Snott-cling)            ^  spikes (hazard)
     ~  lava/acid (hazard, deadly)                  o  hook anchor (grapple)
     w  worm (score)     a  ammo cell               +  health
     l  extra life       e  crow (walker enemy)     f  flyer enemy
     p  player start     g  goal/exit               b  boss spawn (kind from def.boss)
     P  Peter Puppy companion
   Coordinates are in tiles; the engine multiplies by TILE.
   ===================================================================== */
(function () {
  function grid(w, h) {
    const g = [];
    for (let y = 0; y < h; y++) g.push(new Array(w).fill('.'));
    return g;
  }
  function set(g, x, y, c) { if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c; }
  function rect(g, x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(g, i, j, c); }
  function rows(g) { return g.map(r => r.join('')); }
  function line(g, x, y, n, c) { for (let i = 0; i < n; i++) set(g, x + i, y, c); }

  /* ---------------- LEVEL 1 : Anything But Tangerines ---------------- */
  function level1() {
    const W = 78, H = 20, g = grid(W, H);
    rect(g, 0, 17, W, 3, '#');            // base ground
    // pits
    rect(g, 12, 17, 3, 3, '.');           // small jumpable pit
    rect(g, 27, 17, 7, 3, '.'); rect(g, 27, 19, 7, 1, '~');   // wide pit + lava (helicopter/hooks)
    rect(g, 45, 17, 4, 3, '.'); rect(g, 45, 19, 4, 1, '~');   // medium pit
    rect(g, 60, 17, 3, 3, '.');           // small pit
    // left wall
    rect(g, 0, 0, 1, 20, '#');
    // start + worm trail
    set(g, 3, 16, 'p');
    line(g, 5, 15, 4, 'w');
    set(g, 9, 16, 'e');                   // first crow
    // staircase blocks
    set(g, 17, 15, '#'); set(g, 19, 14, '#'); set(g, 21, 13, '#');
    set(g, 21, 12, 'w'); set(g, 23, 16, 'e');
    set(g, 15, 15, 'a');                  // ammo before wide pit
    // takeoff ledge + hooks over wide lava pit
    rect(g, 25, 14, 2, 1, '#');
    set(g, 29, 11, 'o'); set(g, 32, 11, 'o');
    line(g, 29, 9, 3, 'w');
    // landing plateau
    rect(g, 34, 15, 6, 2, '#');
    set(g, 36, 14, '+'); set(g, 38, 13, 'f');  // health + flyer
    set(g, 40, 16, 'e');
    // floating one-way platforms + extra life up high
    rect(g, 50, 12, 4, 1, '='); set(g, 51, 11, 'l');
    set(g, 50, 10, 'o');                  // hook to reach the life
    line(g, 50, 11, 3, 'w');
    set(g, 47, 16, 'e'); set(g, 55, 16, 'e');
    set(g, 53, 15, 'a');
    // spikes gauntlet
    set(g, 57, 16, '^'); set(g, 58, 16, '^');
    rect(g, 63, 15, 3, 2, '#'); set(g, 64, 14, 'w'); set(g, 66, 16, 'e');
    set(g, 69, 15, '+');
    set(g, 6, 16, 'P');                   // Peter Puppy tags along
    set(g, 70, 16, 'b');                  // Evil the Cat guards the exit
    // goal
    set(g, 74, 16, 'g');
    return {
      name: 'ANYTHING BUT TANGERINES', sub: 'Уровень 1 · разминка + Кот Зло',
      concept: 'concepts/c1.png', theme: 'tangerine', rows: rows(g), boss: 'evil',
      bossName: 'EVIL THE CAT · КОТ ЗЛО',
      mech: 'Бег · прыжок · бластер · хлыст · 🚁 вертолёт · 🪝 крюки · 👹 Кот Зло',
      hint: 'Держи ПРЫЖОК в воздухе — вертолёт замедлит падение над лавой. В конце ждёт Кот Зло.'
    };
  }

  /* ---------------- LEVEL 2 : Villi People (slime / Snott) ---------------- */
  function level2() {
    const W = 66, H = 20, g = grid(W, H);
    rect(g, 0, 17, W, 3, '#');
    rect(g, 0, 0, 1, 20, '#');
    set(g, 3, 16, 'p');
    line(g, 5, 15, 3, 'w'); set(g, 9, 16, 'e'); set(g, 11, 15, 'a');
    // acid pool (helicopter / hook)
    rect(g, 13, 17, 5, 3, '.'); rect(g, 13, 19, 5, 1, '~'); set(g, 15, 12, 'o');
    set(g, 20, 16, 'e'); set(g, 22, 15, 'w');
    // slime wall #1 -> climb up onto a raised path
    rect(g, 24, 13, 1, 4, 'S');           // 4-tall slime wall (climb + mantle)
    rect(g, 25, 13, 6, 1, '#');           // raised path on top
    line(g, 26, 12, 3, 'w'); set(g, 29, 10, 'f'); set(g, 30, 12, 'a');
    // drop down, then a pit with a hook
    rect(g, 32, 17, 4, 3, '.'); rect(g, 32, 19, 4, 1, '~'); set(g, 34, 11, 'o');
    set(g, 37, 15, '+');
    // slime wall #2 -> raised path with the extra life
    rect(g, 40, 13, 1, 4, 'S');
    rect(g, 41, 13, 6, 1, '#');
    set(g, 43, 10, 'f'); set(g, 42, 12, 'w'); set(g, 45, 11, 'l');
    // final ground stretch to the goal
    set(g, 50, 16, 'e'); line(g, 54, 15, 3, 'w'); set(g, 58, 16, 'e'); set(g, 60, 15, '+');
    rect(g, 57, 13, 6, 1, '='); set(g, 59, 12, 'a'); // platform to fight the hovering boss
    set(g, 60, 9, 'b');                   // Major Mucus hovers over the final stretch
    set(g, 63, 16, 'g');
    return {
      name: 'VILLI PEOPLE', sub: 'Уровень 2 · слизь, Снотт и Майор Слизь',
      concept: 'concepts/c3.png', theme: 'slime', rows: rows(g), boss: 'mucus',
      bossName: 'MAJOR MUCUS · МАЙОР СЛИЗЬ',
      mech: '🟢 Снотт-прилипание · подъём по стенам · 🪝 крюки · парашют · 👹 Майор Слизь',
      hint: 'У зелёной стены держи ВПЕРЁД чтобы прилипнуть, затем ВВЕРХ — Снотт вытащит наверх. Майор Слизь плюётся кислотой сверху.'
    };
  }

  /* ---------------- LEVEL 3 : See Jim Run — PSY-CROW boss ---------------- */
  function level3() {
    const W = 40, H = 18, g = grid(W, H);
    rect(g, 0, 15, W, 3, '#');
    rect(g, 0, 0, 1, 18, '#'); rect(g, W - 1, 0, 1, 18, '#');  // arena walls
    // side platforms for dodging
    rect(g, 5, 11, 5, 1, '='); rect(g, 30, 11, 5, 1, '=');
    rect(g, 17, 9, 6, 1, '=');
    set(g, 7, 10, 'a'); set(g, 32, 10, 'a'); set(g, 19, 8, '+');
    set(g, 3, 14, 'p');
    set(g, 20, 5, 'b');                   // boss spawn
    set(g, 36, 14, 'g');                  // exit (activates after boss)
    return {
      name: 'SEE JIM RUN — PSY-CROW', sub: 'Уровень 3 · босс',
      concept: 'concepts/c4.png', theme: 'space', rows: rows(g), boss: 'psy',
      bossName: 'PSY-CROW · ПСАЙ-ВОРОН',
      mech: '👹 Босс Псай-Ворон · уклонение · мега-плазма',
      hint: 'Уклоняйся от пикирования и стрельбы. Держи Бластер для МЕГА-плазмы!'
    };
  }

  /* ---------------- LEVEL 4 : La Planeta de Agua — BOB ---------------- */
  function level4() {
    const W = 42, H = 18, g = grid(W, H);
    rect(g, 0, 15, W, 3, '#');
    rect(g, 0, 0, 1, 18, '#'); rect(g, W - 1, 0, 1, 18, '#');
    rect(g, 6, 11, 5, 1, '='); rect(g, 31, 11, 5, 1, '=');
    rect(g, 18, 8, 6, 1, '=');
    set(g, 8, 10, 'a'); set(g, 33, 10, 'a'); set(g, 20, 7, '+');
    set(g, 3, 14, 'p');
    set(g, 22, 14, 'b');                  // Bob shuffles across the aquarium floor
    set(g, 38, 14, 'g');
    return {
      name: 'LA PLANETA DE AGUA — BOB', sub: 'Уровень 4 · Боб-убийца',
      concept: 'concepts/c2.png', theme: 'water', rows: rows(g), boss: 'bob',
      bossName: 'BOB THE KILLER GOLDFISH · БОБ',
      mech: '👹 Боб в робо-аквариуме · пузыри-снаряды · мега-плазма',
      hint: 'Боб мал, но его аквариум стреляет веером пузырей. Прыгай на платформы и бей мега-плазмой.'
    };
  }

  /* ---------------- LEVEL 5 : Insectika — QUEEN ---------------- */
  function level5() {
    const W = 46, H = 18, g = grid(W, H);
    rect(g, 0, 15, W, 3, '#');
    rect(g, 0, 0, 1, 18, '#'); rect(g, W - 1, 0, 1, 18, '#');
    rect(g, 5, 11, 5, 1, '='); rect(g, 36, 11, 5, 1, '=');
    rect(g, 14, 9, 5, 1, '='); rect(g, 27, 9, 5, 1, '=');
    set(g, 7, 10, 'a'); set(g, 38, 10, 'a'); set(g, 16, 8, '+'); set(g, 29, 8, 'l');
    set(g, 3, 14, 'p');
    set(g, 26, 14, 'b');                  // Queen Slug-for-a-Butt
    set(g, 42, 14, 'g');
    return {
      name: 'INSECTIKA — QUEEN', sub: 'Уровень 5 · Королева Слизней',
      concept: 'concepts/cover.jpg', theme: 'hive', rows: rows(g), boss: 'queen',
      bossName: 'QUEEN SLUG-FOR-A-BUTT · КОРОЛЕВА',
      mech: '👹 Финальный босс · кислотные веера · призыв воронов · ударная волна',
      hint: 'Королева плюётся кислотой, зовёт воронов и бьёт волной по полу. Держи дистанцию и заряжай мега-плазму.'
    };
  }

  /* ---------------- THEMES ---------------- */
  const THEMES = {
    tangerine: { skyTop: '#ff9e3d', skyBot: '#7ec850', hill1: '#e07b2e', hill2: '#5fae3f',
      ground: '#6b4a2b', groundTop: '#8dff5a', block: '#7a5230', slime: '#8dff5a',
      hazard: '#ff5e3a', accent: '#ffd23f', star: false },
    slime: { skyTop: '#0b3b2e', skyBot: '#125e3a', hill1: '#0e4a34', hill2: '#1c7a4a',
      ground: '#3a2b5a', groundTop: '#8dff5a', block: '#46356b', slime: '#9dff6a',
      hazard: '#c6ff3d', accent: '#b388ff', star: false },
    space: { skyTop: '#0a0a2a', skyBot: '#241a4a', hill1: '#1a1440', hill2: '#2a1f5a',
      ground: '#2b3550', groundTop: '#4cc9f0', block: '#34406a', slime: '#8dff5a',
      hazard: '#ff2d55', accent: '#ff5e3a', star: true },
    water: { skyTop: '#032a4a', skyBot: '#0a5a8a', hill1: '#063a5e', hill2: '#0d6a9a',
      ground: '#2a4a5a', groundTop: '#4cc9f0', block: '#3a5a6a', slime: '#8dff5a',
      hazard: '#ff2d55', accent: '#ffd23f', star: false },
    hive: { skyTop: '#2a0a3a', skyBot: '#5a1a5a', hill1: '#3a104a', hill2: '#6a2a6a',
      ground: '#4a2a3a', groundTop: '#ff8a5c', block: '#5a3a4a', slime: '#c6ff3d',
      hazard: '#c6ff3d', accent: '#ffd23f', star: false }
  };

  window.LEVELS = [level1(), level2(), level3(), level4(), level5()];
  window.THEMES = THEMES;
})();
