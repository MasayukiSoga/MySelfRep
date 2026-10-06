import { GameScreen } from "./core/GameScreen.js";
import { createSampleWorld } from "./core/SampleWorld.js";

// ブラウザ専用の薄い描画層。GameScreen が返す文字列を並べて表示するだけで、
// ここはC#へは移植しない（C#側は同じ ScreenModel を SpriteFont で描く想定）

const screen = new GameScreen(createSampleWorld());

function el(tag: string, className: string, text = ""): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

// 罫線は1文字ずつ1em幅のマスに入れ、フォントに関係なく縦線を揃える
function line(prefix: string, text: string, className: string, tag = "div"): HTMLElement {
  const row = el(tag, className);
  const cells = el("span", "cells");
  for (const ch of prefix) {
    cells.append(el("span", "cell", ch));
  }
  row.append(cells, el("span", "text", text));
  return row;
}

function draw(): void {
  const root = document.getElementById("app");
  if (!root) return;
  const model = screen.render();
  root.replaceChildren();

  root.append(el("p", "status", model.status));
  root.append(el("h1", "title", model.title));

  const list = el("div", "tree");
  model.rows.forEach((row, i) => {
    const classes = ["row"];
    if (row.isGroup) classes.push("is-group");
    if (i === model.selectedIndex) classes.push("is-selected");
    const button = line(row.prefix, row.name, classes.join(" "), "button");
    button.addEventListener("click", () => {
      screen.tapRow(i);
      draw();
    });
    list.append(button);
    for (const d of row.detail) {
      list.append(line(row.detailPrefix + "　", d, "detail"));
    }
  });
  root.append(list);

  root.append(el("p", "description", model.description));
}

draw();
