(() => {
  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const current =
    path === "" || path === "/" ? "index.html" : path.endsWith(".html") ? path : `${path}.html`;

  document.querySelectorAll("a[data-nav]").forEach((a) => {
    const href = (a.getAttribute("href") || "").toLowerCase();
    if (href === current) a.setAttribute("aria-current", "page");
  });
})();

