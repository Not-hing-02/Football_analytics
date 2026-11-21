let players = [];
const playersPerPage = 30;
let currentPlayerPage = 1;
const playersPrev = document.getElementById("players-prev");
const playersNext = document.getElementById("players-next");
const playersPageInfo = document.getElementById("players-page-info");
const tableBody = document.getElementById("player-rows");
const playerSearch = document.getElementById("player-search");
const headerSearch = document.getElementById("search");
const positionFilter = document.getElementById("position-filter");
const teamFilter = document.getElementById("team-filter");
const favoritesButton = document.getElementById("favorites-filter");
const emptyMessage = document.getElementById("no-players");

let showFavoritesOnly = false;
document.addEventListener("favoriteschange", renderPlayers);

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
    heart.setAttribute("aria-label", `Favorite ${player.name}`);

    heart.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67
            l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78
            L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/>
    </svg>
`;

    heart.dataset.favType = "players";
    heart.dataset.favId = player.id;
    heart.setAttribute("aria-pressed", String(favoriteIds.players.has(Number(player.id))));

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
            && (!showFavoritesOnly || favoriteIds.players.has(Number(player.id)));
    });

    const totalPlayers = visiblePlayers.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalPlayers / playersPerPage)
    );

    currentPlayerPage = Math.min(
        Math.max(1, currentPlayerPage),
        totalPages
    );

    const start = (currentPlayerPage - 1) * playersPerPage;
    const pagePlayers = visiblePlayers.slice(start, start + playersPerPage);

    tableBody.replaceChildren();
    pagePlayers.forEach(addPlayerRow);

    emptyMessage.hidden = totalPlayers > 0;

    playersPrev.disabled = currentPlayerPage <= 1;
    playersNext.disabled = currentPlayerPage >= totalPages;

    playersPageInfo.textContent =
    `${currentPlayerPage} / ${totalPages} · ${totalPlayers} คน`;
}

function resetPlayerPage() {
    currentPlayerPage = 1;
    renderPlayers();
}

playerSearch.addEventListener("input", resetPlayerPage);
headerSearch.addEventListener("input", resetPlayerPage);
positionFilter.addEventListener("change", resetPlayerPage);
teamFilter.addEventListener("change", resetPlayerPage);

headerSearch.form?.addEventListener("submit", event => {
    event.preventDefault();
    resetPlayerPage();
});

favoritesButton.addEventListener("click", () => {
    showFavoritesOnly = !showFavoritesOnly;
    favoritesButton.setAttribute("aria-pressed", String(showFavoritesOnly));
    resetPlayerPage();
});

playersPrev.addEventListener("click", () => {
    currentPlayerPage--;
    renderPlayers();
});

playersNext.addEventListener("click", () => {
    currentPlayerPage++;
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
