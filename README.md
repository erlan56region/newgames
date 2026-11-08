# newgames — каталог open-source игр

Каталог свободных игр и открытых ремейков, собранный из списка
[bobeff/open-source-games](https://github.com/bobeff/open-source-games) (CC0-1.0)
и превращённый в структурированные данные + браузер по каталогу.

**161 запись · 17 жанров · поиск, фильтр по жанру, случайная игра, карточка с деталями.**

## Что внутри

```
index.html            каталог (статика, без сборки и зависимостей)
assets/styles.css     оформление
assets/app.js         поиск, фильтры, карточки, диалог деталей
data/games.json       структурированный каталог (генерируется)
data/upstream/        копия исходного списка и его лицензии (CC0-1.0)
scripts/parse_list.py парсер upstream-списка -> data/games.json
scripts/serve.sh      локальный сервер
```

## Запуск

```bash
./scripts/serve.sh          # http://localhost:8080
```

или вручную:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Открывать нужно через http (файл `index.html` не подтянет JSON из `file://`).

## Обновление каталога

```bash
./scripts/update-upstream.sh   # скачать свежий список и пересобрать data/games.json
```

Парсер рассчитан на особенности исходного markdown: вложенные пункты (порты
внутри группы, например Chocolate Doom у Doom), заголовки `###`/`####` как
подкатегории, метки `**Engine: …**`, `**Supported games:**` и варианты сборки
(`**Original:**`, `**Godot port:**`).

## Формат `data/games.json`

```json
{
  "id": "chocolate-doom",
  "name": "Chocolate Doom",
  "category": "First-Person games",
  "category_slug": "first-person-games",
  "subcategory": "id Software Games / Source Ports and Re-Implementations",
  "parent": "Doom",
  "site": "https://www.chocolate-doom.org",
  "source": "https://github.com/chocolate-doom/chocolate-doom",
  "description": "A Doom source port …",
  "description_html": "A Doom source port … <a href=…>…</a>",
  "engines": [{ "name": "Bevy", "url": "https://bevy.org/" }],
  "supported": [{ "name": "Baldur’s Gate", "url": "https://…" }],
  "variants": [{ "label": "Original", "source": "https://…", "engines": [] }]
}
```

Помимо `games` и `categories`, в файле есть массив `resources` — смежные
каталоги из раздела «Other lists» исходного списка (awesome-подборки,
osgameclones, Libre Game Wiki и т. п.). Они показываются отдельным блоком
под сеткой.

## Лицензии

Список-источник распространяется по CC0-1.0 (`data/upstream/LICENSE`).
Код каталога (`index.html`, `assets/`, `scripts/`) — MIT.
Игры и движки принадлежат их авторам, у каждого проекта своя лицензия —
смотрите репозиторий по ссылке «Исходники».
