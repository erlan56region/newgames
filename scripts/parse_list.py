#!/usr/bin/env python3
"""Parse the upstream README of bobeff/open-source-games into data/games.json.

Usage:
    python3 scripts/parse_list.py [path/to/README.md]

The upstream list is a hand-written markdown file, so the parser handles the
shapes that actually occur there:

    ## Category
    ### *Group heading*
    #### *Sub-group heading*
    - **[Name](https://site)** - Description. [[source]](https://github.com/x/y)
    - **Name** - Description. **Engine: [Foo](https://foo)** [[source]](...)
    - **[Group](https://wiki)**            <- header without description
      - **Child** - ... [[source]](...)
    - **[Game](https://site)** - Description.
      **Supported games:**
      - [Some retail game](https://wiki)   <- not a free game, kept as metadata

Inline links inside descriptions (mostly Wikipedia references) are kept as HTML
so the frontend does not need a markdown renderer.
"""

from __future__ import annotations

import html
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT / "data" / "upstream" / "README.md"
OUTPUT = ROOT / "data" / "games.json"

# Link with one level of balanced parentheses in the URL (Wikipedia style).
LINK_RE = re.compile(r"\[([^\]]*)\]\(((?:[^()\s]|\([^()]*\))+)\)")
BULLET_RE = re.compile(r"^(?P<indent>[ \t]*)[-*]\s+(?P<body>.+)$")
HEADING_RE = re.compile(r"^(?P<level>#{2,6})\s+(?P<title>.+?)\s*$")
BOLD_START_RE = re.compile(r"^\*\*(?P<inner>.+?)\*\*")
SOURCE_RE = re.compile(r"\[\[source\]\]\((?P<url>[^()\s]*(?:\([^()]*\))?[^()\s]*)\)")
ENGINE_RE = re.compile(r"\*\*Engine:\s*(?P<engine>.+?)\*\*")
LABEL_RE = re.compile(r"^\*\*(?P<label>[A-Za-z][A-Za-z /-]{1,40}:)\*\*")
SUPPORTED_RE = re.compile(r"\*\*Supported games:\*\*")
EMPHASIS_RE = re.compile(r"(?<!\*)\*{1,2}(?!\*)")
WS_RE = re.compile(r"\s+")


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "entry"


def plain(markdown: str) -> str:
    """Markdown -> readable plain text (links keep their label)."""
    text = LINK_RE.sub(lambda m: m.group(1), markdown)
    text = text.replace("**", "").replace("[[source]]", "")
    return WS_RE.sub(" ", text).strip()


def to_html(markdown: str) -> str:
    """Escape text but turn inline markdown links into anchors."""
    anchors: list[str] = []

    def stash(match: re.Match) -> str:
        label = html.escape(plain(match.group(1)))
        url = html.escape(match.group(2), quote=True)
        anchors.append(
            f'<a href="{url}" target="_blank" rel="noopener noreferrer">{label}</a>'
            if label
            else ""
        )
        return f"\u0000{len(anchors) - 1}\u0000"

    text = LINK_RE.sub(stash, markdown)
    text = html.escape(WS_RE.sub(" ", text.replace("[[source]]", "")).strip())
    return re.sub(r"\u0000(\d+)\u0000", lambda m: anchors[int(m.group(1))], text)


def split_name(body: str) -> tuple[str, str | None, str]:
    """Return (name, site, remainder) for a bullet body."""
    bold = BOLD_START_RE.match(body)
    if bold:
        inner, rest = bold.group("inner"), body[bold.end() :]
    else:
        inner, rest = "", body

    if not inner:
        link = LINK_RE.match(body)
        if link:
            return plain(link.group(1)), link.group(2), body[link.end() :].strip()
        return "", None, body

    site = None
    link = LINK_RE.search(inner)
    if link:
        site = link.group(2)
    name = plain(inner)
    return name, site, rest.strip()


def parse_bullet(body: str) -> dict:
    name, site, rest = split_name(body)

    engines: list[dict] = []
    for match in ENGINE_RE.finditer(rest):
        engine_text = match.group("engine")
        engine_link = LINK_RE.search(engine_text)
        engines.append(
            {
                "name": plain(engine_text),
                "url": engine_link.group(2) if engine_link else None,
            }
        )
    rest = ENGINE_RE.sub(" ", rest)

    source = None
    sources = SOURCE_RE.findall(rest)
    if sources:
        source = sources[0]
    rest = SOURCE_RE.sub(" ", rest)

    label = None
    label_match = LABEL_RE.match(rest.strip())
    if label_match and (source or engines):
        label = label_match.group("label").rstrip(":").strip()
        rest = rest.strip()[label_match.end() :]

    supported_marker = bool(SUPPORTED_RE.search(rest))
    rest = SUPPORTED_RE.sub(" ", rest)
    rest = rest.lstrip(" -–—:").strip()

    return {
        "name": name,
        "site": site,
        "source": source,
        "description": plain(rest),
        "description_html": to_html(rest),
        "engines": engines,
        "label": label,
        "has_supported": supported_marker,
        "empty": not (plain(rest) or source or engines),
    }


