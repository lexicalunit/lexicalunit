#!/usr/bin/env python3
"""Local authoring server for the lists at /lists.

Serves the repository exactly like `python3 -m http.server` does, and adds a
localhost-only JSON API under /api that can search metadata providers for
artwork, resize it the same way www/img/*/fix.sh does, and edit the
lists/<type>/data.json files in place.

Nothing here is ever deployed: publish.sh rsyncs static files only, and the
admin UI in lists/admin.js refuses to build itself unless /api/config answers.

Usage:
    python3 tools/studio.py [--port 8000]

API keys, if any, live in ~/.config/lexicalunit/studio.json:
    {"tmdb_api_key": "...", "rawg_api_key": "..."}
"""

import argparse
import functools
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LISTS = REPO / "lists"
IMAGES = REPO / "www" / "img"
CONFIG_PATH = Path.home() / ".config" / "lexicalunit" / "studio.json"
TRASH = Path.home() / ".Trash"

# Matches the resize in www/img/*/fix.sh: 300px wide, aspect preserved. The
# extra -strip is not in fix.sh but is needed here: ImageMagick 6 fails to
# write the output at all, silently and with no diagnostic, when the source
# carries a malformed Exif segment, which plenty of provider artwork does.
RESIZE_GEOMETRY = "300x"
MAX_IMAGE_BYTES = 15 * 1024 * 1024
USER_AGENT = "lexicalunit-studio/1.0 (+https://lexicalunit.com)"
NETWORK_TIMEOUT = 20


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------- data files


def list_types():
    """Every list is a lists/<type>/data.json, so adding books needs no code."""
    return sorted(p.parent.name for p in LISTS.glob("*/data.json"))


def data_path(type_):
    if type_ not in list_types():
        raise ApiError(HTTPStatus.NOT_FOUND, f"unknown list type: {type_}")
    return LISTS / type_ / "data.json"


def read_data(type_):
    return json.loads(data_path(type_).read_text(encoding="utf-8"))


def write_data(type_, data):
    """Write data.json byte-compatibly with how the files are formatted today.

    2-space indent, alphabetically sorted keys, literal UTF-8, trailing
    newline, and items kept sorted ascending by year (stable, so entries from
    the same year hold their insertion order).
    """
    data["items"] = sorted(data["items"], key=lambda item: item["year"])
    text = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    path = data_path(type_)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def image_dir(type_):
    path = IMAGES / type_
    if not path.is_dir():
        raise ApiError(HTTPStatus.NOT_FOUND, f"no image directory for {type_}")
    return path


def hero_name(slug):
    return f"hero-{slug}.jpg"


def item_slug(item):
    """An item's identity in the API.

    Normally that is the slug inside its hero image name, but an item may have
    no image yet (hero ""), and those are addressed by their slugified title
    until one is installed.
    """
    match = re.fullmatch(r"hero-(.+)\.jpg", item.get("hero") or "")
    return match.group(1) if match else slugify(item.get("title") or "")


def find_item(data, slug):
    for item in data["items"]:
        if item_slug(item) == slug:
            return item
    return None


def slugify(title):
    text = unicodedata.normalize("NFKD", title)
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def check_slug(slug):
    if not slug or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug):
        raise ApiError(
            HTTPStatus.BAD_REQUEST,
            "slug must be lowercase letters, digits and dashes",
        )
    return slug


# ------------------------------------------------------------------- images


def fetch_image(url):
    """Download an image to a temp file, refusing anything that isn't one."""
    if not urllib.parse.urlparse(url).scheme in ("http", "https"):
        raise ApiError(HTTPStatus.BAD_REQUEST, "image URL must be http(s)")

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=NETWORK_TIMEOUT) as response:
            content_type = response.headers.get("Content-Type", "")
            if not content_type.startswith("image/"):
                raise ApiError(
                    HTTPStatus.BAD_REQUEST,
                    f"that URL is {content_type or 'untyped'}, not an image",
                )
            body = response.read(MAX_IMAGE_BYTES + 1)
    except urllib.error.URLError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"could not fetch image: {error}")

    if len(body) > MAX_IMAGE_BYTES:
        raise ApiError(HTTPStatus.BAD_REQUEST, "image is larger than 15 MB")

    handle, path = tempfile.mkstemp(prefix="studio-src-")
    with os.fdopen(handle, "wb") as file:
        file.write(body)
    return Path(path)


