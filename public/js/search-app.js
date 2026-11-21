// ==========================================
// 1. ตัวแปรสถานะและค่าคงที่ของหน้า Search
// ==========================================
let searchResults = { teams: [], players: [], matches: [] };
let activeFilter = "all"; // 'all' | 'teams' | 'players' | 'matches'
let currentQuery = "";    // เก็บคำค้นหาล่าสุดไว้ใช้ตอนสลับ Tab

const SEASONS = [
    { val: "all", label: "All seasons" },
    { val: "2026-27", label: "2026/27" },
    { val: "2025-26", label: "2025/26" },
    { val: "2024-25", label: "2024/25" },
    { val: "2023-24", label: "2023/24" },
    { val: "2022-23", label: "2022/23" },
    { val: "2021-22", label: "2021/22" }
];

// ==========================================
// 2. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") || "";
    const initialSeason = params.get("season") || "all";

    initSearchForm(initialQuery);
    initSeasonSelect(initialSeason);
    initFilterTabs();

    if (initialQuery) {
        fetchSearchResults(initialQuery, initialSeason);
    } else {
        const listContainer = document.getElementById("search-result-list");
        if (listContainer) listContainer.innerHTML = "";
    }
});

// ตั้งค่าช่องค้นหาและผูก Event การกด Submit
function initSearchForm(initialQuery) {
    const searchInput = document.getElementById("search");
    const searchForm = document.querySelector(".search-form");

    if (searchInput) searchInput.value = initialQuery;

    if (searchForm) {
        searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            triggerSearch();
        });
    }
}

// สร้างตัวเลือกฤดูกาลใน Dropdown และผูก Event เมื่อเปลี่ยนค่า
function initSeasonSelect(selectedVal) {
    const seasonSelect = document.getElementById("season-select");
    if (!seasonSelect) return;

    seasonSelect.innerHTML = SEASONS
        .map((s) => `<option value="${s.val}" ${s.val === selectedVal ? "selected" : ""}>${s.label}</option>`)
        .join("");

    seasonSelect.addEventListener("change", () => {
        triggerSearch();
    });
}

// ผูก Event สำหรับปุ่มสลับหมวดหมู่ All / Teams / Players / Matches
function initFilterTabs() {
    const tabButtons = document.querySelectorAll(".filter-tabs .tab-btn");

    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            activeFilter = btn.dataset.filter;
            renderSearchResults();
        });
    });
}

// ==========================================
// 3. จัดการการค้นหาและดึงข้อมูลจาก API
// ==========================================

// อัปเดต URL Query String และเริ่มดึงข้อมูลใหม่
function triggerSearch() {
    const q = document.getElementById("search").value.trim();
    const season = document.getElementById("season-select").value;
    const newUrl = `${window.location.pathname}?q=${encodeURIComponent(q)}&season=${encodeURIComponent(season)}`;

    window.history.replaceState({}, "", newUrl);
    fetchSearchResults(q, season);
}

