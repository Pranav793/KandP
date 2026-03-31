(() => {
  const cover = document.getElementById("cover");
  const notebook = document.getElementById("notebook");
  const spreadsEl = document.getElementById("spreads");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  let spreads = [];
  let current = 0;

  // ── Parse a poem .txt file ────────────────────────
  // Format: first line = title, blank line, then body
  function parsePoem(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const title = lines[0].trim();
    const bodyStart = lines[1] && lines[1].trim() === "" ? 2 : 1;
    const body = lines.slice(bodyStart).join("\n").trim();
    return { title, body };
  }

  // ── Build a single page element ───────────────────
  function makePage(side, content) {
    const div = document.createElement("div");
    div.className = `page page-${side}`;

    if (content.type === "poem") {
      div.innerHTML =
        `<div class="page-title">${content.title}</div>` +
        `<div class="page-body">${content.body}</div>` +
        `<div class="page-number">${content.num}</div>`;
    } else if (content.type === "toc") {
      div.innerHTML =
        `<div class="page-title">Contents</div>` +
        `<div class="page-body">${content.html}</div>`;
    } else if (content.type === "link") {
      div.className += " page-link-page";
      div.innerHTML =
        `<a class="page-link" href="us/">` +
        `<span class="page-link-icon">&hearts;</span>` +
        `<span class="page-link-title">Us</span>` +
        `<span class="page-link-desc">Our photo gallery</span>` +
        `</a>`;
    } else {
      div.className += " page-blank";
    }

    return div;
  }

  // ── Build a spread (left + right pages) ───────────
  function makeSpread(index, left, right) {
    const div = document.createElement("div");
    div.className = "spread" + (index === 0 ? " active" : "");
    div.dataset.spread = index;
    div.appendChild(makePage("left", left));
    div.appendChild(makePage("right", right));
    return div;
  }

  // ── Load poems and build the notebook ─────────────
  async function init() {
    const manifest = await fetch("poems/manifest.json").then((r) => r.json());
    const poems = await Promise.all(
      manifest.map(async (file) => {
        const text = await fetch(`poems/${file}`).then((r) => r.text());
        return parsePoem(text);
      })
    );

    // Build TOC links
    let tocHtml = "";
    poems.forEach((p, i) => {
      const spreadIndex = Math.floor(i / 2) + 1;
      tocHtml += `<a class="toc-link" href="#" data-goto="${spreadIndex}">${i + 1}. ${p.title}</a>`;
    });
    tocHtml += `<a class="toc-link" href="us/" data-external>${poems.length + 1}. Us &mdash; our gallery</a>`;

    // Spread 0: contents (left) + blank (right)
    spreadsEl.appendChild(
      makeSpread(0, { type: "toc", html: tocHtml }, { type: "blank" })
    );

    // Poem spreads: 2 poems per spread
    let spreadIdx = 1;
    for (let i = 0; i < poems.length; i += 2) {
      const left = { type: "poem", title: poems[i].title, body: poems[i].body, num: i + 1 };
      let right;
      if (i + 1 < poems.length) {
        right = { type: "poem", title: poems[i + 1].title, body: poems[i + 1].body, num: i + 2 };
      } else {
        right = { type: "blank" };
      }
      spreadsEl.appendChild(makeSpread(spreadIdx, left, right));
      spreadIdx++;
    }

    // Last spread: last poem page might already be placed above,
    // so just add the /us link page as the final spread's right side
    // if the last spread's right side isn't blank, add a new spread
    const lastSpread = spreadsEl.lastElementChild;
    const lastRight = lastSpread.querySelector(".page-right");
    if (lastRight.classList.contains("page-blank")) {
      lastRight.className = "page page-right page-link-page";
      lastRight.innerHTML =
        `<a class="page-link" href="us/">` +
        `<span class="page-link-icon">&hearts;</span>` +
        `<span class="page-link-title">Us</span>` +
        `<span class="page-link-desc">Our photo gallery</span>` +
        `</a>`;
    } else {
      spreadsEl.appendChild(
        makeSpread(spreadIdx, { type: "link" }, { type: "blank" })
      );
    }

    // Cache spread elements
    spreads = spreadsEl.querySelectorAll(".spread");

    // Wire up TOC links
    spreadsEl.querySelectorAll(".toc-link[data-goto]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const target = parseInt(link.dataset.goto, 10);
        if (!isNaN(target)) show(target);
      });
    });

    updateArrows();
  }

  // ── Cover open ──────────────────────────────────
  cover.addEventListener("click", () => {
    cover.classList.add("is-opening");

    cover.addEventListener("animationend", () => {
      cover.classList.add("hidden");
      notebook.classList.remove("hidden");
    }, { once: true });

    setTimeout(() => {
      if (!cover.classList.contains("hidden")) {
        cover.classList.add("hidden");
        notebook.classList.remove("hidden");
      }
    }, 700);
  });

  // ── Spread navigation ───────────────────────────
  function show(index) {
    if (index < 0 || index >= spreads.length) return;
    spreads[current].classList.remove("active");
    current = index;
    spreads[current].classList.add("active");
    updateArrows();
  }

  function closeToCover() {
    notebook.classList.add("hidden");
    cover.classList.remove("hidden", "is-opening");
    cover.style.animation = "none";
    cover.offsetHeight;
    cover.style.animation = "";
  }

  function updateArrows() {
    prevBtn.classList.remove("hidden");
    nextBtn.classList.toggle("hidden", current === spreads.length - 1);
  }

  prevBtn.addEventListener("click", () => {
    if (current === 0) closeToCover();
    else show(current - 1);
  });
  nextBtn.addEventListener("click", () => show(current + 1));

  document.addEventListener("keydown", (e) => {
    if (notebook.classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") {
      if (current === 0) closeToCover();
      else show(current - 1);
    }
    if (e.key === "ArrowRight") show(current + 1);
  });

  init();
})();