def install_image(url, type_, slug):
    """Fetch, resize, and place www/img/<type>/hero-<slug>.jpg atomically."""
    source = fetch_image(url)
    resized = Path(tempfile.mkdtemp(prefix="studio-out-")) / hero_name(slug)
    try:
        result = subprocess.run(
            ["convert", str(source), "-strip", "-resize", RESIZE_GEOMETRY, str(resized)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not resized.exists():
            detail = (result.stderr or result.stdout).strip()
            raise ApiError(
                HTTPStatus.BAD_GATEWAY,
                f"convert exited {result.returncode}: {detail or 'no diagnostic'}",
            )
        destination = image_dir(type_) / hero_name(slug)
        os.replace(resized, destination)
        destination.chmod(0o644)
        return destination
    finally:
        source.unlink(missing_ok=True)
        shutil.rmtree(resized.parent, ignore_errors=True)


def trash(path):
    if not path.exists():
        return
    target = TRASH / path.name
    index = 1
    while target.exists():
        target = TRASH / f"{path.stem}-{index}{path.suffix}"
        index += 1
    shutil.move(str(path), str(target))


# ---------------------------------------------------------------- providers


def load_config():
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ApiError(HTTPStatus.INTERNAL_SERVER_ERROR, f"{CONFIG_PATH}: {error}")


class ProviderSkipped(ApiError):
    """A provider that cannot run right now but should not fail the search."""


def has_key(config, name):
    """Placeholders left in the config file do not count as configured."""
    key = str(config.get(name) or "").strip()
    return bool(key) and key not in ("...", "TODO", "xxx") and len(key) >= 8


def require_key(config, name, provider):
    if not has_key(config, name):
        raise ProviderSkipped(
            HTTPStatus.BAD_REQUEST, f"{provider} skipped: no API key configured"
        )
    return config[name]


def get_json(url, data=None, headers=None):
    request = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=NETWORK_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"provider returned {error.code}: {detail}")
    except urllib.error.URLError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"provider unreachable: {error}")


def candidate(title, year, images, source, author=None):
    images = [url for url in images if url]
    if not title or not images:
        return None
    result = {"title": title, "year": year, "images": images, "source": source}
    if author:
        result["author"] = author
    return result


def search_anime(query, config):
    """AniList. No API key required."""
    graphql = """
    query ($q: String) {
      Page(perPage: 12) {
        media(search: $q, type: ANIME, sort: SEARCH_MATCH) {
          title { romaji english }
          startDate { year }
          coverImage { extraLarge large }
          bannerImage
        }
      }
    }
    """
    body = json.dumps({"query": graphql, "variables": {"q": query}}).encode("utf-8")
    payload = get_json(
        "https://graphql.anilist.co",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    results = []
    for media in payload.get("data", {}).get("Page", {}).get("media", []):
        titles = media.get("title") or {}
        cover = media.get("coverImage") or {}
        results.append(
            candidate(
                titles.get("english") or titles.get("romaji"),
                (media.get("startDate") or {}).get("year"),
                [cover.get("extraLarge"), cover.get("large"), media.get("bannerImage")],
                "AniList",
            )
        )
    return results


def search_movies(query, config):
    """TMDB. Free key from themoviedb.org/settings/api."""
    key = require_key(config, "tmdb_api_key", "TMDB")
    url = "https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode(
        {"api_key": key, "query": query, "include_adult": "false"}
    )
    results = []
    for movie in get_json(url).get("results", [])[:12]:
        images = []
        for path, size in ((movie.get("poster_path"), "w500"), (movie.get("backdrop_path"), "w780")):
            if path:
                images.append(f"https://image.tmdb.org/t/p/{size}{path}")
        year = (movie.get("release_date") or "")[:4]
        results.append(
            candidate(
                movie.get("title"),
                int(year) if year.isdigit() else None,
                images,
                "TMDB",
            )
        )
    return results


