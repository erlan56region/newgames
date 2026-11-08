/* Open Source Games catalogue — vanilla JS, no build step. */
(() => {
  "use strict";

  const state = {
    games: [],
    categories: [],
    query: "",
    category: "all",
    onlySource: false,
    visible: [],
  };

  const els = {
    grid: document.getElementById("grid"),
    chips: document.getElementById("chips"),
    search: document.getElementById("search"),
    onlySource: document.getElementById("only-source"),
    random: document.getElementById("random"),
    reset: document.getElementById("reset"),
    count: document.getElementById("result-count"),
    empty: document.getElementById("empty"),
    dialog: document.getElementById("detail"),
    detailBody: document.getElementById("detail-body"),
    detailClose: document.getElementById("detail-close"),
    statGames: document.getElementById("stat-games"),
    statCats: document.getElementById("stat-cats"),
    statSrc: document.getElementById("stat-src"),
    resources: document.getElementById("resources"),
    resourcesLinks: document.getElementById("resources-links"),
  };

  const ICON_SITE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-2.6a15.6 15.6 0 0 0-1.2-3.4A8 8 0 0 1 18.9 8ZM12 4.1c.6.9 1.1 2.2 1.5 3.9h-3c.4-1.7.9-3 1.5-3.9ZM4.3 14a8 8 0 0 1 0-4h3a20 20 0 0 0 0 4h-3Zm.8 2h2.6c.3 1.3.7 2.4 1.2 3.4A8 8 0 0 1 5.1 16Zm2.6-8H5.1a8 8 0 0 1 3.8-3.4A15.6 15.6 0 0 0 7.7 8ZM12 19.9c-.6-.9-1.1-2.2-1.5-3.9h3c-.4 1.7-.9 3-1.5 3.9ZM13.8 14h-3.6a17.6 17.6 0 0 1 0-4h3.6a17.6 17.6 0 0 1 0 4Zm.5 5.4c.5-1 .9-2.1 1.2-3.4h2.6a8 8 0 0 1-3.8 3.4Zm1.6-5.4a20 20 0 0 0 0-4h3a8 8 0 0 1 0 4h-3Z"/></svg>';
  const ICON_CODE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 16.6 4 12l4.6-4.6L7.2 6 1.2 12l6 6 1.4-1.4Zm6.8 0L20 12l-4.6-4.6L16.8 6l6 6-6 6-1.4-1.4ZM13.9 3.5l-3.8 17-1.9-.4 3.8-17 1.9.4Z"/></svg>';
  const ICON_WIKI =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h3.2c1.6 3.4 2.6 5.8 3.2 7.2.6-1.5 1.6-3.9 3.1-7.2H17c-1.9 4.3-4 8.8-6.4 13.5h-1.4C7.2 13.9 5.4 9.5 4 5Z"/></svg>';

  const norm = (s) => (s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function isWiki(url) {
    return /wikipedia\.org|wiki/i.test(url || "");
  }

  function bestSource(game) {
    if (game.source) return game.source;
    const variant = (game.variants || []).find((v) => v.source);
    return variant ? variant.source : null;
  }

  function searchable(game) {
    if (game._haystack) return game._haystack;
    game._haystack = norm(
      [
        game.name,
        game.category,
        game.subcategory,
        game.parent,
        game.description,
        (game.engines || []).map((e) => e.name).join(" "),
        (game.supported || []).map((s) => s.name).join(" "),
        (game.variants || []).map((v) => v.label).join(" "),
        game.site,
        game.source,
      ].join(" ")
    );
    return game._haystack;
  }

  function matches(game) {
    if (state.category !== "all" && game.category_slug !== state.category) return false;
    if (state.onlySource && !bestSource(game)) return false;
    if (!state.query) return true;
    const terms = norm(state.query).split(" ").filter(Boolean);
    const hay = searchable(game);
    return terms.every((t) => hay.includes(t));
  }

  function renderChips() {
    const total = state.games.length;
    const all = `<button class="chip" data-cat="all" aria-pressed="${state.category === "all"}">Все <span>${total}</span></button>`;
    const rest = state.categories
      .map(
        (c) =>
          `<button class="chip" data-cat="${c.slug}" aria-pressed="${state.category === c.slug}">${escapeHtml(
            c.name
          )} <span>${c.count}</span></button>`
      )
      .join("");
    els.chips.innerHTML = all + rest;
  }

  function cardHtml(game, index) {
    const src = bestSource(game);
    const siteIsWiki = isWiki(game.site);
    const tags = [`<span class="tag tag--cat">${escapeHtml(game.category)}</span>`];
    if (game.parent) tags.push(`<span class="tag tag--parent">порт для ${escapeHtml(game.parent)}</span>`);
    (game.engines || []).forEach((e) => tags.push(`<span class="tag tag--engine">${escapeHtml(e.name)}</span>`));
    if (game.variants && game.variants.length) {
      tags.push(`<span class="tag">${game.variants.length} варианта сборки</span>`);
    }

    const desc = game.description_html
      ? `<p class="card__desc">${game.description_html}</p>`
      : `<p class="card__desc" style="color:var(--muted)">Описание в исходном списке отсутствует.</p>`;

    const links = [];
    if (game.site) {
      links.push(
        `<a class="link-pill" href="${escapeHtml(game.site)}" target="_blank" rel="noopener noreferrer">${
          siteIsWiki ? ICON_WIKI : ICON_SITE
        } ${siteIsWiki ? "Статья" : "Сайт"}</a>`
      );
    }
    if (src) {
      links.push(
        `<a class="link-pill link-pill--primary" href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer">${ICON_CODE} Исходники</a>`
      );
    }
    if (!links.length) links.push(`<span class="link-pill link-pill--muted">Ссылок нет</span>`);

    return `<article class="card" data-id="${game.id}" style="animation-delay:${Math.min(index, 24) * 8}ms">
      <div class="card__head">
        <h2 class="card__title"><button type="button" data-detail="${game.id}">${escapeHtml(game.name)}</button></h2>
      </div>
      <div class="tags">${tags.join("")}</div>
      ${desc}
      <div class="card__links">${links.join("")}</div>
    </article>`;
  }

  function render() {
    const visible = state.games.filter(matches);
    state.visible = visible;
    els.grid.innerHTML = visible.map(cardHtml).join("");

    const total = state.games.length;
    const filtered = state.query || state.category !== "all" || state.onlySource;
    els.count.textContent = filtered
      ? `Найдено ${visible.length} из ${total}`
      : `${total} игр и движков в каталоге`;
    els.reset.hidden = !filtered;
    els.empty.hidden = visible.length !== 0;
    els.grid.hidden = visible.length === 0;

    // keep the active chip in view on narrow screens
    const active = els.chips.querySelector('[aria-pressed="true"]');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function renderResources(resources) {
    if (!resources || !resources.length) return;
    els.resourcesLinks.innerHTML = resources
      .map(
        (r) =>
          `<a class="link-pill" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.name)}</a>`
      )
      .join("");
    els.resources.hidden = false;
  }

  function updateStats() {
    els.statGames.textContent = state.games.length;
    els.statCats.textContent = state.categories.length;
    els.statSrc.textContent = state.games.filter((g) => bestSource(g)).length;
  }

  function openDetail(id) {
    const game = state.games.find((g) => g.id === id);
    if (!game) return;
    const src = bestSource(game);
    const rows = [];
    rows.push(`<li><strong>Жанр:</strong> ${escapeHtml(game.category)}${game.subcategory ? " · " + escapeHtml(game.subcategory) : ""}</li>`);
    if (game.parent) rows.push(`<li><strong>Относится к:</strong> ${escapeHtml(game.parent)}</li>`);
    if (game.site) {
      rows.push(`<li><strong>Сайт:</strong> <a href="${escapeHtml(game.site)}" target="_blank" rel="noopener noreferrer">${escapeHtml(game.site)}</a></li>`);
    }
    if (game.source) {
      rows.push(`<li><strong>Исходный код:</strong> <a href="${escapeHtml(game.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(game.source)}</a></li>`);
    }
    (game.engines || []).forEach((e) => {
      rows.push(
        `<li><strong>Движок:</strong> ${
          e.url ? `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.name)}</a>` : escapeHtml(e.name)
        }</li>`
      );
    });

    const variants = (game.variants || []).length
      ? `<div class="detail__section"><h3>Варианты сборки</h3><ul class="detail__list">${game.variants
          .map(
            (v) =>
              `<li><strong>${escapeHtml(v.label)}</strong>${
                v.engines && v.engines.length ? " · движок " + escapeHtml(v.engines.map((e) => e.name).join(", ")) : ""
              }${v.source ? ` · <a href="${escapeHtml(v.source)}" target="_blank" rel="noopener noreferrer">исходники</a>` : ""}</li>`
          )
          .join("")}</ul></div>`
      : "";

    const supported = (game.supported || []).length
      ? `<div class="detail__section"><h3>Поддерживаемые игры</h3><ul class="detail__list">${game.supported
          .map(
            (s) =>
              `<li>${
                s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a>` : escapeHtml(s.name)
              }</li>`
          )
          .join("")}</ul></div>`
      : "";

    els.detailBody.innerHTML = `
      <h2>${escapeHtml(game.name)}</h2>
      ${game.description_html ? `<p class="card__desc">${game.description_html}</p>` : ""}
      <ul class="detail__list">${rows.join("")}</ul>
      ${variants}
      ${supported}
      <div class="card__links">
        ${game.site ? `<a class="link-pill" href="${escapeHtml(game.site)}" target="_blank" rel="noopener noreferrer">${ICON_SITE} Открыть сайт</a>` : ""}
        ${src ? `<a class="link-pill link-pill--primary" href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer">${ICON_CODE} Исходный код</a>` : ""}
      </div>`;

    if (typeof els.dialog.showModal === "function") els.dialog.showModal();
    else els.dialog.setAttribute("open", "");
  }

  function highlight(id) {
    const card = Array.from(els.grid.querySelectorAll(".card")).find((c) => c.dataset.id === id);
    if (!card) return;
    card.classList.add("card--highlight");
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => card.classList.remove("card--highlight"), 2200);
  }

  // ---------- events ----------

  els.search.addEventListener("input", () => {
    state.query = els.search.value.trim();
    render();
  });

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      els.search.focus();
      els.search.select();
    }
    if (e.key === "Escape" && document.activeElement === els.search && els.search.value) {
      els.search.value = "";
      state.query = "";
      render();
    }
  });

  els.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.category = chip.dataset.cat;
    renderChips();
    render();
  });

  els.onlySource.addEventListener("change", () => {
    state.onlySource = els.onlySource.checked;
    render();
  });

  els.random.addEventListener("click", () => {
    const pool = state.visible.length ? state.visible : state.games;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (state.category !== "all" && pick.category_slug !== state.category) {
      state.category = "all";
      renderChips();
      render();
    }
    highlight(pick.id);
    openDetail(pick.id);
  });

  const resetAll = () => {
    state.query = "";
    state.category = "all";
    state.onlySource = false;
    els.search.value = "";
    els.onlySource.checked = false;
    renderChips();
    render();
  };

  els.reset.addEventListener("click", resetAll);
  els.empty.addEventListener("click", (e) => {
    if (e.target.dataset.action === "reset") resetAll();
  });

  els.grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-detail]");
    if (btn) openDetail(btn.dataset.detail);
  });

  els.detailClose.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", (e) => {
    if (e.target === els.dialog) els.dialog.close();
  });

  // ---------- boot ----------

  fetch("data/games.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      state.games = data.games;
      state.categories = data.categories;
      updateStats();
      renderChips();
      render();
      renderResources(data.resources);
    })
    .catch((err) => {
      els.count.textContent = "Не удалось загрузить data/games.json";
      els.empty.hidden = false;
      els.empty.innerHTML = `Данные каталога не загрузились (${escapeHtml(
        err.message
      )}). Запустите локальный сервер: <code>python3 -m http.server 8080</code> и откройте <code>http://localhost:8080</code>.`;
    });
})();
