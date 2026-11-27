(function () {
  "use strict";

  var CHUNK = 48;
  var KIND_ORDER = ["All", "PDF", "Video", "Image", "Document", "Audio", "Other", "Folder"];
  var EXT_KIND = {
    pdf: "PDF",
    png: "Image", jpg: "Image", jpeg: "Image", gif: "Image", heic: "Image",
    mp4: "Video", mov: "Video",
    mp3: "Audio", wav: "Audio",
    doc: "Document", docx: "Document", pptx: "Document", xlsx: "Document",
    csv: "Document", txt: "Document", md: "Document", pages: "Document"
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtInt(n) {
    return Number(n || 0).toLocaleString("en-US");
  }

  function fmtBytes(n) {
    n = Number(n) || 0;
    var gib = 1024 * 1024 * 1024;
    var mib = 1024 * 1024;
    var kib = 1024;
    if (n >= gib) return (n / gib).toFixed(2) + " GiB";
    if (n >= mib) return (n / mib).toFixed(1) + " MiB";
    if (n >= kib) return (n / kib).toFixed(1) + " KiB";
    return n + " B";
  }

  function extOf(name) {
    var base = String(name || "").split("/").pop();
    var i = base.lastIndexOf(".");
    if (i <= 0) return "";
    var ext = base.slice(i + 1).toLowerCase();
    if (!/^[a-z0-9]{1,20}$/.test(ext)) return "";
    return ext;
  }

  function kindFromExt(ext) {
    return EXT_KIND[ext] || "Other";
  }

  function splitPath(path) {
    var raw = String(path || "").split(" / ").filter(Boolean);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var part = raw[i];
      // A folder name can itself contain " / ". The catalog still joins on that
      // separator. An unmatched "(" means the next segment is the rest of the name.
      while ((part.split("(").length - 1) > (part.split(")").length - 1) && i + 1 < raw.length) {
        i += 1;
        part += " / " + raw[i];
      }
      out.push(part);
    }
    return out;
  }

  function tokensOf(query) {
    return String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matchesTokens(hay, tokens) {
    if (!tokens.length) return true;
    hay = String(hay || "").toLowerCase();
    for (var i = 0; i < tokens.length; i++) {
      if (hay.indexOf(tokens[i]) === -1) return false;
    }
    return true;
  }

  function safeId(id) {
    return /^[A-Za-z0-9_-]+$/.test(String(id || "")) ? String(id) : "";
  }

  function fileUrl(id) {
    var clean = safeId(id);
    return clean ? "https://drive.google.com/file/d/" + clean + "/view" : "";
  }

  function folderUrl(id) {
    var clean = safeId(id);
    return clean ? "https://drive.google.com/drive/folders/" + clean : "";
  }

  function safeHttps(url) {
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch (err) {
      return "";
    }
  }

  function loadJSON(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error(path + " returned " + res.status);
      return res.json();
    });
  }

  function showError(el, err) {
    if (!el) return;
    el.innerHTML = '<div class="empty">The catalog data did not load. ' + escapeHtml(err && err.message ? err.message : "Unknown error") + "</div>";
  }

  function pillarMap(meta) {
    var map = {};
    (meta.roots || []).forEach(function (root) { map[root.key] = root; });
    return map;
  }

  function renderCaveats(meta, el) {
    if (!el) return;
    var c = meta.caveats || {};
    var items = [];
    if (c.continuously_updating_paginated) {
      items.push("Continuously-updating Tango subfolder still has additional pages (" + fmtInt(c.continuously_updating_files_so_far) + " files enumerated so far).");
    }
    if (c.high_times_note) items.push(c.high_times_note);
    if (c.desktop_dea_grandchildren) items.push(c.desktop_dea_grandchildren);
    el.innerHTML = "";
    if (!items.length) {
      el.textContent = "No inventory limits were recorded in the catalog.";
      return;
    }
    var ul = document.createElement("ul");
    ul.className = "caveat-list";
    items.forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  function usbSummaryText(usb) {
    return fmtInt(usb.only_files) + " files · " + usb.only_bytes_human;
  }

  function fillHome(meta) {
    var usb = meta.usb || {};
    var walked = (meta.roots || []).reduce(function (sum, root) {
      return sum + Number(root.walked_folders || 0);
    }, 0);
    var stats = $("stats");
    if (stats) {
      var cards = [
        '<a class="stat" href="./search.html?source=drive"><b>' + fmtInt(meta.drive_unique_files) + '</b><span>Linked Drive files</span></a>',
        '<div class="stat"><b>' + escapeHtml(meta.drive_unique_bytes_human) + '</b><span>Drive bytes counted</span></div>',
        '<a class="stat" href="./folders.html"><b>' + fmtInt(walked) + '</b><span>Folders walked</span></a>',
        '<a class="stat" href="./folders.html"><b>' + fmtInt(meta.unwalked_folder_cards) + '</b><span>Folder links on Drive</span></a>',
        '<div class="stat"><b>' + fmtInt(usb.matched_files) + '</b><span>USB names found on Drive</span></div>',
        '<a class="stat" href="./search.html?source=usb"><b>' + fmtInt(usb.only_files) + '</b><span>USB-only · not on Drive yet</span></a>',
        '<div class="stat"><b>' + escapeHtml(meta.date) + '</b><span>Archive date (ET)</span></div>',
        '<div class="stat"><b>' + fmtInt(usb.real_files) + '</b><span>USB real files</span></div>'
      ];
        stats.innerHTML = cards.join("");
    }
    var dateKicker = $("date-kicker");
    if (dateKicker) dateKicker.textContent = meta.date + " · America/New_York";

    var pillars = $("pillars");
    if (pillars) {
      pillars.innerHTML = (meta.roots || []).map(function (root) {
        var href = safeHttps(root.url);
        var key = encodeURIComponent(root.key);
        return (
          '<article class="pillar">' +
            '<p class="label">Drive root</p>' +
            '<h3>' + escapeHtml(root.name) + '</h3>' +
            '<dl class="facts">' +
              '<div><dt>Linked files</dt><dd>' + fmtInt(root.files) + '</dd></div>' +
              '<div><dt>Size</dt><dd>' + escapeHtml(root.bytes_human) + '</dd></div>' +
              '<div><dt>Folders walked</dt><dd>' + fmtInt(root.walked_folders) + '</dd></div>' +
              '<div><dt>Folder links</dt><dd>' + fmtInt(root.unwalked_child_folders) + '</dd></div>' +
            '</dl>' +
            '<div class="actions">' +
              (href ? '<a class="open" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">Open on Drive</a>' : '') +
              '<a class="ghost" href="./folders.html?pillar=' + key + '">Browse folders</a>' +
              '<a class="ghost" href="./search.html?source=drive&amp;pillar=' + key + '">Search files</a>' +
            '</div>' +
          '</article>'
        );
      }).join("");
    }

    var usbEl = $("usb-summary");
    if (usbEl) {
      var groups = usb.only_groups || [];
      usbEl.innerHTML =
        '<div class="stats">' +
          '<div class="stat"><b>' + fmtInt(usb.real_files) + '</b><span>USB real files</span></div>' +
          '<div class="stat"><b>' + fmtInt(usb.matched_files) + ' · ' + escapeHtml(usb.matched_bytes_human || "") + '</b><span>Matched files</span></div>' +
          '<div class="stat"><b>' + fmtInt(usb.matched_names) + '</b><span>Distinct matched names</span></div>' +
          '<a class="stat" href="./search.html?source=usb"><b>' + fmtInt(usb.only_files) + ' · ' + escapeHtml(usb.only_bytes_human || "") + '</b><span>Not on Drive yet</span></a>' +
        '</div>' +
        '<p class="hint">Matched files are a normalized-name cross-reference against Drive (' + fmtInt(usb.matched_files) + ' files, ' + escapeHtml(usb.matched_bytes_human || "") + ', ' + fmtInt(usb.matched_names) + ' distinct names). USB-only rows have no Drive link.</p>' +
        '<ul class="group-list">' +
          groups.map(function (group) {
            var q = "./search.html?source=usb&amp;folder=" + encodeURIComponent(group.name) + "&amp;folderKind=usb";
            return '<li><a href="' + q + '">' + escapeHtml(group.name) + '</a><span class="nums">' + fmtInt(group.count) + ' files · ' + escapeHtml(group.bytes_human) + '</span></li>';
          }).join("") +
        '</ul>';
    }
    renderCaveats(meta, $("caveats"));
  }

  function fillCover(meta) {
    var usb = meta.usb || {};
    var walked = (meta.roots || []).reduce(function (sum, root) {
      return sum + Number(root.walked_folders || 0);
    }, 0);
    var lead = $("sheet-lead");
    if (lead) {
      lead.textContent = "Filing metadata from the " + meta.date + " read-only Drive inventory (" + (meta.generated_et || "") + "). Account field: " + (meta.account || "") + ".";
    }
    var filing = $("filing-meta");
    if (filing) {
      var rows = [
        ["Archive date", meta.date],
        ["Inventory generated", meta.generated_et],
        ["Account field", meta.account],
        ["Unique Drive file IDs", fmtInt(meta.drive_unique_files)],
        ["Drive file instances", fmtInt(meta.drive_file_instances)],
        ["Drive bytes counted", (meta.drive_unique_bytes_human || "") + " (" + fmtInt(meta.drive_unique_bytes) + " bytes)"],
        ["Folders walked", fmtInt(walked) + " across the four Drive roots"],
        ["Folder links still opening on Drive", fmtInt(meta.unwalked_folder_cards)],
        ["USB real files", fmtInt(usb.real_files)],
        ["USB names found on Drive", fmtInt(usb.matched_files) + " files · " + (usb.matched_bytes_human || "") + " · " + fmtInt(usb.matched_names) + " distinct names"],
        ["USB-only, not on Drive yet", fmtInt(usb.only_files) + " files · " + (usb.only_bytes_human || "") + " (" + fmtInt(usb.only_bytes) + " bytes)"]
      ];
      filing.innerHTML = rows.map(function (row) {
        return "<dt>" + escapeHtml(row[0]) + "</dt><dd>" + escapeHtml(row[1]) + "</dd>";
      }).join("");
    }
    var roots = $("roots");
    if (roots) {
      roots.innerHTML = (meta.roots || []).map(function (root) {
        var href = safeHttps(root.url);
        return (
          '<div class="root-line"><strong>' + escapeHtml(root.name) + '</strong>' +
          '<div class="meta">' + fmtInt(root.files) + ' files · ' + escapeHtml(root.bytes_human) +
          ' · ' + fmtInt(root.walked_folders) + ' folders walked · ' + fmtInt(root.unwalked_child_folders) + ' folder links</div>' +
          (href ? '<div class="actions"><a class="open" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">Open on Drive</a></div>' : '') +
          '</div>'
        );
      }).join("");
    }
    var usbEl = $("usb-block");
    if (usbEl) {
      usbEl.innerHTML =
        '<p class="hint">USB real files: ' + fmtInt(usb.real_files) + '. Matched to a Drive file by normalized name: ' +
        fmtInt(usb.matched_files) + ' files, ' + escapeHtml(usb.matched_bytes_human || "") + ' (' + fmtInt(usb.matched_names) +
        ' distinct names). Not on Drive yet: ' + usbSummaryText(usb) + '.</p>' +
        '<ul class="group-list">' +
          (usb.only_groups || []).map(function (group) {
            return '<li><span>' + escapeHtml(group.name) + '</span><span class="nums">' + fmtInt(group.count) + ' · ' + escapeHtml(group.bytes_human) + '</span></li>';
          }).join("") +
        '</ul>';
    }
    renderCaveats(meta, $("caveats"));
    var printBtn = $("print-btn");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
  }

  function makeNode(name, path, root) {
    return {
      name: name,
      path: path,
      root: root,
      kids: new Map(),
      files: [],
      folders: [],
      fileCount: 0,
      fileBytes: 0,
      folderCount: 0
    };
  }

  function ensureChild(parent, name, root) {
    if (!parent.kids.has(name)) {
      var path = parent.path ? parent.path + " / " + name : name;
      parent.kids.set(name, makeNode(name, path, root));
    }
    return parent.kids.get(name);
  }

  function walkTo(forest, rootKey, path) {
    var parts = splitPath(path);
    var node = forest[rootKey];
    if (!node) return null;
    for (var i = 0; i < parts.length; i++) {
      if (i === 0 && parts[i] === node.name) continue;
      node = ensureChild(node, parts[i], rootKey);
    }
    return node;
  }

  function rollup(node) {
    var files = node.files.length;
    var bytes = 0;
    var folders = node.folders.length;
    for (var i = 0; i < node.files.length; i++) bytes += Number(node.files[i].s) || 0;
    node.kids.forEach(function (child) {
      var rolled = rollup(child);
      files += rolled.files;
      bytes += rolled.bytes;
      folders += rolled.folders;
    });
    node.fileCount = files;
    node.fileBytes = bytes;
    node.folderCount = folders;
    return { files: files, bytes: bytes, folders: folders };
  }

  function buildForest(meta, files, folders) {
    var forest = {};
    (meta.roots || []).forEach(function (root) {
      forest[root.key] = makeNode(root.name, root.name, root.key);
      forest[root.key].url = safeHttps(root.url);
    });
    files.forEach(function (file) {
      var node = walkTo(forest, file.r, file.p);
      if (node) node.files.push(file);
    });
    folders.forEach(function (folder) {
      var parts = splitPath(folder.p);
      var parentPath = parts.slice(0, -1).join(" / ");
      var node = walkTo(forest, folder.r, parentPath || folder.p);
      if (node) node.folders.push(folder);
    });
    (meta.roots || []).forEach(function (root) {
      if (forest[root.key]) rollup(forest[root.key]);
    });
    return forest;
  }

  function hay(item) {
    return (item.n || "") + " " + (item.p || "");
  }

  function countText(node) {
    var bits = [];
    if (node.fileCount) bits.push(fmtInt(node.fileCount) + " files · " + fmtBytes(node.fileBytes));
    if (node.folderCount) bits.push(fmtInt(node.folderCount) + " folder links");
    if (!bits.length) bits.push("No enumerated files in this folder");
    return bits.join(" · ");
  }

  function cardHTML(item) {
    var isFolder = !!item.d || item.k === "Folder";
    var href = isFolder ? folderUrl(item.i) : fileUrl(item.i);
    var bits = [];
    if (!isFolder) bits.push(escapeHtml(fmtBytes(item.s)));
    if (item.m) bits.push(escapeHtml(item.m));
    if (item.ext) bits.push("." + escapeHtml(item.ext));
    if (isFolder) bits.push("Open folder on Drive — contents not individually enumerated");
    var usb = !isFolder && item.u ? ' <span class="usb">USB verified</span>' : "";
    return (
      '<article class="card' + (isFolder ? " folder-card" : "") + '">' +
        '<div class="top"><p class="fname">' + escapeHtml(item.n) + '</p>' +
        '<span class="badge">' + escapeHtml(item.k || (isFolder ? "Folder" : "Other")) + '</span></div>' +
        '<div class="meta">' + bits.join(" · ") + usb + '</div>' +
        (href ? '<a class="open" href="' + href + '" target="_blank" rel="noopener">Open on Drive</a>' : '') +
      '</article>'
    );
  }

  function fileRowHTML(item) {
    var href = fileUrl(item.i);
    var bits = [escapeHtml(fmtBytes(item.s))];
    if (item.m) bits.push(escapeHtml(item.m));
    var ext = extOf(item.n);
    if (ext) bits.push("." + escapeHtml(ext));
    if (item.u) bits.push('<span class="usb">USB verified</span>');
    return (
      '<article class="hit">' +
        '<div><div class="top"><span class="badge">' + escapeHtml(item.k || "Other") + '</span>' +
        '<p class="fname">' + escapeHtml(item.n) + '</p></div>' +
        '<p class="path">' + escapeHtml(item.p) + '</p>' +
        '<div class="meta">' + bits.join(" · ") + '</div></div>' +
        (href ? '<a class="open" href="' + href + '" target="_blank" rel="noopener">Open on Drive</a>' : '') +
      '</article>'
    );
  }

  function bindChunk(container, items, renderer) {
    var shown = 0;
    var more = document.createElement("button");
    more.type = "button";
    more.className = "more ghost";
    function paint() {
      var next = items.slice(shown, shown + CHUNK);
      var html = next.map(renderer).join("");
      if (more.parentNode) more.insertAdjacentHTML("beforebegin", html);
      else container.insertAdjacentHTML("beforeend", html);
      shown += next.length;
      if (shown < items.length) {
        more.textContent = "Show more (" + fmtInt(items.length - shown) + " remaining)";
        if (!more.parentNode) container.appendChild(more);
      } else if (more.parentNode) {
        more.remove();
      }
    }
    more.addEventListener("click", paint);
    paint();
  }

  function renderNode(node, depth) {
    var el = document.createElement("section");
    el.className = "node" + (depth === 0 ? " open" : "");
    var bar = document.createElement("button");
    bar.type = "button";
    bar.className = "bar";
    bar.setAttribute("aria-expanded", depth === 0 ? "true" : "false");
    var caret = document.createElement("span");
    caret.className = "caret";
    caret.textContent = depth === 0 ? "▾" : "▸";
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = node.name;
    var counts = document.createElement("span");
    counts.className = "counts";
    counts.textContent = countText(node);
    bar.appendChild(caret);
    bar.appendChild(name);
    bar.appendChild(counts);

    var body = document.createElement("div");
    body.className = "body";
    var painted = false;
    function paintBody() {
      if (painted) return;
      painted = true;
      if (node.url && depth === 0) {
        var link = document.createElement("a");
        link.className = "open";
        link.href = node.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "Open root folder on Drive";
        link.style.marginTop = "12px";
        body.appendChild(link);
      }
      if (node.folders.length) {
        var folderLabel = document.createElement("p");
        folderLabel.className = "block-label";
        folderLabel.textContent = "Folder links (" + fmtInt(node.folders.length) + ")";
        body.appendChild(folderLabel);
        var grid = document.createElement("div");
        grid.className = "cards";
        body.appendChild(grid);
        bindChunk(grid, node.folders, cardHTML);
      }
      if (node.files.length) {
        var fileLabel = document.createElement("p");
        fileLabel.className = "block-label";
        fileLabel.textContent = "Files in this folder (" + fmtInt(node.files.length) + " · " + fmtBytes(node.files.reduce(function (sum, file) {
          return sum + (Number(file.s) || 0);
        }, 0)) + ")";
        body.appendChild(fileLabel);
        var list = document.createElement("div");
        list.className = "hits";
        body.appendChild(list);
        bindChunk(list, node.files, fileRowHTML);
      } else if (!node.folders.length && !node.kids.size) {
        var note = document.createElement("p");
        note.className = "hint";
        note.textContent = "No enumerated files were recorded in this folder.";
        body.appendChild(note);
      }
      if (node.kids.size) {
        var wrap = document.createElement("div");
        wrap.className = "children";
        node.kids.forEach(function (child) {
          wrap.appendChild(renderNode(child, depth + 1));
        });
        body.appendChild(wrap);
      }
    }
    bar.addEventListener("click", function () {
      var open = el.classList.toggle("open");
      bar.setAttribute("aria-expanded", open ? "true" : "false");
      caret.textContent = open ? "▾" : "▸";
      if (open) paintBody();
    });
    el.appendChild(bar);
    el.appendChild(body);
    if (depth === 0) paintBody();
    return el;
  }

  function nodeMatches(node, tokens) {
    if (!tokens.length) return true;
    if (matchesTokens(node.name + " " + node.path, tokens)) return true;
    for (var i = 0; i < node.files.length; i++) {
      if (matchesTokens(hay(node.files[i]), tokens)) return true;
    }
    for (var j = 0; j < node.folders.length; j++) {
      if (matchesTokens(hay(node.folders[j]), tokens)) return true;
    }
    var found = false;
    node.kids.forEach(function (child) {
      if (!found && nodeMatches(child, tokens)) found = true;
    });
    return found;
  }

  function collectMatches(node, tokens, into) {
    node.folders.forEach(function (folder) {
      if (matchesTokens(hay(folder), tokens)) into.folders.push(folder);
    });
    node.files.forEach(function (file) {
      if (matchesTokens(hay(file), tokens)) into.files.push(file);
    });
    node.kids.forEach(function (child) {
      if (nodeMatches(child, tokens)) collectMatches(child, tokens, into);
    });
  }

  function bootFolders(meta, files, folders) {
    var forest = buildForest(meta, files, folders);
    var roots = meta.roots || [];
    var pillarEl = $("pillar-filter");
    var queryEl = $("folder-q");
    var metaEl = $("results-meta");
    var catalogEl = $("catalog");
    var form = $("folder-filters");
    roots.forEach(function (root) {
      var option = document.createElement("option");
      option.value = root.key;
      option.textContent = root.name;
      pillarEl.appendChild(option);
    });

    var params = new URLSearchParams(window.location.search);
    var initialPillar = params.get("pillar") || "all";
    var initialQuery = params.get("q") || "";
    if (initialPillar !== "all" && roots.some(function (root) { return root.key === initialPillar; })) {
      pillarEl.value = initialPillar;
    }
    queryEl.value = initialQuery;

    function writeUrl() {
      var url = new URL(window.location.href);
      var pillar = pillarEl.value;
      var query = queryEl.value.trim();
      if (pillar && pillar !== "all") url.searchParams.set("pillar", pillar);
      else url.searchParams.delete("pillar");
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      history.replaceState(null, "", url.pathname + url.search);
    }

    function render() {
      var pillar = pillarEl.value || "all";
      var tokens = tokensOf(queryEl.value);
      catalogEl.innerHTML = "";
      var tree = document.createElement("div");
      tree.className = "tree";
      var shownRoots = 0;
      var matchFiles = 0;
      var matchFolders = 0;
      roots.forEach(function (root) {
        if (pillar !== "all" && root.key !== pillar) return;
        var node = forest[root.key];
        if (!node) return;
        if (tokens.length && !nodeMatches(node, tokens)) return;
        shownRoots += 1;
        if (tokens.length) {
          var bag = { files: [], folders: [] };
          collectMatches(node, tokens, bag);
          matchFiles += bag.files.length;
          matchFolders += bag.folders.length;
          var block = document.createElement("section");
          block.className = "pillar-block";
          var heading = document.createElement("h3");
          heading.textContent = root.name;
          var note = document.createElement("p");
          note.className = "hint";
          note.textContent = fmtInt(root.files) + " catalog files · " + root.bytes_human + " · " + fmtInt(root.unwalked_child_folders) + " folder links. This filter shows " + fmtInt(bag.files.length) + " files and " + fmtInt(bag.folders.length) + " folder links.";
          block.appendChild(heading);
          block.appendChild(note);
          if (bag.folders.length) {
            var grid = document.createElement("div");
            grid.className = "cards";
            block.appendChild(grid);
            bindChunk(grid, bag.folders, cardHTML);
          }
          if (bag.files.length) {
            var list = document.createElement("div");
            list.className = "hits";
            block.appendChild(list);
            bindChunk(list, bag.files, fileRowHTML);
          }
          catalogEl.appendChild(block);
        } else {
          tree.appendChild(renderNode(node, 0));
        }
      });
      if (!tokens.length) catalogEl.appendChild(tree);
      if (!shownRoots) {
        catalogEl.innerHTML = '<div class="empty">No folders or files match this filter.</div>';
      }
      if (tokens.length) {
        metaEl.textContent = fmtInt(matchFiles) + " files · " + fmtInt(matchFolders) + " folder links match. Clear the name filter to browse the full tree. Catalog total: " + fmtInt(files.length) + " Drive files · " + fmtInt(folders.length) + " folder links.";
      } else {
        metaEl.textContent = "Browsing " + fmtInt(shownRoots) + " Drive root" + (shownRoots === 1 ? "" : "s") + ". Open a folder to load its files and folder links. Catalog total: " + fmtInt(files.length) + " Drive files · " + fmtInt(folders.length) + " folder links.";
      }
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      writeUrl();
      render();
    });
    pillarEl.addEventListener("change", function () { writeUrl(); render(); });
    queryEl.addEventListener("input", function () { writeUrl(); render(); });
    $("folder-clear").addEventListener("click", function () {
      pillarEl.value = "all";
      queryEl.value = "";
      writeUrl();
      render();
    });
    render();
  }

  function prepareSearch(meta, files, folders, usb) {
    var roots = pillarMap(meta);
    var drive = files.map(function (file) {
      var ext = extOf(file.n);
      return {
        source: "drive",
        n: file.n,
        p: file.p,
        r: file.r,
        k: file.k || "Other",
        s: file.s,
        m: file.m || "",
        u: file.u ? 1 : 0,
        i: file.i,
        ext: ext,
        hay: ((file.n || "") + " " + (file.p || "")).toLowerCase()
      };
    });
    var folderItems = folders.map(function (folder) {
      return {
        source: "folder",
        n: folder.n,
        p: folder.p,
        r: folder.r,
        k: "Folder",
        s: 0,
        m: "",
        u: 0,
        i: folder.i,
        ext: "",
        hay: ((folder.n || "") + " " + (folder.p || "")).toLowerCase()
      };
    });
    var usbItems = usb.map(function (item) {
      var ext = extOf(item.n);
      return {
        source: "usb",
        n: item.n,
        p: item.p,
        t: item.t || "",
        r: "",
        k: kindFromExt(ext),
        s: item.s,
        m: "",
        u: 0,
        i: "",
        ext: ext,
        hay: ((item.n || "") + " " + (item.p || "")).toLowerCase()
      };
    });
    var paths = [];
    var seen = new Set();
    function addPath(rootKey, path) {
      if (!path) return;
      var id = rootKey + "\t" + path;
      if (seen.has(id)) return;
      seen.add(id);
      paths.push({ root: rootKey, path: path });
    }
    function addAncestors(rootKey, path) {
      var parts = splitPath(path);
      var acc = [];
      parts.forEach(function (part, index) {
        acc.push(part);
        if (index === 0) return;
        addPath(rootKey, acc.join(" / "));
      });
    }
    drive.forEach(function (file) { addAncestors(file.r, file.p); });
    folderItems.forEach(function (folder) { addAncestors(folder.r, folder.p); });
    paths.sort(function (a, b) {
      if (a.root !== b.root) return a.root < b.root ? -1 : 1;
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });
    var usbGroups = [];
    var usbSeen = new Set();
    usbItems.forEach(function (item) {
      if (!item.t || usbSeen.has(item.t)) return;
      usbSeen.add(item.t);
      usbGroups.push(item.t);
    });
    return { roots: roots, drive: drive, folders: folderItems, usb: usbItems, paths: paths, usbGroups: usbGroups, meta: meta };
  }

  function pathLabel(path) {
    var parts = splitPath(path);
    if (parts.length <= 2) return parts.join(" / ");
    return parts.slice(-2).join(" / ");
  }

  function underPath(itemPath, folderPath) {
    return itemPath === folderPath || itemPath.indexOf(folderPath + " / ") === 0;
  }

  function bootSearch(index) {
    var meta = index.meta;
    var pillarEl = $("pillar-filter");
    var sourceEl = $("source-filter");
    var folderEl = $("folder-filter");
    var extEl = $("ext-filter");
    var queryEl = $("q");
    var kindRow = $("type-filters");
    var usbFlagEl = $("usb-flag");
    var metaEl = $("results-meta");
    var listEl = $("results");
    var form = $("search-form");
    var kind = "All";

    (meta.roots || []).forEach(function (root) {
      var option = document.createElement("option");
      option.value = root.key;
      option.textContent = root.name;
      pillarEl.appendChild(option);
    });

    var extCounts = new Map();
    index.drive.concat(index.usb).forEach(function (item) {
      var key = item.ext || "";
      extCounts.set(key, (extCounts.get(key) || 0) + 1);
    });
    Array.from(extCounts.keys()).sort(function (a, b) {
      return (extCounts.get(b) - extCounts.get(a)) || (a < b ? -1 : a > b ? 1 : 0);
    }).forEach(function (ext) {
      var option = document.createElement("option");
      option.value = ext ? ext : "__none__";
      option.textContent = (ext ? "." + ext : "(no extension)") + " · " + fmtInt(extCounts.get(ext));
      extEl.appendChild(option);
    });

    function fillFolders() {
      var pillar = pillarEl.value;
      var source = sourceEl.value;
      var previous = folderEl.value;
      folderEl.innerHTML = "";
      var all = document.createElement("option");
      all.value = "";
      all.textContent = source === "usb" ? "All USB folders" : "All folders";
      folderEl.appendChild(all);
      if (source !== "usb") {
        var group = document.createElement("optgroup");
        group.label = "Drive folders";
        index.paths.forEach(function (entry) {
          if (pillar !== "all" && entry.root !== pillar) return;
          var option = document.createElement("option");
          option.value = "drive\t" + entry.path;
          option.textContent = pathLabel(entry.path);
          option.title = entry.path;
          group.appendChild(option);
        });
        if (group.children.length) folderEl.appendChild(group);
      }
      if (source === "all" || source === "usb") {
        var usbGroup = document.createElement("optgroup");
        usbGroup.label = "USB folders not on Drive yet";
        index.usbGroups.forEach(function (name) {
          var option = document.createElement("option");
          option.value = "usb\t" + name;
          option.textContent = name;
          usbGroup.appendChild(option);
        });
        folderEl.appendChild(usbGroup);
      }
      if (previous) {
        folderEl.value = previous;
        if (folderEl.value !== previous) folderEl.value = "";
      }
    }

    function readFolder() {
      var raw = folderEl.value;
      if (!raw) return null;
      var splitAt = raw.indexOf("\t");
      if (splitAt < 0) return null;
      return { kind: raw.slice(0, splitAt), path: raw.slice(splitAt + 1) };
    }

    function applyParams() {
      var params = new URLSearchParams(window.location.search);
      var source = params.get("source") || "all";
      if (["all", "drive", "folders", "usb"].indexOf(source) === -1) source = "all";
      sourceEl.value = source;
      var pillar = params.get("pillar") || "all";
      if ((meta.roots || []).some(function (root) { return root.key === pillar; })) pillarEl.value = pillar;
      fillFolders();
      var folder = params.get("folder") || "";
      var folderKind = params.get("folderKind") || "drive";
      if (folder) {
        folderEl.value = folderKind + "\t" + folder;
        if (!folderEl.value) folderEl.value = "";
      }
      queryEl.value = params.get("q") || "";
      var requestedKind = params.get("kind") || "All";
      if (KIND_ORDER.indexOf(requestedKind) === -1) requestedKind = "All";
      kind = requestedKind;
      kindRow.querySelectorAll("button").forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-kind") === kind ? "true" : "false");
      });
      var ext = params.get("ext");
      if (ext === "__none__" || (ext && extCounts.has(ext))) extEl.value = ext;
      usbFlagEl.checked = params.get("usb") === "1";
    }

    function writeUrl() {
      var url = new URL(window.location.href);
      var query = queryEl.value.trim();
      var source = sourceEl.value;
      var pillar = pillarEl.value;
      var folder = readFolder();
      var ext = extEl.value;
      function set(key, value) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      set("q", query);
      set("source", source === "all" ? "" : source);
      set("pillar", pillar === "all" ? "" : pillar);
      set("folder", folder ? folder.path : "");
      set("folderKind", folder && folder.kind !== "drive" ? folder.kind : "");
      set("kind", kind === "All" ? "" : kind);
      set("ext", ext);
      set("usb", usbFlagEl.checked ? "1" : "");
      history.replaceState(null, "", url.pathname + url.search);
    }

    function itemVisible(item) {
      var source = sourceEl.value;
      var pillar = pillarEl.value;
      var folder = readFolder();
      var ext = extEl.value;
      var tokens = tokensOf(queryEl.value);
      if (source === "drive" && item.source !== "drive") return false;
      if (source === "folders" && item.source !== "folder") return false;
      if (source === "usb" && item.source !== "usb") return false;
      if (usbFlagEl.checked && !(item.source === "drive" && item.u === 1)) return false;
      if (kind !== "All" && item.k !== kind) return false;
      if (ext === "__none__") {
        if (item.ext) return false;
      } else if (ext && item.ext !== ext) {
        return false;
      }
      if (pillar !== "all") {
        if (item.source === "usb") return false;
        if (item.r !== pillar) return false;
      }
      if (folder) {
        if (folder.kind === "usb") {
          if (item.source !== "usb" || item.t !== folder.path) return false;
        } else if (item.source === "usb") {
          return false;
        } else if (!underPath(item.p, folder.path)) {
          return false;
        }
      }
      return matchesTokens(item.hay, tokens);
    }

    function resultHTML(item) {
      var href = item.source === "folder" ? folderUrl(item.i) : item.source === "drive" ? fileUrl(item.i) : "";
      var bits = [];
      if (item.source !== "folder") bits.push(escapeHtml(fmtBytes(item.s)));
      if (item.m) bits.push(escapeHtml(item.m));
      if (item.ext) bits.push("." + escapeHtml(item.ext));
      var root = index.roots[item.r];
      if (root) bits.push(escapeHtml(root.name));
      if (item.u) bits.push('<span class="usb">USB verified</span>');
      if (item.source === "usb") bits.push('<span class="badge usb-only">Not on Drive yet</span>');
      if (item.source === "folder") bits.push("Contents not individually enumerated");
      return (
        '<article class="hit">' +
          '<div><div class="top"><span class="badge">' + escapeHtml(item.k) + '</span>' +
          '<p class="fname">' + escapeHtml(item.n) + '</p></div>' +
          '<p class="path">' + escapeHtml(item.p) + '</p>' +
          '<div class="meta">' + bits.join(" · ") + '</div></div>' +
          (href ? '<a class="open" href="' + href + '" target="_blank" rel="noopener">Open on Drive</a>' : '') +
        '</article>'
      );
    }

    function render() {
      var pool = index.drive.concat(index.folders, index.usb).filter(itemVisible);
      var bytes = 0;
      var driveN = 0;
      var folderN = 0;
      var usbN = 0;
      pool.forEach(function (item) {
        if (item.source === "drive") { driveN += 1; bytes += Number(item.s) || 0; }
        else if (item.source === "folder") folderN += 1;
        else { usbN += 1; bytes += Number(item.s) || 0; }
      });
      listEl.innerHTML = "";
      if (!pool.length) {
        listEl.innerHTML = '<div class="empty">No archive records match these filters.</div>';
      } else {
        bindChunk(listEl, pool, resultHTML);
      }
      var query = queryEl.value.trim();
      metaEl.textContent = fmtInt(pool.length) + " shown · " + fmtInt(driveN) + " Drive files · " + fmtInt(folderN) + " folder links · " + fmtInt(usbN) + " USB-only · " + fmtBytes(bytes) + (query ? " matching “" + query + "”" : "") + ". Catalog: " + fmtInt(index.drive.length) + " Drive files, " + fmtInt(index.folders.length) + " folder links, " + fmtInt(index.usb.length) + " USB-only.";
    }

    sourceEl.addEventListener("change", function () { fillFolders(); writeUrl(); render(); });
    pillarEl.addEventListener("change", function () { fillFolders(); writeUrl(); render(); });
    folderEl.addEventListener("change", function () { writeUrl(); render(); });
    extEl.addEventListener("change", function () { writeUrl(); render(); });
    usbFlagEl.addEventListener("change", function () { writeUrl(); render(); });
    queryEl.addEventListener("input", function () { writeUrl(); render(); });
    kindRow.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-kind]");
      if (!button) return;
      kind = button.getAttribute("data-kind");
      kindRow.querySelectorAll("button").forEach(function (item) {
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      writeUrl();
      render();
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      writeUrl();
      render();
    });
    $("search-clear").addEventListener("click", function () {
      sourceEl.value = "all";
      pillarEl.value = "all";
      queryEl.value = "";
      extEl.value = "";
      usbFlagEl.checked = false;
      kind = "All";
      kindRow.querySelectorAll("button").forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-kind") === "All" ? "true" : "false");
      });
      fillFolders();
      folderEl.value = "";
      writeUrl();
      render();
    });

    applyParams();
    render();
  }

  function boot() {
    var page = document.body.getAttribute("data-page");
    if (page === "home" || page === "cover") {
      loadJSON("./data/meta.json").then(function (meta) {
        if (page === "home") fillHome(meta);
        else fillCover(meta);
      }).catch(function (err) {
        showError($("stats") || $("filing-meta"), err);
      });
      return;
    }
    if (page === "folders") {
      Promise.all([
        loadJSON("./data/meta.json"),
        loadJSON("./data/files.json"),
        loadJSON("./data/folders.json")
      ]).then(function (parts) {
        bootFolders(parts[0], parts[1], parts[2]);
      }).catch(function (err) {
        showError($("catalog"), err);
      });
      return;
    }
    if (page === "search") {
      Promise.all([
        loadJSON("./data/meta.json"),
        loadJSON("./data/files.json"),
        loadJSON("./data/folders.json"),
        loadJSON("./data/usb.json")
      ]).then(function (parts) {
        bootSearch(prepareSearch(parts[0], parts[1], parts[2], parts[3]));
      }).catch(function (err) {
        showError($("results"), err);
      });
    }
  }

  boot();
})();
