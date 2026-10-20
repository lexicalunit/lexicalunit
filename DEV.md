# Lexical Unit

## Developing

```sh
./local.sh
```

Then open `http://localhost:8000/` in your browser.

## Editing the lists

```sh
./studio.sh
```

This serves the site the same way, and additionally exposes a localhost-only API that the lists page uses to add and edit entries: search a metadata provider by title, pick artwork from the results, and it gets saved at up to 1200px on its long edge, never upscaled (exactly what `www/img/*/fix.sh` does), and written into `lists/<type>/data.json` for you. The bar at the bottom of the page commits and pushes; deploying is still `./publish.sh`.

The admin controls only appear when `tools/studio.py` is answering, so nothing changes on the deployed site.

No credentials are needed. Every list searches Wikipedia, which carries official posters and box art along with the release year, though only as small fair-use copies. Anime additionally searches AniList, books Apple Books and Open Library, games Steam, and shows TVmaze, all keyless. Apple Books, Steam and TVmaze return large artwork.

Optionally, movies and shows can also search TMDB, and games RAWG, for a wider choice of artwork. Movies in particular have no keyless source of large posters, so TMDB is worth setting up. Those need free keys in `~/.config/lexicalunit/studio.json`, outside this repo so they are never committed or published:

```json
{
  "tmdb_api_key": "...",
  "rawg_api_key": "..."
}
```

Results from every configured provider are merged, so a missing key or an API having a bad day just means fewer images to choose from, never a broken search.

Every field of an entry is editable from its dialog: title, author, year, description, whether it is hidden, the artwork, and the image slug — renaming that one moves `hero-<slug>.jpg` on disk and follows it in `data.json`.

Any image narrower than 600px is badged with its width in studio mode, since it looks soft in the page's detail view. Tick "low res" in the admin bar to show only those, and click one: its edit dialog searches straight away, and saving or skipping moves on to the next. In studio mode, the detail view that opens when you click a card has an Edit button too.

Artwork is optional: an entry with `"hero": ""` renders a placeholder on the page, is flagged by the "needs image" filter in the admin bar, and picks up a real image the moment you choose one in its edit dialog. Books also carry an `author`, which Open Library fills in for you.

To add a new list, create `lists/<type>/data.json` (copying the shape of an existing one) and `www/img/<type>/`, then add the type to the nav tabs and `TYPES` in `lists/index.html` (and to `WIDE` too if its artwork is landscape rather than a poster). The studio picks it up automatically.

## Publishing

```sh
# source env vars from 1pass
nopw "$PUSER"@"$PHOST"
./publish.sh
```
