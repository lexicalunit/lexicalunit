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

  const STYLE = `
    .admin-bar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 1001;
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
      padding: 8px 12px; background: rgba(0,0,0,0.88); color: #fff;
      font-family: "Space Mono", monospace; font-size: 13px;
    }
    .admin-bar input[type="text"] { flex: 1; min-width: 140px; }
    .admin-bar button { width: auto; padding: 5px 12px; box-shadow: none; }
    .admin-bar button:not([disabled]):active { transform: none; box-shadow: none; }
    .admin-bar button[disabled] { opacity: 0.4; cursor: default; }
    .admin-bar .admin-note { opacity: 0.7; }
    .admin-bar .admin-warn { color: #ff8772; }
    .admin-bar label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
    body { padding-bottom: 60px; }

    .admin-edit {
      position: absolute; top: 0; right: 0; width: auto; padding: 2px 7px;
      font-size: 13px; box-shadow: none; opacity: 0.25;
    }
    main li:hover .admin-edit { opacity: 1; }
    .admin-edit:not([disabled]):active { transform: none; box-shadow: none; }
    main li.admin-hidden { opacity: 0.45; }
    main li.admin-nodesc:before { border-color: #ff8772 !important; border-style: dashed; }

    dialog.admin-dialog {
      width: min(1040px, 95vw); max-height: 92vh; border: 1px solid #000;
      border-radius: 6px; padding: 20px; overflow: hidden;
      font-family: "Space Mono", monospace; color: #292929;
    }
    dialog.admin-dialog[open] { display: flex; flex-direction: column; }
    .admin-dialog > *:not(.admin-results) { flex: none; }
    dialog.admin-dialog::backdrop { background: rgba(0,0,0,0.45); }
    .admin-dialog h3 { margin: 0 0 12px; }
    .admin-dialog input, .admin-dialog textarea {
      font-family: inherit; font-size: 14px; padding: 6px; width: 100%;
      box-sizing: border-box; border: 1px solid #ccc; border-radius: 3px;
    }
    .admin-dialog textarea { min-height: 72px; resize: vertical; }
    .admin-row { display: flex; gap: 10px; margin-bottom: 10px; }
    .admin-row > label { flex: 1; font-size: 12px; color: #4f4f4f; }
    .admin-row > label.grow-2 { flex: 2; }
    .admin-dialog button { width: auto; padding: 6px 14px; }
    .admin-actions { display: flex; gap: 10px; margin-top: 14px; align-items: center; }
    .admin-actions .admin-spacer { flex: 1; }
    .admin-inline {
      display: flex; align-items: center; gap: 5px; font-size: 12px;
      color: #4f4f4f; cursor: pointer; white-space: nowrap;
    }
    .admin-inline input { width: auto; }
    .admin-danger { background: #b3261e; border-color: #b3261e; }
    .admin-msg { min-height: 18px; font-size: 12px; margin-top: 8px; }
    .admin-msg.error { color: #b3261e; }
    .admin-msg.note { color: #4f4f4f; }

    .admin-results {
      flex: 1 1 auto; min-height: 0; overflow-y: auto;
      margin: 10px 0; border-top: 1px solid #eee;
    }
    .admin-results:empty { display: none; }
    .admin-empty { font-size: 12px; color: #4f4f4f; padding: 12px 2px; }
    .admin-grid {
      display: grid; gap: 14px; padding: 12px 2px; align-items: start;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    }
    .admin-tile {
      display: flex; flex-direction: column; gap: 4px; cursor: pointer;
      padding: 6px; border: 2px solid transparent; border-radius: 4px;
    }
    .admin-tile:hover { border-color: #9dd0ff; background: #f6fbff; }
    .admin-tile.selected { border-color: #ff8772; background: #fff5f3; }
    .admin-tile-img {
      display: flex; align-items: center; justify-content: center;
      height: 270px; background: #f4f4f4; border-radius: 3px;
    }
    .admin-tile-img img {
      max-height: 100%; max-width: 100%; width: auto; margin: 0;
      object-fit: contain; border: 1px solid rgba(0, 0, 0, 0.25);
    }
    /* Clamped so every tile is the same height and the grid stays even. */
    .admin-tile-cap {
      font-size: 12px; line-height: 16px; height: 32px; color: #292929;
      overflow: hidden; overflow-wrap: anywhere;
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
    }
    .admin-tile-meta {
      font-size: 11px; color: #8a8a8a;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .admin-tile-meta.small { color: #c8613f; }
    .admin-chosen { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
    .admin-chosen:empty { display: none; }
    .admin-chosen img { height: 150px; width: auto; margin: 0; border: 1px solid #000; }
    .admin-chosen span { font-size: 12px; color: #4f4f4f; }
  `;

  let config = null;
  let statusTimer = null;

  // ------------------------------------------------------------------ dialog

  const dialog = el("dialog", { className: "admin-dialog" });
  const heading = el("h3");
  const searchInput = el("input", { type: "text", placeholder: "search title…" });
  const searchButton = el("button", { type: "button", textContent: "Search" });
  const results = el("div", { className: "admin-results" });
  const chosen = el("div", { className: "admin-chosen" });
  const titleInput = el("input", { type: "text" });
  const yearInput = el("input", { type: "number" });
  const slugInput = el("input", { type: "text" });
  const descInput = el("textarea", { placeholder: "description (can be filled in later)" });
  const includeInput = el("input", { type: "checkbox" });
  const saveButton = el("button", { type: "button", textContent: "Save" });
  const deleteButton = el("button", { type: "button", className: "admin-danger", textContent: "Delete" });
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
  searchRow.append(searchInput, searchButton);

  const identityRow = el("div", { className: "admin-row" });
  identityRow.append(
    labelled("title", titleInput, "grow-2"),
    labelled("year", yearInput),
  );

  const slugRow = el("div", { className: "admin-row" });
  slugRow.append(labelled("image slug (hero-<slug>.jpg)", slugInput));

  const descRow = el("div", { className: "admin-row" });
  descRow.append(labelled("description", descInput, "grow-2"));

  const hideLabel = el("label", { className: "admin-inline" });
  hideLabel.append(includeInput, "hide from list");

  const actions = el("div", { className: "admin-actions" });
  actions.append(
    saveButton,
    hideLabel,
    el("span", { className: "admin-spacer" }),
    deleteButton,
    cancelButton,
  );

  dialog.append(heading, searchRow, results, chosen, identityRow, slugRow, descRow, actions, message);

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
    chosen.replaceChildren(
      el("img", { src: url, alt: "selected artwork" }),
      el("span", { textContent: "selected — resized to 300px wide on save" }),
    );
  };

  // One tile per image rather than a row per result: most providers return a
  // single image, and a flat grid gives each one far more room.
  const makeTile = (result, url) => {
    const image = el("img", { src: url, alt: result.title, loading: "lazy" });
    const meta = el("span", { className: "admin-tile-meta", textContent: result.source });
    const tile = el("div", { className: "admin-tile", title: url });

    image.addEventListener("load", () => {
      const { naturalWidth: w, naturalHeight: h } = image;
      meta.textContent = `${result.source} · ${w}×${h}`;
      // Heroes are 300px wide; anything narrower gets upscaled to reach that.
      if (w < 300) {
        meta.classList.add("small");
        meta.textContent += " · upscaled";
      }
    });
    image.addEventListener("error", () => tile.remove());

    tile.append(
      el("span", { className: "admin-tile-img" }, image),
      el("span", {
        className: "admin-tile-cap",
        textContent: `${result.title}${result.year ? ` — ${result.year}` : ""}`,
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
    editingSlug = item ? item.hero.replace(/^hero-|\.jpg$/g, "") : null;
    selectedImage = null;
    slugTouched = Boolean(item);
    heading.textContent = item ? `Edit — ${item.title}` : `Add to ${type}`;
    searchInput.value = item ? item.title : "";
    results.replaceChildren();
    chosen.replaceChildren();
    titleInput.value = item ? item.title : "";
    yearInput.value = item ? item.year : "";
    slugInput.value = editingSlug || "";
    slugInput.disabled = Boolean(item);
    descInput.value = item ? item.desc : "";
    includeInput.checked = item ? item.include === false : false;
    deleteButton.style.display = item ? "" : "none";
    say(item ? "search to replace the artwork, or just edit the text" : "", "note");
    dialog.showModal();
    (item ? descInput : searchInput).focus();
  };

  const save = async () => {
    saveButton.disabled = true;
    say("saving…", "note");
    try {
      if (mode === "add") {
        await api("POST", "/api/items", {
          type,
          title: titleInput.value,
          year: yearInput.value,
          slug: slugInput.value.trim() || slugify(titleInput.value),
          desc: descInput.value,
          imageUrl: selectedImage,
          include: includeInput.checked ? false : true,
        });
      } else {
        await api("PUT", `/api/items/${type}/${editingSlug}`, {
          title: titleInput.value,
          year: yearInput.value,
          desc: descInput.value,
          include: includeInput.checked ? false : true,
        });
        if (selectedImage) {
          await api("POST", `/api/image/${type}/${editingSlug}`, { imageUrl: selectedImage });
        }
      }
      dialog.close();
      await refreshList();
      refreshStatus();
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
      await refreshList();
      refreshStatus();
    } catch (error) {
      say(error.message);
    }
  };

  saveButton.addEventListener("click", save);
  deleteButton.addEventListener("click", remove);

  // --------------------------------------------------------------------- bar

  const addButton = el("button", { type: "button", textContent: "+ Add" });
  const needsDesc = el("input", { type: "checkbox" });
  const commitInput = el("input", { type: "text", placeholder: "commit message" });
  const commitButton = el("button", { type: "button", textContent: "Commit & push" });
  const statusText = el("span", { className: "admin-note" });
  const bar = el("div", { className: "admin-bar" });

  const descFilterLabel = el("label");
  descFilterLabel.append(needsDesc, "needs description");

  bar.append(addButton, descFilterLabel, statusText, commitInput, commitButton);

  addButton.addEventListener("click", () => openDialog(null));
  needsDesc.addEventListener("change", () => applyFilter());

  const refreshStatus = async () => {
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
    const only = needsDesc.checked;
    document.querySelectorAll("main li[data-hero]").forEach((li) => {
      const empty = li.dataset.desc === "";
      li.style.display = only && !empty ? "none" : "";
    });
  };

  const decorate = () => {
    document.querySelectorAll("main li[data-hero]").forEach((li) => {
      const item = data.items.find((entry) => entry.hero === li.dataset.hero);
      if (!item || li.querySelector(".admin-edit")) return;
      li.classList.toggle("admin-hidden", item.include === false);
      li.classList.toggle("admin-nodesc", !item.desc);
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
    await refreshList();
    refreshStatus();
  })();
})();
