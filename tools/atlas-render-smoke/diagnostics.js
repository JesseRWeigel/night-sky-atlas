"use strict";
(() => {
  const marker = document.getElementById("atlas-render-evidence");
  const fail = (detail) => {
    if (!marker || ["ready", "error"].includes(marker.dataset.status)) return;
    marker.textContent = String(detail).slice(0, 750);
    marker.dataset.status = "error";
  };
  window.addEventListener("error", (event) => {
    if (event.message) fail(event.error?.stack || event.message);
    else if (event.target?.tagName === "SCRIPT") fail("Failed to load " + event.target.getAttribute("src"));
  }, true);
  window.addEventListener("unhandledrejection", (event) => fail(event.reason?.stack || event.reason));
})();
