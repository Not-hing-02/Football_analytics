let players = [];
const tableBody = document.getElementById("player-rows");
const playerSearch = document.getElementById("player-search");
const headerSearch = document.getElementById("search");
const positionFilter = document.getElementById("position-filter");
const teamFilter = document.getElementById("team-filter");
const favoritesButton = document.getElementById("favorites-filter");
const emptyMessage = document.getElementById("no-players");

const storageKey = "football.players.favorites.v1";
let favorites = new Set(["Erling Haaland", "Mohamed Salah"]);
let showFavoritesOnly = false;

// อ่านรายชื่อที่เคยกดหัวใจไว้ในเบราว์เซอร์
try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(stored)) {
        favorites = new Set(stored);
    }
} catch {
    // ถ้าเบราว์เซอร์ปิดพื้นที่จัดเก็บ ยังใช้หัวใจได้ระหว่างเปิดหน้านี้
}

// เติมตัวเลือกในช่อง Position และ Team จากข้อมูลนักเตะ
function addFilterOptions(select, field) {
    const values = [...new Set(players.map(player => player[field]))].sort();

    for (const value of values) {
        select.add(new Option(value, value));
    }
}

// สร้างหนึ่งแถวต่อหนึ่งนักเตะ
const seasonSelect = document.getElementById("detail-season");
const seasonRows = document.getElementById("season-rows");
const seasonEmpty = document.getElementById("season-empty");

let selectedPlayerHistory = [];

function renderSeasonStats() {
    const selectedSeason = seasonSelect.value;
    seasonRows.replaceChildren();

    for (const record of selectedPlayerHistory) {
        const season = record[0];

        // ค่า "" คือแสดงทุกฤดูกาล
        if (selectedSeason && season !== selectedSeason) {
            continue;
        }

        const row = seasonRows.insertRow();

        // สร้างหนึ่งแถวต่อทีม จึงแสดงนักเตะที่ย้ายทีมกลางฤดูกาลได้
        for (const value of record) {
            row.insertCell().textContent = value;
        }
    }

    seasonEmpty.hidden = seasonRows.rows.length > 0;
}

seasonSelect.addEventListener("change", renderSeasonStats);

let historyController;

document.getElementById("player-dialog").addEventListener("close", () => {
    historyController?.abort();
});

async function openPlayerDetails(player) {
    // ยกเลิกคำขอเก่าเมื่อเปิดนักเตะอีกคน
    historyController?.abort();
    const controller = new AbortController();
    historyController = controller;

    const dialog = document.getElementById("player-dialog");
    const summary = document.getElementById("detail-summary");

    document.getElementById("detail-name").textContent = player.name;
    summary.textContent = "กำลังโหลดประวัตินักเตะ...";

    selectedPlayerHistory = [];
    seasonRows.replaceChildren();
    seasonSelect.replaceChildren(new Option("กำลังโหลด...", ""));
    seasonSelect.disabled = true;
    seasonEmpty.hidden = true;

    if (!dialog.open) {
        dialog.showModal();
    }

    try {
        const response = await fetch(
            `/api/players/${player.id}/history`,
            { signal: controller.signal }
        );

        if (!response.ok) {
            throw new Error(`โหลดข้อมูลไม่สำเร็จ (${response.status})`);
        }

        const history = await response.json();

        if (controller.signal.aborted) return;

        // จัดรูปแบบให้ใช้กับ renderSeasonStats() เดิมได้
        selectedPlayerHistory = history.map(record => [
            record.season,
            record.team,
            record.appearances,
            record.goals,
            record.assists,
            record.yellow_cards,
            record.red_cards
        ]);

        seasonSelect.replaceChildren(new Option("ทุกฤดูกาล", ""));

        const seasons = new Set(history.map(record => record.season));
        for (const season of seasons) {
            seasonSelect.add(new Option(season, season));
        }

        summary.textContent = "สถิติพรีเมียร์ลีก แยกตามฤดูกาลและทีม";
        seasonSelect.disabled = history.length === 0;
        renderSeasonStats();
    } catch (error) {
        if (error.name === "AbortError") return;

        summary.textContent = "โหลดข้อมูลไม่สำเร็จ กรุณาปิดแล้วลองเปิดอีกครั้ง";
        seasonSelect.replaceChildren(new Option("โหลดไม่สำเร็จ", ""));
        console.error(error);
    }
}
function addPlayerRow(player) {
    const row = tableBody.insertRow();
    const name = document.createElement("button");
    name.type = "button";
    name.className = "player-name player-detail-button";
    name.setAttribute("aria-haspopup", "dialog");
    name.setAttribute("aria-label", `View details for ${player.name}`);
    name.addEventListener("click", () => openPlayerDetails(player));

    const initial = document.createElement("span");
    initial.className = "player-initial";
    initial.textContent = player.name[0];
    initial.setAttribute("aria-hidden", "true");

    name.append(initial, player.name);
    row.insertCell().append(name);

    for (const field of ["team", "position", "age", "matches", "goals"]) {
        row.insertCell().textContent = player[field] ?? "—";
    }

    const rating = document.createElement("span");
    rating.className = "player-rating";
    rating.textContent = player.rating == null
        ? "—"
        : Number(player.rating).toFixed(1);

    row.insertCell().append(rating);

    const heart = document.createElement("button");
    heart.type = "button";
    heart.className = "player-heart";
    heart.setAttribute("aria-label", "Favorite " + player.name);

    function updateHeart() {
        const selected = favorites.has(player.name);
        heart.textContent = selected ? "♥" : "♡";
        heart.setAttribute("aria-pressed", String(selected));
    }

    updateHeart();
    heart.addEventListener("click", () => {
        if (favorites.has(player.name)) {
            favorites.delete(player.name);
        } else {
            favorites.add(player.name);
        }

        try {
            localStorage.setItem(storageKey, JSON.stringify([...favorites]));
        } catch {
            // ยังเก็บรายการในหน่วยความจำได้จนกว่าจะปิดหน้า
        }

        updateHeart();

        if (showFavoritesOnly) {
            renderPlayers();
            favoritesButton.focus();
        }
    });

    row.insertCell().append(heart);
}

