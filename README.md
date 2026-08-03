# Lexical Unit

## Developing

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser.

## Editing the lists

```sh
./studio.sh
```

This serves the site the same way, and additionally exposes a localhost-only API that the lists page uses to add and edit entries: search a metadata provider by title, pick artwork from the results, and it gets resized to 300px wide (exactly what `www/img/*/fix.sh` does) and written into `lists/<type>/data.json` for you. The bar at the bottom of the page commits and pushes; deploying is still `./publish.sh`.

The admin controls only appear when `tools/studio.py` is answering, so nothing changes on the deployed site.

No credentials are needed. Every list searches Wikipedia, which carries official posters and box art at roughly the size a hero image wants, along with the release year. Anime additionally searches AniList and books Open Library, both keyless.

Optionally, movies and games can also search TMDB and RAWG for a wider choice of artwork. Those need free keys in `~/.config/lexicalunit/studio.json`, outside this repo so they are never committed or published:

```json
{
  "tmdb_api_key": "...",
  "rawg_api_key": "..."
}
```

Results from every configured provider are merged, so a missing key or an API having a bad day just means fewer images to choose from, never a broken search.

To add a new list, create `lists/<type>/data.json` (copying the shape of an existing one) and `www/img/<type>/`, then add the type to the nav and the validation list in `lists/index.html`. The studio picks it up automatically.

## Publishing

```sh
# source env vars from 1pass
nopw "$PUSER"@"$PHOST"
./publish.sh
```
