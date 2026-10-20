/*
 * Admin layer for the lists page.
 *
 * Loaded by index.html only on localhost, and it builds nothing at all unless
 * tools/studio.py answers on /api/config. On the deployed site that probe
 * fails and this file is inert, so it is harmless to publish.
 */
(() => {
  const api = async (method, path, body) => {
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `${method} ${path} failed`);
    return payload;
  };

  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of [].concat(children)) node.append(child);
    return node;
  };

  const slugify = (title) =>
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  // Mirrors item_slug() in tools/studio.py: an item is addressed by the slug in
  // its hero image name, or by its slugified title until it has one.
  const itemSlug = (item) => {
    const match = /^hero-(.+)\.jpg$/.exec(item.hero || "");
    return match ? match[1] : slugify(item.title);
  };

  // Artwork narrower than this looks soft in the page's detail view, which
  // shows a poster around 470px wide (so ~940 device pixels on a Retina
  // screen). The studio keeps what it downloads at up to 1200px, so
  // re-picking from a provider with big images fixes these.
  const LOW_RES = 600;

  // Matches the data-item attribute index.html puts on each <li>.
  const itemFor = (li) =>
    data.items.find((entry) => (entry.hero || entry.title) === li.dataset.item);

  const STYLE = `
    .admin-bar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 1001;
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
      padding: 8px 12px; background: rgba(0,0,0,0.88); color: #fff;
      font-family: inherit; font-size: 13px;
    }
    .admin-bar input[type="text"] { flex: 1; min-width: 140px; font: inherit; }
    .admin-bar button, .admin-dialog button, .admin-edit {
      padding: 5px 12px; border: 1px solid #000; border-radius: 4px;
      background: #000; color: #fff; font: inherit; cursor: pointer;
    }
    .admin-bar button { border-color: #555; }
    .admin-bar button[disabled], .admin-dialog button[disabled] { opacity: 0.4; cursor: default; }
    .admin-bar .admin-note { opacity: 0.7; }
    .admin-bar .admin-warn { color: #ff8772; }
    .admin-bar label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
    body { padding-bottom: 60px; }

    .admin-edit {
      position: absolute; top: 6px; right: 6px; z-index: 1; padding: 2px 8px;
      font-size: 13px; border-color: #555; opacity: 0.85;
    }
    main li:hover .admin-edit { opacity: 1; border-color: violet; }
    .admin-detail-edit {
      padding: 0.55rem 1rem; border: 1px solid var(--line); border-radius: 8px;
      background: transparent; color: var(--fg); font: inherit; cursor: pointer;
    }
    .admin-detail-edit:hover { border-color: var(--accent); }
    main li.admin-hidden { opacity: 0.45; }
    main li.admin-nodesc .art { outline: 2px dashed #ff8772; outline-offset: 2px; }
    main li.admin-nohero .no-art { border-color: #ff8772; color: #ff8772; }
    .admin-res {
      position: absolute; top: 6px; left: 6px; z-index: 1; padding: 1px 6px;
      border-radius: 4px; background: #ff8772; color: #000; font-size: 11px;
      pointer-events: none;
    }

    /* Two panes: search results get the whole left side at full height, the
       item's fields a narrow column on the right with the buttons pinned to
       its foot. Each pane scrolls on its own. */
    dialog.admin-dialog {
      width: min(1240px, 96vw); height: min(880px, 92vh);
      max-width: none; max-height: none; border: 1px solid #000;
      border-radius: 8px; padding: 0; overflow: hidden;
      font-family: inherit; color: #292929; background: #fff;
    }
    dialog.admin-dialog[open] {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      grid-template-rows: auto minmax(0, 1fr);
    }
    dialog.admin-dialog::backdrop { background: rgba(0,0,0,0.45); }
    .admin-dialog h3 {
      grid-column: 1 / -1; margin: 0; padding: 14px 20px;
      border-bottom: 1px solid #eee; font-size: 16px;
    }
    .admin-pick {
      display: flex; flex-direction: column; gap: 10px;
      min-height: 0; padding: 14px 20px 0;
    }
    .admin-pick .admin-row { margin: 0; }
    .admin-form {
      display: flex; flex-direction: column; min-height: 0;
      border-left: 1px solid #eee; background: #fafafa;
    }
    /* Only the fields scroll; the buttons below them never leave view. */
    .admin-fields { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 14px 20px 4px; }
    .admin-footer { flex: none; padding: 0 20px 14px; border-top: 1px solid #eee; }
    .admin-dialog input, .admin-dialog textarea {
      font-family: inherit; font-size: 14px; padding: 6px; width: 100%;
      box-sizing: border-box; border: 1px solid #ccc; border-radius: 3px;
    }
    .admin-dialog textarea { min-height: 120px; resize: vertical; }
    .admin-row { display: flex; gap: 10px; margin-bottom: 10px; }
    .admin-row > label { flex: 1; font-size: 12px; color: #4f4f4f; }
    .admin-row > label.grow-2 { flex: 2; }
    .admin-dialog button { padding: 6px 14px; }
    .admin-google {
      display: flex; align-items: center; padding: 0 12px; white-space: nowrap;
      border: 1px solid #000; border-radius: 4px; color: #000; font-size: 14px;
    }
    .admin-google:hover { background: #f4f4f4; }
    .admin-actions { display: flex; gap: 8px; align-items: center; padding-top: 12px; }
    .admin-actions .admin-primary { flex: 1; }
    .admin-minor { display: flex; align-items: center; margin-top: 10px; }
    .admin-minor .admin-spacer { flex: 1; }
    .admin-inline {
      display: flex; align-items: center; gap: 5px; font-size: 12px;
      color: #4f4f4f; cursor: pointer; white-space: nowrap;
    }
    .admin-inline input { width: auto; }
    .admin-dialog .admin-danger { background: #b3261e; border-color: #b3261e; }
    .admin-msg { min-height: 18px; font-size: 12px; margin-top: 8px; overflow-wrap: anywhere; }
    .admin-msg.error { color: #b3261e; }
    .admin-msg.note { color: #4f4f4f; }

    .admin-results {
      flex: 1 1 auto; min-height: 0; overflow-y: auto;
      border-top: 1px solid #eee;
    }
    .admin-results:empty::before {
      content: "search results show up here"; display: block;
      padding: 24px 2px; font-size: 12px; color: #8a8a8a;
    }
    .admin-empty { font-size: 12px; color: #4f4f4f; padding: 12px 2px; }
    .admin-grid {
      display: grid; gap: 14px; padding: 12px 2px; align-items: start;
      grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
    }
    .admin-tile {
      display: flex; flex-direction: column; gap: 4px; cursor: pointer;
      padding: 6px; border: 2px solid transparent; border-radius: 4px;
    }
    .admin-tile:hover { border-color: #9dd0ff; background: #f6fbff; }
    .admin-tile.selected { border-color: #ff8772; background: #fff5f3; }
    .admin-tile-img {
      display: flex; align-items: center; justify-content: center;
      height: 210px; background: #f4f4f4; border-radius: 3px;
    }
    .admin-tile-img img {
      max-height: 100%; max-width: 100%; width: auto; margin: 0;
      object-fit: contain; border: 1px solid rgba(0, 0, 0, 0.25);
    }
    /* One line, so every tile is the same height and the grid stays even;
       the full caption is in the tile's tooltip. */
    .admin-tile-cap {
      font-size: 12px; line-height: 16px; color: #292929;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .admin-tile-meta {
      font-size: 11px; color: #8a8a8a;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .admin-tile-meta.small { color: #c8613f; }
    .admin-chosen {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      margin-bottom: 14px;
    }
    .admin-chosen:empty { display: none; }
    .admin-chosen img {
      max-width: 100%; max-height: min(220px, 24vh); width: auto; height: auto;
      margin: 0; border: 1px solid #000;
    }
    .admin-chosen span { font-size: 12px; color: #4f4f4f; text-align: center; }

    /* Narrow windows: one column, and the whole dialog scrolls instead. */
    @media (max-width: 820px) {
      dialog.admin-dialog[open] { display: flex; flex-direction: column; overflow-y: auto; }
      .admin-pick { flex: none; padding-bottom: 14px; }
      .admin-results { flex: none; max-height: 60vh; }
      .admin-form { flex: none; border-left: 0; border-top: 1px solid #eee; }
      .admin-fields { overflow: visible; }
    }
  `;

  let config = null;
  let statusTimer = null;
  let sizes = {}; // hero name -> [width, height], from /api/sizes
  const visited = new Set(); // slugs opened while working through low-res items

  const isLowRes = (item) =>
    Boolean(item.hero && sizes[item.hero] && sizes[item.hero][0] < LOW_RES);

  // Set when the studio is a process started before the code it's serving
  // was last changed: it answers the old API, and saves with the old rules.
  let staleServer = false;

  const loadSizes = async () => {
    try {
      sizes = (await api("GET", `/api/sizes?type=${encodeURIComponent(type)}`)).sizes;
    } catch (error) {
      sizes = {};
      staleServer = /no such endpoint/.test(error.message);
    }
  };

  // Every edit can change an image, so sizes are refetched alongside the list.
  const reload = async () => {
    window.artVersion = Date.now();
    await loadSizes();
    await refreshList();
  };

  // ------------------------------------------------------------------ dialog

  const dialog = el("dialog", { className: "admin-dialog" });
  const heading = el("h3");
  const searchInput = el("input", { type: "text", placeholder: "search title…" });
  const searchButton = el("button", { type: "button", textContent: "Search" });
  const googleLink = el("a", {
    className: "admin-google", target: "_blank", rel: "noopener noreferrer",
    textContent: "Google Images ↗", title: "find art elsewhere, then paste it below",
  });
  const pasteInput = el("input", {
    type: "text",
    placeholder: "…or paste an image URL here, or paste a copied image anywhere in this dialog",
  });
  const results = el("div", { className: "admin-results" });
  const chosen = el("div", { className: "admin-chosen" });
  const titleInput = el("input", { type: "text" });
  const authorInput = el("input", { type: "text", placeholder: "optional" });
  const yearInput = el("input", { type: "number" });
  const slugInput = el("input", { type: "text" });
  const descInput = el("textarea", { placeholder: "description (can be filled in later)" });
  const includeInput = el("input", { type: "checkbox" });
  const saveButton = el("button", { type: "button", className: "admin-primary", textContent: "Save" });
  const deleteButton = el("button", { type: "button", className: "admin-danger", textContent: "Delete" });
  const skipButton = el("button", { type: "button", textContent: "Skip →" });
  const cancelButton = el("button", { type: "button", textContent: "Close" });
  const message = el("div", { className: "admin-msg" });

  let mode = "add";
  let editingSlug = null;
  let selectedImage = null;
  let slugTouched = false;

  const labelled = (text, control, extraClass = "") => {
    const label = el("label", { className: extraClass });
    label.append(text, control);
    return label;
  };

  const searchRow = el("div", { className: "admin-row" });
  searchRow.append(searchInput, searchButton, googleLink);

  const pasteRow = el("div", { className: "admin-row" });
  pasteRow.append(pasteInput);

  // What to add to a title so Google Images turns up art rather than news.
  const GOOGLE_HINTS = {
    movies: "movie poster",
    shows: "tv series poster",
    books: "book cover",
    games: "video game key art",
    anime: "anime key visual",
  };
  const updateGoogleLink = () => {
    const query = `${searchInput.value.trim()} ${GOOGLE_HINTS[type] || ""}`.trim();
    // tbs=isz:l asks for large images only.
    googleLink.href = `https://www.google.com/search?tbm=isch&tbs=isz:l&q=${encodeURIComponent(query)}`;
  };

  const identityRow = el("div", { className: "admin-row" });
  identityRow.append(
    labelled("title", titleInput, "grow-2"),
    labelled("year", yearInput),
  );

  const authorRow = el("div", { className: "admin-row" });
  authorRow.append(labelled("author", authorInput, "grow-2"));

  const slugRow = el("div", { className: "admin-row" });
  slugRow.append(labelled("image slug (hero-<slug>.jpg)", slugInput));

  const descRow = el("div", { className: "admin-row" });
  descRow.append(labelled("description", descInput, "grow-2"));

  const hideLabel = el("label", { className: "admin-inline" });
  hideLabel.append(includeInput, "hide from list");

  const actions = el("div", { className: "admin-actions" });
  actions.append(saveButton, skipButton, cancelButton);

  const minor = el("div", { className: "admin-minor" });
  minor.append(hideLabel, el("span", { className: "admin-spacer" }), deleteButton);

  const pick = el("div", { className: "admin-pick" });
  pick.append(searchRow, pasteRow, results);

  const fields = el("div", { className: "admin-fields" });
  fields.append(chosen, identityRow, authorRow, slugRow, descRow);

  const footer = el("div", { className: "admin-footer" });
  footer.append(actions, minor, message);

  const form = el("div", { className: "admin-form" });
  form.append(fields, footer);

  dialog.append(heading, pick, form);

  const say = (text, tone = "error") => {
    message.textContent = text;
    message.className = `admin-msg ${tone}`;
  };

  const chooseImage = (url, tile) => {
    selectedImage = url;
    results.querySelectorAll(".admin-tile.selected").forEach((node) => {
      node.classList.remove("selected");
    });
    if (tile) tile.classList.add("selected");
    const preview = el("img", { src: url, alt: "selected artwork" });
    const note = el("span", { textContent: "selected — kept at up to 1200px on save, never upscaled" });
    preview.addEventListener("load", () => {
      const { naturalWidth: w, naturalHeight: h } = preview;
      note.textContent = `selected — ${w}×${h}${w < LOW_RES ? " (low res)" : ""}, kept at up to 1200px on save, never upscaled`;
    });
    preview.addEventListener("error", () => {
      note.textContent = "selected — can't preview it here, but the studio will still try to fetch it on save";
    });
    chosen.replaceChildren(preview, note);
  };

  // Until something new is picked, the form shows what the item has now.
  const showCurrent = (item) => {
    if (!item || !item.hero) {
      chosen.replaceChildren();
      return;
    }
    const size = sizes[item.hero];
    chosen.replaceChildren(
      el("img", { src: `${data.images}/${item.hero}?v=${window.artVersion || ""}`, alt: "current artwork" }),
      el("span", {
        textContent: `current image${size ? ` — ${size[0]}×${size[1]}` : ""}`,
      }),
    );
  };

  // One tile per image rather than a row per result: most providers return a
  // single image, and a flat grid gives each one far more room.
  const makeTile = (result, url) => {
    const image = el("img", { src: url, alt: result.title, loading: "lazy" });
    const meta = el("span", { className: "admin-tile-meta", textContent: result.source });
    const caption = `${result.title}${result.year ? ` — ${result.year}` : ""}`;
    const tile = el("div", { className: "admin-tile", title: `${caption}\n${url}` });

    image.addEventListener("load", () => {
      const { naturalWidth: w, naturalHeight: h } = image;
      meta.textContent = `${result.source} · ${w}×${h}`;
      if (w < LOW_RES) {
        meta.classList.add("small");
        meta.textContent += " · low res";
      }
    });
    image.addEventListener("error", () => tile.remove());

    tile.append(
      el("span", { className: "admin-tile-img" }, image),
      el("span", {
        className: "admin-tile-cap",
        textContent: caption,
      }),
      meta,
    );
    tile.addEventListener("click", () => {
      chooseImage(url, tile);
      if (mode === "add") {
        if (!titleInput.value.trim()) titleInput.value = result.title;
        if (!yearInput.value && result.year) yearInput.value = result.year;
        if (!slugTouched) slugInput.value = slugify(titleInput.value);
      }
      if (!authorInput.value.trim() && result.author) {
        authorInput.value = result.author;
      }
    });
    return tile;
  };

  const renderResults = (found) => {
    const tiles = found.flatMap((result) =>
      result.images.map((url) => makeTile(result, url)),
    );
    results.replaceChildren(
      tiles.length
        ? el("div", { className: "admin-grid" }, tiles)
        : el("div", { className: "admin-empty", textContent: "no results" }),
    );
  };

  const runSearch = async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    say("searching…", "note");
    results.replaceChildren();
    try {
      const payload = await api("GET", `/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`);
      renderResults(payload.results);
      say((payload.notes || []).join(" · "), "note");
    } catch (error) {
      say(error.message);
    }
  };

  searchButton.addEventListener("click", runSearch);
  searchInput.addEventListener("input", updateGoogleLink);

  pasteInput.addEventListener("input", () => {
    const url = pasteInput.value.trim();
    if (/^(https?:\/\/|data:image\/)/.test(url)) chooseImage(url, null);
  });

  // "Copy image" in a browser puts the picture itself on the clipboard, not
  // its address; the studio accepts it as a data: URL.
  dialog.addEventListener("paste", (event) => {
    const file = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      chooseImage(reader.result, null);
      pasteInput.value = "";
      say("pasted image selected", "note");
    });
    reader.readAsDataURL(file);
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });
  titleInput.addEventListener("input", () => {
    if (mode === "add" && !slugTouched) slugInput.value = slugify(titleInput.value);
  });
  slugInput.addEventListener("input", () => {
    slugTouched = true;
  });
  cancelButton.addEventListener("click", () => dialog.close());

  const openDialog = (item) => {
    mode = item ? "edit" : "add";
    editingSlug = item ? itemSlug(item) : null;
    selectedImage = null;
    slugTouched = Boolean(item);
    heading.textContent = item ? `Edit — ${item.title}` : `Add to ${type}`;
    searchInput.value = item ? item.title : "";
    pasteInput.value = "";
    updateGoogleLink();
    results.replaceChildren();
    showCurrent(item);
    titleInput.value = item ? item.title : "";
    yearInput.value = item ? item.year : "";
    authorInput.value = (item && item.author) || "";
    slugInput.value = editingSlug || "";
    descInput.value = item ? item.desc : "";
    includeInput.checked = item ? item.include === false : false;
    deleteButton.style.display = item ? "" : "none";
    skipButton.style.display = item && needsLowRes.checked ? "" : "none";
    if (item) visited.add(editingSlug);
    const wantsArt = item && (!item.hero || isLowRes(item));
    say(
      item
        ? !item.hero
          ? "no image yet — search and pick one, or just edit the fields"
          : isLowRes(item)
            ? `current image is only ${sizes[item.hero][0]}px wide — pick a bigger one`
            : "every field is editable; a new slug renames the image on disk"
        : "",
      "note",
    );
    if (!dialog.open) dialog.showModal();
    (item && !wantsArt ? descInput : searchInput).focus();
    // Replacing art is the point of opening these, so save the click.
    if (wantsArt) runSearch();
  };

  // The next low-res item down the page that hasn't been opened this session.
  const nextLowRes = () => {
    for (const li of document.querySelectorAll("main li[data-item]")) {
      const item = itemFor(li);
      if (item && isLowRes(item) && !visited.has(itemSlug(item))) return item;
    }
    return null;
  };

  const advance = () => {
    const next = nextLowRes();
    if (next) openDialog(next);
    else {
      dialog.close();
      statusText.textContent = "no more low-res images on this list";
    }
  };

  const save = async () => {
    saveButton.disabled = true;
    say("saving…", "note");
    try {
      if (mode === "add") {
        await api("POST", "/api/items", {
          type,
          title: titleInput.value,
          author: authorInput.value,
          year: yearInput.value,
          slug: slugInput.value.trim() || slugify(titleInput.value),
          desc: descInput.value,
          imageUrl: selectedImage,
          include: includeInput.checked ? false : true,
        });
      } else {
        // The image goes first: installing one on an item that had none gives
        // it a hero, and that is the identity the edit then has to use.
        let slug = editingSlug;
        if (selectedImage) {
          const installed = await api("POST", `/api/image/${type}/${editingSlug}`, {
            imageUrl: selectedImage,
            slug: slugInput.value.trim() || editingSlug,
          });
          slug = installed.hero.replace(/^hero-|\.jpg$/g, "");
        }
        await api("PUT", `/api/items/${type}/${slug}`, {
          title: titleInput.value,
          author: authorInput.value,
          year: yearInput.value,
          desc: descInput.value,
          slug: slugInput.value.trim() || slug,
          include: includeInput.checked ? false : true,
        });
      }
      await reload();
      refreshStatus();
      if (mode === "edit" && needsLowRes.checked) advance();
      else dialog.close();
    } catch (error) {
      say(error.message);
    } finally {
      saveButton.disabled = false;
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${titleInput.value}" and trash its image?`)) return;
    try {
      await api("DELETE", `/api/items/${type}/${editingSlug}`);
      dialog.close();
      await reload();
      refreshStatus();
    } catch (error) {
      say(error.message);
    }
  };

  saveButton.addEventListener("click", save);
  deleteButton.addEventListener("click", remove);
  skipButton.addEventListener("click", advance);

  // --------------------------------------------------------------------- bar

  const addButton = el("button", { type: "button", textContent: "+ Add" });
  const needsDesc = el("input", { type: "checkbox" });
  const needsHero = el("input", { type: "checkbox" });
  const needsLowRes = el("input", { type: "checkbox" });
  const commitInput = el("input", { type: "text", placeholder: "commit message" });
  const commitButton = el("button", { type: "button", textContent: "Commit & push" });
  const statusText = el("span", { className: "admin-note" });
  const bar = el("div", { className: "admin-bar" });

  const descFilterLabel = el("label");
  descFilterLabel.append(needsDesc, "needs description");

  const heroFilterLabel = el("label");
  heroFilterLabel.append(needsHero, "needs image");

  const lowResFilterLabel = el("label", { title: `narrower than ${LOW_RES}px` });
  lowResFilterLabel.append(needsLowRes, "low res");

  bar.append(
    addButton, descFilterLabel, heroFilterLabel, lowResFilterLabel,
    statusText, commitInput, commitButton,
  );

  addButton.addEventListener("click", () => openDialog(null));
  needsDesc.addEventListener("change", () => applyFilter());
  needsHero.addEventListener("change", () => applyFilter());
  needsLowRes.addEventListener("change", () => {
    visited.clear();
    applyFilter();
    const count = data.items.filter(isLowRes).length;
    if (needsLowRes.checked) {
      statusText.textContent = `${count} low-res image${count === 1 ? "" : "s"} — click one to start; save or skip moves to the next`;
    } else {
      refreshStatus();
    }
  });

  const refreshStatus = async () => {
    if (staleServer) {
      statusText.replaceChildren(
        el("span", {
          className: "admin-warn",
          textContent: "the studio server is running older code than this page — restart ./studio.sh before editing",
        }),
      );
      return;
    }
    try {
      const status = await api("GET", "/api/status");
      const count = status.changes.length;
      statusText.replaceChildren(
        el("span", {
          textContent: count
            ? `${count} uncommitted change${count === 1 ? "" : "s"} on ${status.branch}`
            : `clean on ${status.branch}`,
        }),
      );
      if (status.orphans.length) {
        statusText.append(
          el("span", {
            className: "admin-warn",
            textContent: ` · orphan images: ${status.orphans.join(", ")}`,
          }),
        );
      }
      if (status.missing.length) {
        statusText.append(
          el("span", {
            className: "admin-warn",
            textContent: ` · missing images: ${status.missing.join(", ")}`,
          }),
        );
      }
      commitButton.disabled = count === 0;
    } catch (error) {
      statusText.textContent = error.message;
    }
  };

  commitButton.addEventListener("click", async () => {
    commitButton.disabled = true;
    statusText.textContent = "committing…";
    try {
      await api("POST", "/api/git", { message: commitInput.value });
      commitInput.value = "";
      statusText.textContent = "pushed — run ./publish.sh to deploy";
      clearTimeout(statusTimer);
      statusTimer = setTimeout(refreshStatus, 4000);
    } catch (error) {
      statusText.textContent = error.message;
      commitButton.disabled = false;
    }
  });

  // ------------------------------------------------------------- decoration

  const applyFilter = () => {
    document.querySelectorAll("main li[data-item]").forEach((li) => {
      const item = itemFor(li);
      const wanted =
        (!needsDesc.checked || !item || !item.desc) &&
        (!needsHero.checked || !item || !item.hero) &&
        (!needsLowRes.checked || !item || isLowRes(item));
      li.style.display = wanted ? "" : "none";
    });
  };

  const decorate = () => {
    document.querySelectorAll("main li[data-item]").forEach((li) => {
      const item = itemFor(li);
      if (!item || li.querySelector(".admin-edit")) return;
      li.classList.toggle("admin-hidden", item.include === false);
      li.classList.toggle("admin-nodesc", !item.desc);
      li.classList.toggle("admin-nohero", !item.hero);
      if (isLowRes(item)) {
        li.append(el("span", { className: "admin-res", textContent: `${sizes[item.hero][0]}px` }));
      }
      const pencil = el("button", {
        type: "button",
        className: "admin-edit",
        textContent: "✎",
        title: "edit",
      });
      pencil.addEventListener("click", (event) => {
        event.preventDefault();
        openDialog(item);
      });
      li.append(pencil);
    });
    applyFilter();
  };

  // -------------------------------------------------------------- bootstrap

  (async () => {
    try {
      config = await api("GET", "/api/config");
    } catch {
      return; // no studio server: this is the deployed site, stay invisible
    }
    if (!config.types.includes(type)) return;

    document.head.append(el("style", { textContent: STYLE }));
    document.body.append(bar, dialog);
    window.adminMode = true;
    window.onListRendered = decorate;

    // Clicking a card opens the page's read-only detail view; give it a way
    // into the edit dialog for whichever item it is showing.
    const detail = document.querySelector("dialog.detail");
    const detailEdit = el("button", { type: "button", className: "admin-detail-edit", textContent: "✎ Edit" });
    detail.querySelector(".detail-nav").before(detailEdit);
    detailEdit.addEventListener("click", () => {
      const item = shown[detailIndex];
      detail.close();
      if (item) openDialog(item);
    });

    await reload();
    refreshStatus();
  })();
})();