// ใช้ช่องค้นหาและตัวกรองร่วมกัน แล้วแสดงเฉพาะแถวที่ตรงเงื่อนไข
function renderPlayers() {
    const nameQuery = playerSearch.value.trim().toLowerCase();
    const headerQuery = headerSearch.value.trim().toLowerCase();

    const visiblePlayers = players.filter(player => {
        const searchText = [player.name, player.team, player.position]
            .join(" ")
            .toLowerCase();

        return player.name.toLowerCase().includes(nameQuery)
            && searchText.includes(headerQuery)
            && (!positionFilter.value || player.position === positionFilter.value)
            && (!teamFilter.value || player.team === teamFilter.value)
            && (!showFavoritesOnly || favorites.has(player.name));
    });

    tableBody.replaceChildren();
    visiblePlayers.forEach(addPlayerRow);
    emptyMessage.hidden = visiblePlayers.length > 0;
}

playerSearch.addEventListener("input", renderPlayers);
headerSearch.addEventListener("input", renderPlayers);
positionFilter.addEventListener("change", renderPlayers);
teamFilter.addEventListener("change", renderPlayers);

// ให้กด Enter ในช่อง Search ด้านบนแล้วค้นหาอยู่ที่หน้า Players
headerSearch.form?.addEventListener("submit", event => {
    event.preventDefault();
    renderPlayers();
});

favoritesButton.addEventListener("click", () => {
    showFavoritesOnly = !showFavoritesOnly;
    favoritesButton.setAttribute("aria-pressed", String(showFavoritesOnly));
    renderPlayers();
});

async function loadPlayers() {
    emptyMessage.hidden = false;
    emptyMessage.textContent = "กำลังโหลดรายชื่อนักเตะ...";

    try {
        const response = await fetch("/api/players");

        if (!response.ok) {
            throw new Error(`โหลดรายชื่อไม่สำเร็จ (${response.status})`);
        }

        players = await response.json();

        addFilterOptions(positionFilter, "position");
        addFilterOptions(teamFilter, "team");

        emptyMessage.textContent = "ไม่พบนักเตะที่ตรงกับตัวกรอง";
        renderPlayers();
    } catch (error) {
        emptyMessage.hidden = false;
        emptyMessage.textContent =
            "โหลดรายชื่อไม่สำเร็จ กรุณารีเฟรชเพื่อลองอีกครั้ง";

        console.error(error);
    }
}

loadPlayers();