def search_tvmaze(query, config):
    """TVmaze. No API key required, so shows work with no credentials at all."""
    url = "https://api.tvmaze.com/search/shows?" + urllib.parse.urlencode({"q": query})
    results = []
    for match in get_json(url)[:12]:
        show = match.get("show") or {}
        image = show.get("image") or {}
        year = (show.get("premiered") or "")[:4]
        results.append(
            candidate(
                show.get("name"),
                int(year) if year.isdigit() else None,
                [image.get("original"), image.get("medium")],
                "TVmaze",
            )
        )
    return results


def search_shows(query, config):
    """TMDB again, on the television half of it. Same free key as movies."""
    key = require_key(config, "tmdb_api_key", "TMDB")
    url = "https://api.themoviedb.org/3/search/tv?" + urllib.parse.urlencode(
        {"api_key": key, "query": query, "include_adult": "false"}
    )
    results = []
    for show in get_json(url).get("results", [])[:12]:
        images = []
        for path, size in ((show.get("poster_path"), "w500"), (show.get("backdrop_path"), "w780")):
            if path:
                images.append(f"https://image.tmdb.org/t/p/{size}{path}")
        year = (show.get("first_air_date") or "")[:4]
        results.append(
            candidate(
                show.get("name"),
                int(year) if year.isdigit() else None,
                images,
                "TMDB",
            )
        )
    return results


def search_games(query, config):
    """RAWG. Free key from rawg.io/apidocs."""
    key = require_key(config, "rawg_api_key", "RAWG")
    url = "https://api.rawg.io/api/games?" + urllib.parse.urlencode(
        {"key": key, "search": query, "page_size": 12}
    )
    results = []
    for game in get_json(url).get("results", []):
        images = [game.get("background_image")]
        images += [shot.get("image") for shot in game.get("short_screenshots") or []]
        year = (game.get("released") or "")[:4]
        results.append(
            candidate(
                game.get("name"),
                int(year) if year.isdigit() else None,
                images[:6],
                "RAWG",
            )
        )
    return results


def search_books(query, config):
    """Open Library. No API key required."""
    url = "https://openlibrary.org/search.json?" + urllib.parse.urlencode(
        {"q": query, "limit": 12, "fields": "title,first_publish_year,cover_i,author_name"}
    )
    results = []
    for book in get_json(url).get("docs", []):
        cover = book.get("cover_i")
        images = []
        if cover:
            images = [f"https://covers.openlibrary.org/b/id/{cover}-L.jpg"]
        authors = book.get("author_name") or []
        results.append(
            candidate(
                book.get("title"),
                book.get("first_publish_year"),
                images,
                "Open Library",
                author=authors[0] if authors else None,
            )
        )
    return results


# Parenthetical disambiguators Wikipedia adds to article titles, e.g.
# "Nausicaä of the Valley of the Wind (film)" or "Blue Prince (2025 video game)".
WIKI_DISAMBIGUATION = re.compile(
    r"\s*\((?:\d{4}\s+)?(?:film|movie|video game|game|manga|anime|novel|book|"
    r"TV series|miniseries|disambiguation)\)\s*$",
    re.IGNORECASE,
)
YEAR_IN_TEXT = re.compile(r"\b(1[89]\d{2}|2[01]\d{2})\b")


