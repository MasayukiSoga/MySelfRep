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

function draw(): void {
  const root = document.getElementById("app");
  if (!root) return;
  const model = screen.render();
  root.replaceChildren();

  root.append(el("p", "status", model.status));
  root.append(el("h1", "title", model.title));

  for (const line of model.body) {
    root.append(el("p", "line", line || " "));
  }

  const list = el("div", "options");
  model.options.forEach((label, i) => {
    const selected = i === model.selectedIndex;
    const button = el("button", selected ? "option is-selected" : "option", `${selected ? "▶" : "　"} ${i + 1}. ${label}`);
    button.addEventListener("click", () => {
      screen.tapOption(i);
      draw();
    });
    list.append(button);
  });
  if (model.canGoBack) {
    const back = el("button", "option back", "　 0. 戻る");
    back.addEventListener("click", () => {
      screen.tapBack();
      draw();
    });
    list.append(back);
  }
  root.append(list);

  if (model.description) {
    root.append(el("p", "description", model.description));
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "0" || e.key === "Escape" || e.key === "Backspace") {
    screen.tapBack();
  } else if (/^[1-9]$/.test(e.key)) {
    screen.tapOption(Number(e.key) - 1);
  } else {
    return;
  }
  draw();
});

draw();
