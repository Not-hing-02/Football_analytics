import { initPlayerComparison } from "./compare.js";
import { initTeamComparison } from "./compare-teams.js";

const modes = ["teams", "players"];
const tabs = modes.map((mode) => document.getElementById(`tab-${mode}`));
const panels = modes.map((mode) => document.getElementById(`panel-${mode}`));
const initialized = new Set();

function activateMode(mode) {
    const picker = document.getElementById("compare-picker");
    if (picker.open) picker.close();
    tabs.forEach((tab, index) => {
        const active = modes[index] === mode;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[index].hidden = !active;
    });
    // เริ่มแต่ละโหมดเพียงครั้งเดียว เพื่อเก็บตัวเลือกเดิมและไม่เรียก API ซ้ำทุกครั้งที่สลับ
    if (!initialized.has(mode)) {
        initialized.add(mode);
        if (mode === "teams") initTeamComparison();
        else initPlayerComparison();
    }
}

tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateMode(modes[index]));
    tab.addEventListener("keydown", (event) => {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
        activateMode(modes[next]);
        tabs[next].focus();
    });
});

const entryMode = new URLSearchParams(window.location.search).get("mode");
activateMode(entryMode === "players" ? "players" : "teams");