def search_wikipedia(query, config, hint=""):
    """English Wikipedia. No API key.

    pilicense=any is the important part: film posters and game box art are
    non-free fair-use uploads, and the default (free-licensed only) hides them.
    """
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "generator": "search",
            "gsrsearch": f"{query} {hint}".strip(),
            "gsrlimit": "8",
            "prop": "pageimages|pageprops",
            "piprop": "original",
            "pilimit": "8",
            "pilicense": "any",
        }
    )
    results = []
    # Pages come back in arbitrary order; index is the search ranking, and the
    # best match being first matters a lot when a cast member's photo is one of
    # the other hits.
    pages = get_json(url).get("query", {}).get("pages", [])
    for page in sorted(pages, key=lambda page: page.get("index", 99)):
        title = page.get("title", "")
        description = (page.get("pageprops") or {}).get("wikibase-shortdesc", "")
        if title.endswith("(disambiguation)") or description.startswith("Topics referred"):
            continue
        year = YEAR_IN_TEXT.search(description)
        results.append(
            candidate(
                WIKI_DISAMBIGUATION.sub("", title),
                int(year.group()) if year else None,
                [(page.get("original") or {}).get("source")],
                "Wikipedia",
            )
        )
    return results


def wikipedia_for(hint):
    """Bind a search hint so Wikipedia disambiguates by list type."""
    return lambda query, config: search_wikipedia(query, config, hint)


# Each type tries every provider and the results are merged, so a type stays
# usable when an optional API key is missing or a provider is having a bad day.
PROVIDERS = {
    "anime": [search_anime, wikipedia_for("anime")],
    "movies": [search_movies, wikipedia_for("film")],
    "shows": [search_tvmaze, search_shows, wikipedia_for("TV series")],
    "games": [search_games, wikipedia_for("video game")],
    "books": [search_books, wikipedia_for("novel")],
}

# Optional providers, and the config key each one needs. Everything else works
# with no credentials at all.
TMDB = ("TMDB", "tmdb_api_key", "https://www.themoviedb.org/settings/api")
PROVIDER_KEYS = {
    "movies": TMDB,
    "shows": TMDB,
    "games": ("RAWG", "rawg_api_key", "https://rawg.io/apidocs"),
}


# --------------------------------------------------------------------- git


def git(*args):
    result = subprocess.run(
        ["git", *args], cwd=REPO, capture_output=True, text=True
    )
    if result.returncode != 0:
        raise ApiError(
            HTTPStatus.INTERNAL_SERVER_ERROR,
            f"git {' '.join(args)} failed: {(result.stderr or result.stdout).strip()}",
        )
    return result.stdout


def audit():
    """Images on disk with no item, and items whose image is missing."""
    orphans, missing = [], []
    for type_ in list_types():
        directory = IMAGES / type_
        if not directory.is_dir():
            continue
        referenced = {item.get("hero") for item in read_data(type_)["items"]}
        on_disk = {p.name for p in directory.glob("hero-*.jpg")}
        orphans += [f"{type_}/{name}" for name in sorted(on_disk - referenced)]
        missing += [f"{type_}/{name}" for name in sorted(referenced - on_disk) if name]
    return orphans, missing


# ---------------------------------------------------------------- handlers


def api_config(handler, query):
    """Also the admin UI's probe: if this does not answer, no admin UI exists."""
    config = load_config()
    optional = {}
    for type_, (name, key, signup) in PROVIDER_KEYS.items():
        if not has_key(config, key):
            optional[type_] = {"name": name, "key": key, "signup": signup}
    return {
        "types": list_types(),
        "searchable": sorted(PROVIDERS),
        "unconfigured": optional,
        "configPath": str(CONFIG_PATH),
    }


def api_search(handler, query):
    type_ = (query.get("type") or [""])[0]
    text = (query.get("q") or [""])[0].strip()
    if not text:
        raise ApiError(HTTPStatus.BAD_REQUEST, "missing search query")
    providers = PROVIDERS.get(type_)
    if not providers:
        raise ApiError(HTTPStatus.BAD_REQUEST, f"no metadata provider for {type_}")

    config = load_config()
    results, notes = [], []
    for provider in providers:
        try:
            results.extend(result for result in provider(text, config) if result)
        except ProviderSkipped as skipped:
            notes.append(skipped.message)
        except ApiError as error:
            notes.append(error.message)

    if not results and notes:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "; ".join(notes))
    return {"results": results, "notes": notes}