// ดึงผลลัพธ์การค้นหาจาก Backend API
async function fetchSearchResults(query, season) {
    const heading = document.getElementById("result-heading");
    const stateMsg = document.getElementById("search-state");
    const listContainer = document.getElementById("search-result-list");

    currentQuery = query;

    // กรณีช่องค้นหาว่างเปล่า
    if (!query) {
        heading.textContent = "Enter a keyword to search";
        stateMsg.hidden = true;
        listContainer.innerHTML = "";
        updateTabCounts(0, 0, 0);
        return;
    }

    heading.textContent = `Searching for "${query}"...`;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&season=${encodeURIComponent(season)}`);
        const data = await res.json();

        if (!data.success) return;

        searchResults = {
            teams: data.teams || [],
            players: data.players || [],
            matches: data.matches || []
        };

        const { teams, players, matches } = searchResults;
        const total = teams.length + players.length + matches.length;

        updateTabCounts(teams.length, players.length, matches.length);

        if (total === 0) {
            heading.textContent = `Results for "${query}"`;
            stateMsg.hidden = false;
            listContainer.innerHTML = "";
        } else {
            stateMsg.hidden = true;
            renderSearchResults();
        }
    } catch (error) {
        console.error("Search fetch error:", error);
    }
}

// ==========================================
// 4. สร้างและอัปเดต UI ผลลัพธ์การค้นหา
// ==========================================

// อัปเดตตัวเลขจำนวนผลลัพธ์บนปุ่ม Tab ทั้ง 4 ปุ่ม
function updateTabCounts(teamsCount, playersCount, matchesCount) {
    const total = teamsCount + playersCount + matchesCount;
    const setTabText = (filter, label) => {
        const btn = document.querySelector(`.filter-tabs .tab-btn[data-filter="${filter}"]`);
        if (btn) btn.textContent = label;
    };

    setTabText("all", `All (${total})`);
    setTabText("teams", `Teams (${teamsCount})`);
    setTabText("players", `Players (${playersCount})`);
    setTabText("matches", `Matches (${matchesCount})`);
}

// แสดงผลรายการค้นหาทั้งหมดตาม Tab ที่เลือกอยู่
function renderSearchResults() {
    const listContainer = document.getElementById("search-result-list");
    const { teams, players, matches } = searchResults;
    const total = teams.length + players.length + matches.length;

    if (total === 0) {
        listContainer.innerHTML = "";
        return;
    }

    updateResultHeading(teams.length, players.length, matches.length);

    const sections = [];
    if ((activeFilter === "all" || activeFilter === "teams") && teams.length > 0) {
        sections.push(renderTeamsCategory(teams));
    }
    if ((activeFilter === "all" || activeFilter === "players") && players.length > 0) {
        sections.push(renderPlayersCategory(players));
    }
    if ((activeFilter === "all" || activeFilter === "matches") && matches.length > 0) {
        sections.push(renderMatchesCategory(matches));
    }

    listContainer.innerHTML = sections.join("") || `<p style="color:#6b7280;">No items in this category.</p>`;
}

// อัปเดตข้อความหัวข้อแสดงจำนวนผลลัพธ์ตาม Tab ปัจจุบัน
function updateResultHeading(teamsCount, playersCount, matchesCount) {
    const heading = document.getElementById("result-heading");
    const total = teamsCount + playersCount + matchesCount;

    if (!heading || !currentQuery || total === 0) return;

    const filterMap = {
        all:     { count: total,        suffix: "" },
        teams:   { count: teamsCount,   suffix: " in Teams" },
        players: { count: playersCount, suffix: " in Players" },
        matches: { count: matchesCount, suffix: " in Matches" }
    };

    const current = filterMap[activeFilter] || filterMap.all;
    const unit = current.count === 1 ? "result" : "results";
    heading.textContent = `Showing ${current.count} ${unit} for "${currentQuery}"${current.suffix}`;
}

// สร้าง HTML หมวด Teams
function renderTeamsCategory(teams) {
    return `
        <div class="category teams-list">
            <h4>Teams</h4>
            ${teams.map((team) => `
                <div class="list-item team-row">
                    ${createTeamLogo(team.team_id, true).outerHTML}
                    <div class="info">
                        <a href = "team.html?id=${team.team_id}" class="header-info">${team.team_name} (${team.short_name})</a>
                        <p class="detail-info">${team.home_stadium} · ${team.city}</p>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// สร้าง HTML หมวด Players
function renderPlayersCategory(players) {
    return `
        <div class="category players-list">
            <h4>Players</h4>
            ${players.map((player) => `
                <div class="list-item player-row">
                    <img src="assets/img.jpg" alt="${player.display_name}">
                    <div class="info">
                        <a href = "player.html?id=${player.player_id}" class="header-info">${player.display_name} (${player.player_name})</a>
                        <p class="detail-info">${player.team_name} · ${player.position}</p>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// สร้าง HTML หมวด Matches
function renderMatchesCategory(matches) {
    return `
        <div class="category matches-list">
            <h4>Matches</h4>
            ${matches.map((match) => {
                const scoreOrStatus = match.status === "completed"
                    ? `${match.home_goals} - ${match.away_goals}`
                    : "Scheduled";
                const dateStr = new Date(match.match_date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                });

                return `
                    <div class="list-item matche-row">
                        <div class="info">
                            <a href = "match.html?id=${match.match_id}" class="header-info">${match.home_team_name} vs ${match.away_team_name} (${scoreOrStatus})</a>
                            <p class="detail-info">Season ${match.season_label} · MW ${match.matchweek} · ${dateStr}</p>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}