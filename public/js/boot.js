/**
 * Entry point.
 *
 * Kept separate from main.js so a module-level failure — a typo in an import
 * path, a syntax error — surfaces as text on the page instead of an empty
 * document. With no bundler there is no build step to catch that earlier.
 */

import { start } from "./main.js";

const fail = (err) => {
  console.error(err);
  const box = document.createElement("div");
  box.className = "gate-card";
  box.append(
    Object.assign(document.createElement("h1"), { textContent: "应用启动失败" }),
    Object.assign(document.createElement("p"), {
      className: "note",
      textContent: String(err?.message || err),
    }),
    Object.assign(document.createElement("pre"), {
      className: "code",
      textContent: String(err?.stack || "").slice(0, 1200),
    }),
  );
  const gate = document.getElementById("gate") || document.body;
  gate.textContent = "";
  gate.append(box);
  gate.hidden = false;
  gate.classList.add("gate");
};

try {
  await start();
} catch (err) {
  fail(err);
}

window.addEventListener("error", (e) => {
  if (e.error) console.error("runtime:", e.error);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("unhandled:", e.reason);
});