def api_status(handler, query):
    porcelain = git("status", "--porcelain", "--", "lists", "www/img")
    changes = [line for line in porcelain.splitlines() if line.strip()]
    orphans, missing = audit()
    return {
        "changes": changes,
        "branch": git("rev-parse", "--abbrev-ref", "HEAD").strip(),
        "orphans": orphans,
        "missing": missing,
    }


def api_create_item(handler, body):
    type_ = body.get("type", "")
    data = read_data(type_)

    title = (body.get("title") or "").strip()
    if not title:
        raise ApiError(HTTPStatus.BAD_REQUEST, "title is required")

    try:
        year = int(body.get("year"))
    except (TypeError, ValueError):
        raise ApiError(HTTPStatus.BAD_REQUEST, "year must be a number")

    slug = check_slug((body.get("slug") or slugify(title)).strip())
    image_url = (body.get("imageUrl") or "").strip()

    if find_item(data, slug) or (image_dir(type_) / hero_name(slug)).exists():
        raise ApiError(HTTPStatus.CONFLICT, f"{hero_name(slug)} already exists")

    # An item may be added without artwork; the list renders a placeholder for
    # it and the image can be picked later by editing the item.
    if image_url:
        install_image(image_url, type_, slug)

    item = {
        "desc": (body.get("desc") or "").strip(),
        "hero": hero_name(slug) if image_url else "",
        "title": title,
        "year": year,
    }
    author = (body.get("author") or "").strip()
    if author:
        item["author"] = author
    if body.get("include") is False:
        item["include"] = False
    data["items"].append(item)
    write_data(type_, data)
    return {"item": item, "slug": slug}


def rename_slug(data, item, type_, target):
    """Move an item's artwork to hero-<target>.jpg and follow it in data.json.

    An item with no artwork has nothing to rename: its slug is derived from its
    title, and the one typed in the dialog applies when an image is installed.
    """
    if target == item_slug(item) or not item.get("hero"):
        return
    if find_item(data, target) or (image_dir(type_) / hero_name(target)).exists():
        raise ApiError(HTTPStatus.CONFLICT, f"{hero_name(target)} already exists")
    source = image_dir(type_) / item["hero"]
    if not source.exists():
        raise ApiError(HTTPStatus.NOT_FOUND, f"{item['hero']} is not on disk")
    os.replace(source, image_dir(type_) / hero_name(target))
    item["hero"] = hero_name(target)


def api_update_item(handler, body, type_, slug):
    data = read_data(type_)
    item = find_item(data, slug)
    if item is None:
        raise ApiError(HTTPStatus.NOT_FOUND, f"no {type_} item known as {slug}")

    if "slug" in body:
        rename_slug(data, item, type_, check_slug((body.get("slug") or "").strip()))
    if "title" in body:
        title = (body.get("title") or "").strip()
        if not title:
            raise ApiError(HTTPStatus.BAD_REQUEST, "title cannot be empty")
        item["title"] = title
    if "desc" in body:
        item["desc"] = (body.get("desc") or "").strip()
    if "author" in body:
        # Only books carry an author, so an empty one drops the key entirely
        # rather than writing it into every other list.
        author = (body.get("author") or "").strip()
        if author:
            item["author"] = author
        else:
            item.pop("author", None)
    if "year" in body:
        try:
            item["year"] = int(body["year"])
        except (TypeError, ValueError):
            raise ApiError(HTTPStatus.BAD_REQUEST, "year must be a number")
    if "include" in body:
        if body["include"] is False:
            item["include"] = False
        else:
            item.pop("include", None)

    write_data(type_, data)
    return {"item": item}


