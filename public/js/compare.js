const compareElement = (id) => document.getElementById(`compare-${id}`);
const compareSeason = compareElement("season");
const compareStatus = compareElement("status");
const compareRetry = compareElement("retry");
const compareResults = compareElement("results");
const comparePicker = compareElement("picker");
const compareSearch = compareElement("search");
const changeButtons = [compareElement("change-a"), compareElement("change-b")];
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const positions = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };
const metricDefinitions = [
    { key: "goals", label: "Goals Scored" },
    { key: "assists", label: "Assists" },
    { key: "matchesPlayed", label: "Matches Played" },
    { key: "passAccuracy", label: "Pass Accuracy", max: 100, unit: "%",
        reason: "Pass Accuracy requires total pass attempts, which are unavailable in this dataset." },
    { key: "shots", label: "Shots",
        reason: "Shots are unavailable when any recorded appearance lacks shot data." },
    { key: "shotsOnTarget", label: "Shots on Target",
        reason: "Shots on Target are unavailable when any recorded appearance lacks shots-on-target data." },
    { key: "averageRating", label: "Average Rating", max: 10,
        reason: "Average Rating requires a recorded rating for every appearance." },
    { key: "yellowCards", label: "Yellow Cards" },
];

let players = [];
let selected = [null, null];
let activeSlot = 0;
let pending;
let retryAction;

function compareNode(tag, className, text = "") {
    const item = document.createElement(tag);
    item.className = className;
    item.textContent = text;
    return item;
}

function compareMessage(text, retry) {
    compareStatus.textContent = text;
    compareStatus.hidden = !text;
    retryAction = retry;
    compareRetry.hidden = !retry;
}

// ยกเลิกคำขอก่อนหน้าเพื่อไม่ให้ผลของผู้เล่นหรือฤดูกาลเดิมแสดงทับผลล่าสุด
function nextCompareRequest() {
    pending?.abort();
    pending = new AbortController();
    compareResults.hidden = true;
    return pending.signal;
}

async function compareJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to load comparison data.");
    }
    return response.json();
}

function playerDetails(player) {
    return [player.team, positions[player.position] ?? player.position].filter(Boolean).join(" · ");
}

function renderCards(cards = selected) {
    cards.forEach((player, slot) => {
        const side = slot === 0 ? "a" : "b";
        compareElement(`name-${side}`).textContent = player?.name ?? `Player ${side.toUpperCase()}`;
        compareElement(`team-${side}`).textContent = player ? playerDetails(player) : "Choose a player";
        compareElement(`avatar-${side}`).textContent = player
            ? player.name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase()
            : side.toUpperCase();
    });
}