def parse(text: str) -> dict:
    categories: list[dict] = []
    games: list[dict] = []
    supported_links: list[dict] = []

    category: dict | None = None
    groups: dict[int, str] = {}
    resources: list[dict] = []
    last: dict | None = None  # last level-0 entry (game or header)
    pending_supported_for: dict | None = None
    buffer: dict | None = None  # bullet being accumulated across wrapped lines

    def flush() -> None:
        nonlocal buffer
        if buffer is None:
            return
        entry = buffer
        buffer = None
        handle(entry)

    def handle(entry: dict) -> None:
        nonlocal last, pending_supported_for
        if category is None:
            return
        data = parse_bullet(entry["body"])
        indent = entry["indent"]
        subcategory = " / ".join(groups[i] for i in sorted(groups)) or None

        if SUPPORTED_RE.search(entry["body"]):
            pending_supported_for = last

        if category.get("meta") if category else False:
            if indent == 0 and data["name"] and data["site"]:
                resources.append({"name": data["name"], "url": data["site"]})
            return

        if indent == 0:
            last = None
            if data["empty"] and not data["site"]:
                return
            if data["empty"]:
                # Header such as "**[Doom](wiki)**": holds children, is not a game.
                last = {"kind": "header", "data": data, "children": []}
                return
            game = make_game(data, category, subcategory)
            games.append(game)
            last = {"kind": "game", "game": game, "children": []}
            pending_supported_for = game if data["has_supported"] else None
            return

        # Indented bullet: belongs to `last` (header or game).
        if last is None:
            game = make_game(data, category, subcategory)
            games.append(game)
            return

        if data["empty"] and data["site"] and not data["source"]:
            if pending_supported_for is not None:
                pending_supported_for.setdefault("supported", []).append(
                    {"name": data["name"], "url": data["site"]}
                )
            return

        if last["kind"] == "header":
            game = make_game(data, category, subcategory, parent=last["data"]["name"])
            games.append(game)
            last["children"].append(game)
            return

        parent = last["game"]
        if data["label"] or data["name"].endswith(":"):
            parent.setdefault("variants", []).append(
                {
                    "label": (data["label"] or data["name"]).rstrip(":").strip(),
                    "source": data["source"],
                    "engines": data["engines"],
                }
            )
            return
        parent.setdefault("supported", []).append(
            {"name": data["name"], "url": data["site"], "source": data["source"]}
        )

    for raw_line in text.splitlines():
        line = raw_line.rstrip()

        heading = HEADING_RE.match(line)
        if heading:
            flush()
            level = len(heading.group("level"))
            title = plain(heading.group("title")).strip("*_ ").strip()
            if level == 2:
                groups.clear()
                last = None
                pending_supported_for = None
                if title.lower() in {"table of contents", "contents"}:
                    category = None
                else:
                    category = {
                        "name": title,
                        "slug": slugify(title),
                        "games": [],
                        "meta": title.lower() == "other lists",
                    }
                    categories.append(category)
            else:
                for deeper in [k for k in groups if k >= level]:
                    del groups[deeper]
                groups[level] = title
            continue

        bullet = BULLET_RE.match(line)
        if bullet:
            flush()
            buffer = {
                "indent": len(bullet.group("indent").expandtabs(2)) // 2,
                "body": bullet.group("body").strip(),
            }
            continue

        if not line.strip():
            flush()
            continue

        if buffer is not None and not line.startswith("#"):
            # Continuation of a bullet wrapped over several lines.
            buffer["body"] += " " + line.strip()
        else:
            flush()

    flush()

    # Unique, stable ids across the whole catalogue.
    seen: dict[str, int] = {}
    for game in games:
        base = game["id"]
        count = seen.get(base, 0)
        seen[base] = count + 1
        if count:
            game["id"] = f"{base}-{count + 1}"

    by_slug = {c["slug"]: c for c in categories}
    for game in games:
        by_slug[game["category_slug"]]["games"].append(game["id"])

    categories = [c for c in categories if c["games"]]
    for category in categories:
        category["count"] = len(category["games"])

    return {
        "resources": resources,
        "upstream": {
            "name": "bobeff/open-source-games",
            "url": "https://github.com/bobeff/open-source-games",
            "license": "CC0-1.0",
            "synced": "2026-02-25",
        },
        "total": len(games),
        "categories": categories,
        "games": games,
    }


def make_game(data: dict, category: dict, subcategory: str | None, parent: str | None = None) -> dict:
    return {
        "id": slugify(data["name"]) if data["name"] else slugify(data["source"] or "entry"),
        "name": data["name"],
        "category": category["name"],
        "category_slug": category["slug"],
        "subcategory": subcategory,
        "parent": parent,
        "site": data["site"],
        "source": data["source"],
        "description": data["description"],
        "description_html": data["description_html"],
        "engines": data["engines"],
        "supported": [],
        "variants": [],
    }


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        print(f"error: source list not found: {source}", file=sys.stderr)
        return 1

    data = parse(source.read_text(encoding="utf-8"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {OUTPUT.relative_to(ROOT)}: "
        f"{data['total']} entries in {len(data['categories'])} categories"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