def api_replace_image(handler, body, type_, slug):
    data = read_data(type_)
    item = find_item(data, slug)
    if item is None:
        raise ApiError(HTTPStatus.NOT_FOUND, f"no {type_} item known as {slug}")
    image_url = (body.get("imageUrl") or "").strip()
    if not image_url:
        raise ApiError(HTTPStatus.BAD_REQUEST, "pick an image first")

    # An item with no artwork yet may name the image it is about to get; once
    # installed that name is its identity, so replacements keep it.
    target = slug
    if not item.get("hero"):
        target = check_slug((body.get("slug") or slug).strip())
        if target != slug and (
            find_item(data, target) or (image_dir(type_) / hero_name(target)).exists()
        ):
            raise ApiError(HTTPStatus.CONFLICT, f"{hero_name(target)} already exists")

    install_image(image_url, type_, target)
    # An item that had no artwork is adopting this one, so it stops being
    # addressed by its title and gets a hero of its own.
    if item.get("hero") != hero_name(target):
        item["hero"] = hero_name(target)
        write_data(type_, data)
    return {"hero": hero_name(target)}


def api_delete_item(handler, body, type_, slug):
    data = read_data(type_)
    item = find_item(data, slug)
    if item is None:
        raise ApiError(HTTPStatus.NOT_FOUND, f"no {type_} item known as {slug}")
    data["items"] = [entry for entry in data["items"] if entry is not item]
    write_data(type_, data)
    if item.get("hero"):
        trash(image_dir(type_) / item["hero"])
    return {"deleted": item["title"]}


def api_git(handler, body):
    message = (body.get("message") or "").strip() or "Update lists"
    if not git("status", "--porcelain", "--", "lists", "www/img").strip():
        raise ApiError(HTTPStatus.BAD_REQUEST, "nothing to commit")
    git("add", "--all", "--", "lists", "www/img")
    output = git("commit", "-m", message)
    output += git("push")
    return {"output": output.strip()}


ROUTES = {
    ("GET", "config"): api_config,
    ("GET", "search"): api_search,
    ("GET", "status"): api_status,
}


class StudioHandler(SimpleHTTPRequestHandler):
    server_version = "lexicalunit-studio"

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ApiError(HTTPStatus.BAD_REQUEST, f"bad JSON body: {error}")

    def check_local(self):
        """Guard against DNS rebinding: only localhost may reach the API."""
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
        if host not in ("localhost", "127.0.0.1", "::1"):
            raise ApiError(HTTPStatus.FORBIDDEN, "the studio API is localhost only")
        origin = self.headers.get("Origin")
        if origin:
            hostname = urllib.parse.urlparse(origin).hostname
            if hostname not in ("localhost", "127.0.0.1", "::1"):
                raise ApiError(HTTPStatus.FORBIDDEN, "cross-origin requests are refused")

    def api_path(self):
        parsed = urllib.parse.urlsplit(self.path)
        if not parsed.path.startswith("/api/"):
            return None, None
        parts = [part for part in parsed.path[len("/api/") :].split("/") if part]
        return parts, urllib.parse.parse_qs(parsed.query)

    def dispatch(self, method):
        parts, query = self.api_path()
        if parts is None:
            return False

        try:
            self.check_local()
            payload = self.route(method, parts, query)
        except ApiError as error:
            self.send_json({"error": error.message}, status=error.status)
        except Exception as error:  # keep the server alive on unexpected failures
            self.log_error("unhandled: %r", error)
            self.send_json({"error": f"{type(error).__name__}: {error}"}, status=500)
        else:
            self.send_json(payload)
        return True

    def route(self, method, parts, query):
        head = parts[0] if parts else ""

        handler = ROUTES.get((method, head))
        if handler and len(parts) == 1:
            return handler(self, query)

        if method == "POST" and parts == ["items"]:
            return api_create_item(self, self.read_body())
        if method == "POST" and parts == ["git"]:
            return api_git(self, self.read_body())
        if len(parts) == 3 and parts[0] == "items":
            _, type_, slug = parts
            if method == "PUT":
                return api_update_item(self, self.read_body(), type_, check_slug(slug))
            if method == "DELETE":
                return api_delete_item(self, self.read_body(), type_, check_slug(slug))
        if method == "POST" and len(parts) == 3 and parts[0] == "image":
            _, type_, slug = parts
            return api_replace_image(self, self.read_body(), type_, check_slug(slug))

        raise ApiError(HTTPStatus.NOT_FOUND, f"no such endpoint: /{'/'.join(parts)}")

    def do_GET(self):
        if not self.dispatch("GET"):
            super().do_GET()

    def do_HEAD(self):
        if not self.dispatch("HEAD"):
            super().do_HEAD()

    def do_POST(self):
        if not self.dispatch("POST"):
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        if not self.dispatch("PUT"):
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        if not self.dispatch("DELETE"):
            self.send_error(HTTPStatus.NOT_FOUND)

    def end_headers(self):
        # data.json and the hero images change while the page is open.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class StudioServer(ThreadingHTTPServer):
    """IPv4 loopback. Subclassed only so the IPv6 twin below can share config."""