// ให้ค้นหาชื่อผู้เล่นได้แม้พิมพ์โดยไม่ใส่เครื่องหมายกำกับเสียง
function searchable(value) {
    return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function renderPlayerOptions() {
    const query = searchable(compareSearch.value.trim());
    const matches = players.filter((player) => searchable(
        `${player.name} ${player.fullName} ${player.team}`
    ).includes(query));
    compareElement("picker-status").textContent = matches.length
        ? `${matches.length} players found`
        : "No players match your search.";
    const choices = matches.map((player) => {
        const item = compareNode("li", "");
        const button = compareNode("button", "", player.name);
        button.type = "button";
        button.disabled = player.id === selected[1 - activeSlot]?.id;
        const detail = button.disabled ? " · Selected on the other side" : "";
        button.append(compareNode("small", "", playerDetails(player) + detail));
        button.addEventListener("click", () => {
            selected[activeSlot] = player;
            comparePicker.close();
            renderCards();
            loadComparison();
        });
        item.append(button);
        return item;
    });
    compareElement("options").replaceChildren(...choices);
}

function openPlayerPicker(slot) {
    activeSlot = slot;
    compareElement("picker-title").textContent = `Choose Player ${slot === 0 ? "A" : "B"}`;
    compareSearch.value = "";
    renderPlayerOptions();
    comparePicker.showModal();
    compareSearch.focus();
}

// ค่าที่หายไปต้องมีคำอธิบายและไม่มีแท่ง เพื่อให้แยกจากค่าศูนย์ได้ชัดเจน
function renderMetricValue(player, slot, value, metric, scale, noteId) {
    const side = slot === 0 ? "left" : "right";
    const cell = compareNode("div", `compare-value compare-${side}`);
    const valueText = value == null ? "N/A" : numberFormat.format(value) + (metric.unit ?? "");
    const label = compareNode("strong", value == null ? "compare-unavailable" : "", valueText);
    cell.setAttribute("role", "group");
    cell.setAttribute("aria-label", player.name);
    if (value == null) {
        label.title = metric.reason;
        cell.setAttribute("aria-describedby", noteId);
    } else {
        const track = compareNode("span", "compare-track");
        const fill = compareNode("span", "compare-fill");
        track.setAttribute("aria-hidden", "true");
        fill.style.width = `${value / scale * 100}%`;
        track.append(fill);
        cell.append(label, track);
        return cell;
    }
    cell.append(label);
    return cell;
}

function renderComparison(data) {
    const stats = selected.map((player) => data.players.find(({ id }) => id === player.id).metrics);
    const notes = [];
    const rows = metricDefinitions.map((metric) => {
        const values = stats.map((metrics) => metrics[metric.key]);
        // ใช้สเกลเดียวกันทั้งสองฝั่งเพื่อให้ความยาวแท่งสะท้อนสัดส่วนของค่าจริง
        const scale = metric.max ?? Math.max(1, ...values.filter((value) => value != null));
        const noteId = `compare-note-${metric.key}`;
        if (values.some((value) => value == null)) {
            const note = compareNode("p", "", metric.reason);
            note.id = noteId;
            notes.push(note);
        }
        const row = compareNode("section", "compare-metric");
        const heading = compareNode("h3", "", metric.label);
        heading.id = `compare-metric-${metric.key}`;
        row.setAttribute("aria-labelledby", heading.id);
        row.append(heading, ...values.map((value, slot) =>
            renderMetricValue(selected[slot], slot, value, metric, scale, noteId)));
        return row;
    });
    compareElement("metrics").replaceChildren(...rows);
    compareElement("notes").replaceChildren(...notes);
    compareElement("notes").hidden = !notes.length;
    compareResults.hidden = false;
}

async function loadComparison() {
    const signal = nextCompareRequest();
    if (selected.some((player) => !player)) {
        compareMessage("Choose two different players to compare.");
        return;
    }
    compareMessage("Loading comparison…");
    const params = new URLSearchParams({
        seasonId: compareSeason.value, playerA: selected[0].id, playerB: selected[1].id,
    });
    try {
        const data = await compareJson(`/api/compare/players?${params}`, signal);
        if (signal.aborted) return;
        renderComparison(data);
        compareMessage("");
    } catch (error) {
        if (!signal.aborted) compareMessage(error.message, loadComparison);
    }
}

async function loadSeasonPlayers() {
    const signal = nextCompareRequest();
    changeButtons.forEach((button) => { button.disabled = true; });
    if (comparePicker.open) comparePicker.close();
    renderCards([null, null]);
    compareMessage("Loading players for this season…");
    try {
        const params = new URLSearchParams({ seasonId: compareSeason.value });
        const data = await compareJson(`/api/compare/players/options?${params}`, signal);
        if (signal.aborted) return;
        players = data.players;
        // คงผู้เล่นที่ยังมีข้อมูลในฤดูกาลใหม่ และล้างเฉพาะฝั่งที่ต้องเลือกใหม่
        selected = selected.map((previous) => players.find(({ id }) => id === previous?.id) ?? null);
        renderCards();
        if (players.length < 2) {
            compareMessage(players.length ? "Only one player has recorded appearances for this season."
                : "No players have recorded appearances for this season.");
            return;
        }
        changeButtons.forEach((button) => { button.disabled = false; });
        await loadComparison();
    } catch (error) {
        if (!signal.aborted) compareMessage(error.message, loadSeasonPlayers);
    }
}

async function loadCompareSeasons() {
    const signal = nextCompareRequest();
    compareMessage("Loading seasons…");
    try {
        const seasons = await compareJson("/api/analytics/filters", signal);
        if (signal.aborted) return;
        if (!seasons.length) {
            compareSeason.replaceChildren(new Option("No seasons available", ""));
            compareMessage("No seasons are available.");
            return;
        }
        compareSeason.replaceChildren(...seasons.map(({ id, label }) => new Option(label, id)));
        compareSeason.disabled = false;
        await loadSeasonPlayers();
    } catch (error) {
        if (!signal.aborted) compareMessage(error.message, loadCompareSeasons);
    }
}

compareSeason.addEventListener("change", loadSeasonPlayers);
compareRetry.addEventListener("click", () => retryAction?.());
compareSearch.addEventListener("input", renderPlayerOptions);
changeButtons.forEach((button, slot) => button.addEventListener("click", () => openPlayerPicker(slot)));
loadCompareSeasons();