class StudioServer6(StudioServer):
    address_family = socket.AF_INET6


def loopback_binds():
    """(server class, address) pairs to listen on, IPv6 first.

    Both families, because `localhost` resolves to ::1 first on macOS. Serving
    only 127.0.0.1 leaves the other half of `localhost` free for a stray
    `python3 -m http.server` to answer instead, and then admin.js probes
    /api/config, gets that server's 404, and silently decides it is running on
    the deployed site — edit mode just never appears.
    """
    binds = [(StudioServer, "127.0.0.1")]
    if socket.has_ipv6:
        binds.insert(0, (StudioServer6, "::1"))
    return binds


def listener_on(family, address, port):
    """True if something already accepts connections at this address.

    A connect probe, not a trial bind: HTTPServer keeps SO_REUSEADDR on so that
    restarting studio right after Ctrl-C works, and that same flag lets a bind
    quietly succeed alongside an existing listener rather than failing. Probing
    also refuses to be fooled by the TIME_WAIT sockets a just-killed server
    leaves behind, which a bind without SO_REUSEADDR would trip over.
    """
    with socket.socket(family, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.25)
        try:
            return probe.connect_ex((address, port)) == 0
        except OSError:
            return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    if shutil.which("convert") is None:
        sys.exit("ImageMagick's `convert` is not on PATH (brew install imagemagick)")

    handler = functools.partial(StudioHandler, directory=str(REPO))

    binds = loopback_binds()
    for cls, address in binds:
        if listener_on(cls.address_family, address, args.port):
            sys.exit(
                f"something is already listening on {address} port {args.port} "
                f"(a stray ./local.sh?). Find it with:\n"
                f"    lsof -nP -iTCP:{args.port} -sTCP:LISTEN"
            )

    servers = []
    for cls, address in binds:
        try:
            servers.append(cls((address, args.port), handler))
        except OSError as error:
            for server in servers:
                server.server_close()
            sys.exit(f"cannot listen on {address} port {args.port}: {error}")

    config = load_config()
    # dict, not set: TMDB serves two lists and should still be named once.
    unconfigured = list(
        dict.fromkeys(
            name for name, key, _ in PROVIDER_KEYS.values() if not has_key(config, key)
        )
    )

    print(f"studio serving {REPO} at http://localhost:{args.port}/lists/?type=games")
    print(f"lists: {', '.join(list_types())}")
    print("artwork: Wikipedia (no key needed) for every list")
    if unconfigured:
        print(f"optional, not configured: {', '.join(unconfigured)} — see {CONFIG_PATH}")
    for server in servers[1:]:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
    finally:
        for server in servers:
            server.server_close()


if __name__ == "__main__":
    main()
