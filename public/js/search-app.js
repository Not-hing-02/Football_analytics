// ==========================================
// 1. ตัวแปรสถานะและค่าคงที่ของหน้า Search
// ==========================================
let searchResults = { teams: [], players: [], matches: [] };
let activeFilter = "all"; // 'all' | 'teams' | 'players' | 'matches'
let currentQuery = "";    // เก็บคำค้นหาล่าสุดไว้ใช้ตอนสลับ Tab
let currentPage = 1;      // หน้าปัจจุบันสำหรับโหมดหมวดเดี่ยว

const ALL_LIMIT = 10;     // หมวด ALL แสดงหมวดละไม่เกิน 10 card
const PAGE_SIZE = 15;     // หมวดเดี่ยวแสดงหน้าละ 15 card

// ==========================================
// 2. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") || "";
    const initialSeason = params.get("season") || "all";

    initSearchForm(initialQuery);
    initSeasonListener();
    initFilterTabs();
    initCardNavigation();

    const listContainer = document.getElementById("search-result-list");
    if (listContainer) listContainer.innerHTML = "";

    // กรณีเปิดหน้า Search เปล่าๆ -> ดึงรายการ seasons จาก DB มาใส่ Dropdown ก่อน
    if (!initialQuery.trim()) {
        await loadSeasonsOnly(initialSeason);
        return;
    }

    const validation = validateSearchInput(initialQuery);
    if (!validation.valid) {
        await loadSeasonsOnly(initialSeason);
        showInvalidSearchState(validation.message);
    } else {
        await fetchSearchResults(validation.value, initialSeason);
    }
});

// อัปเดตสถานะปุ่มหัวใจทันทีเมื่อมีการกด Favorite/Unfavorite
document.addEventListener("favoriteschange", () => {
    document.querySelectorAll("#search-result-list button[data-fav-id]").forEach((btn) => {
        const type = btn.dataset.favType;
        const id = Number(btn.dataset.favId);
        if (favoriteIds[type]) {
            btn.setAttribute("aria-pressed", String(favoriteIds[type].has(id)));
        }
    });
});

// ตั้งค่าช่องค้นหาและผูก Event การกด Submit
function initSearchForm(initialQuery) {
    const searchInput = document.getElementById("search");
    const searchForm = document.querySelector(".search-form");

    if (searchInput) {
        searchInput.value = initialQuery;
        searchInput.addEventListener("input", () => {
            searchInput.setCustomValidity("");
            searchInput.style.borderColor = "";
        });
    }

    if (searchForm) {
        searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            triggerSearch();
        });
    }
}

// ผูก Event เมื่อเปลี่ยนค่าใน Dropdown ฤดูกาล
function initSeasonListener() {
    const seasonSelect = document.getElementById("season-select");
    if (!seasonSelect) return;

    seasonSelect.addEventListener("change", () => {
        const searchInput = document.getElementById("search");
        if (searchInput && searchInput.value.trim()) {
            triggerSearch();
        }
    });
}

// นำรายการ seasons จาก Database มาสร้าง <option> ใน Dropdown
function populateSeasonSelect(seasons, selectedVal = "all") {
    const seasonSelect = document.getElementById("season-select");
    if (!seasonSelect || !Array.isArray(seasons)) return;

    const validVals = new Set(["all", ...seasons.map((s) => String(s.season_id))]);
    const activeVal = validVals.has(String(selectedVal)) ? String(selectedVal) : "all";

    const optionsHtml = [
        `<option value="all" ${activeVal === "all" ? "selected" : ""}>All seasons</option>`,
        ...seasons.map((s) => {
            const val = String(s.season_id);
            return `<option value="${val}" ${activeVal === val ? "selected" : ""}>${s.label}</option>`;
        })
    ];

    seasonSelect.innerHTML = optionsHtml.join("");
}

// ดึงเฉพาะรายการ seasons จาก Database เมื่อเปิดหน้า Search โดยยังไม่ค้นหา
async function loadSeasonsOnly(selectedVal = "all") {
    try {
        const res = await fetch("/api/search");
        const data = await res.json();
        if (data.success && data.seasons) {
            populateSeasonSelect(data.seasons, selectedVal);
        }
    } catch (error) {
        console.error("Failed to load seasons from DB:", error);
    }
}

// ผูก Event สำหรับปุ่มสลับหมวดหมู่ All / Teams / Players / Matches
function initFilterTabs() {
    const tabButtons = document.querySelectorAll(".filter-tabs .tab-btn");

    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            switchFilterTab(btn.dataset.filter);
        });
    });
}

// ฟังก์ชันกลางสำหรับสลับ Tab (ใช้ทั้งตอนกด Tab ด้านบน และกดปุ่ม See more ข้างหมวด)
function switchFilterTab(filterName) {
    const tabButtons = document.querySelectorAll(".filter-tabs .tab-btn");
    tabButtons.forEach((b) => {
        b.classList.toggle("active", b.dataset.filter === filterName);
    });
    activeFilter = filterName;
    currentPage = 1;
    renderSearchResults();
}

// จัดการคลิกที่ตัว Card เพื่อเปลี่ยนหน้าไปดูรายละเอียด (ยกเว้นเมื่อกดปุ่มหัวใจ)
function initCardNavigation() {
    const listContainer = document.getElementById("search-result-list");
    if (!listContainer) return;

    listContainer.addEventListener("click", (e) => {
        if (e.target.closest("button[data-fav-id]") || e.target.closest(".page-btn")) {
            return;
        }

        const seeMoreBtn = e.target.closest(".category-see-more");
        if (seeMoreBtn) {
            e.preventDefault();
            switchFilterTab(seeMoreBtn.dataset.targetFilter);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        const card = e.target.closest(".list-item[data-href]");
        if (card) {
            window.location.href = card.dataset.href;
        }
    });
}

// ==========================================
// 3. จัดการการค้นหาและดึงข้อมูลจาก API
// ==========================================

function showInvalidSearchState(message) {
    const searchInput = document.getElementById("search");
    const heading = document.getElementById("result-heading");
    const stateMsg = document.getElementById("search-state");
    const listContainer = document.getElementById("search-result-list");

    showSearchValidationError(searchInput, message);

    if (heading) heading.textContent = "Invalid search keyword";
    if (stateMsg) {
        stateMsg.textContent = message;
        stateMsg.hidden = false;
    }
    if (listContainer) listContainer.innerHTML = "";
    updateTabCounts(0, 0, 0);
}

function triggerSearch() {
    const searchInput = document.getElementById("search");
    const seasonSelect = document.getElementById("season-select");

    const validation = validateSearchInput(searchInput?.value || "");
    if (!validation.valid) {
        showInvalidSearchState(validation.message);
        return;
    }

    const q = validation.value;
    searchInput.value = q;

    const season = seasonSelect?.value || "all";
    const newUrl = `${window.location.pathname}?q=${encodeURIComponent(q)}&season=${encodeURIComponent(season)}`;

    currentPage = 1;
    window.history.replaceState({}, "", newUrl);
    fetchSearchResults(q, season);
}

async function fetchSearchResults(query, season) {
    const heading = document.getElementById("result-heading");
    const stateMsg = document.getElementById("search-state");
    const listContainer = document.getElementById("search-result-list");

    currentQuery = query;
    currentPage = 1;
    heading.textContent = `Searching for "${query}"...`;
    stateMsg.hidden = true;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&season=${encodeURIComponent(season)}`);
        const data = await res.json();

        if (data.seasons) {
            populateSeasonSelect(data.seasons, season);
        }

        if (!res.ok || !data.success) {
            heading.textContent = `Results for "${query}"`;
            stateMsg.textContent = data.message || "Unable to complete search.";
            stateMsg.hidden = false;
            listContainer.innerHTML = "";
            updateTabCounts(0, 0, 0);
            return;
        }

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
            stateMsg.textContent = "No results found. Try searching for another team, player, or match.";
            stateMsg.hidden = false;
            listContainer.innerHTML = "";
        } else {
            stateMsg.hidden = true;
            renderSearchResults();
        }
    } catch (error) {
        console.error("Search fetch error:", error);
        heading.textContent = `Results for "${query}"`;
        stateMsg.textContent = "Server connection error. Please try again.";
        stateMsg.hidden = false;
        listContainer.innerHTML = "";
        updateTabCounts(0, 0, 0);
    }
}

// ==========================================
// 4. สร้างและอัปเดต UI ผลลัพธ์การค้นหา
// ==========================================

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

function renderSearchResults() {
    const listContainer = document.getElementById("search-result-list");
    const { teams, players, matches } = searchResults;
    const total = teams.length + players.length + matches.length;

    if (total === 0) {
        listContainer.innerHTML = "";
        return;
    }

    updateResultHeading(teams.length, players.length, matches.length);

    // โหมด ALL: แสดงหมวดละไม่เกิน 10 card + ปุ่ม See more ด้านขวา
    if (activeFilter === "all") {
        const sections = [];
        if (teams.length > 0) sections.push(renderTeamsCategory(teams.slice(0, ALL_LIMIT), true));
        if (players.length > 0) sections.push(renderPlayersCategory(players.slice(0, ALL_LIMIT), true));
        if (matches.length > 0) sections.push(renderMatchesCategory(matches.slice(0, ALL_LIMIT), true));
        listContainer.innerHTML = sections.join("");
        return;
    }

    // โหมดหมวดเดี่ยว (Teams / Players / Matches): แสดงหน้าละ 15 card + Pagination
    const categoryMap = {
        teams:   { items: teams,   render: (slice) => renderTeamsCategory(slice, false) },
        players: { items: players, render: (slice) => renderPlayersCategory(slice, false) },
        matches: { items: matches, render: (slice) => renderMatchesCategory(slice, false) }
    };

    const selected = categoryMap[activeFilter];
    if (!selected || selected.items.length === 0) {
        listContainer.innerHTML = `<p style="color:#6b7280;">No items in this category.</p>`;
        return;
    }

    const totalPages = Math.max(1, Math.ceil(selected.items.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageSlice = selected.items.slice(start, start + PAGE_SIZE);

    listContainer.innerHTML = `
        ${selected.render(pageSlice)}
        ${renderPagination(currentPage, totalPages, selected.items.length)}
    `;

    bindPaginationEvents(totalPages);
}

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

// ปุ่มหัวใจ Favorite ทางขวาของ Card (ใช้กับ Teams และ Players)
function renderHeartButton(type, id, labelName) {
    const isFav = favoriteIds[type]?.has(Number(id)) || false;
    const btnClass = type === "teams" ? "standings-heart" : "player-heart";

    return `
        <button
            type="button"
            class="${btnClass} card-fav-btn"
            data-fav-type="${type}"
            data-fav-id="${id}"
            aria-label="Favorite ${labelName}"
            aria-pressed="${isFav}"
        >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67
                    l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78
                    L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/>
            </svg>
        </button>
    `;
}

// หัวข้อหมวดพร้อมปุ่ม See more ทางขวา (แสดงเฉพาะในโหมด ALL)
function renderCategoryHeader(title, filterKey, totalCount, isAllMode) {
    const seeMoreHtml = isAllMode
        ? `<button type="button" class="category-see-more" data-target-filter="${filterKey}">
               See more (${totalCount}) &rarr;
           </button>`
        : "";

    return `
        <div class="category-header">
            <h4>${title}</h4>
            ${seeMoreHtml}
        </div>
    `;
}

// สร้าง HTML หมวด Teams
function renderTeamsCategory(teams, isAllMode) {
    return `
        <div class="category teams-list">
            ${renderCategoryHeader("Teams", "teams", searchResults.teams.length, isAllMode)}
            ${teams.map((team) => `
                <div class="list-item team-row is-clickable" data-href="teams.html?id=${team.team_id}">
                    ${createTeamLogo(team.team_id, true).outerHTML}
                    <div class="info">
                        <a href="teams.html?id=${team.team_id}" class="header-info">${team.team_name} (${team.short_name})</a>
                        <p class="detail-info">${team.home_stadium} · ${team.city}</p>
                    </div>
                    <div class="card-action">
                        ${renderHeartButton("teams", team.team_id, team.team_name)}
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// สร้าง HTML หมวด Players
function renderPlayersCategory(players, isAllMode) {
    return `
        <div class="category players-list">
            ${renderCategoryHeader("Players", "players", searchResults.players.length, isAllMode)}
            ${players.map((player) => `
                <div class="list-item player-row is-clickable" data-href="players.html?id=${player.player_id}">
                    <img src="assets/img.jpg" alt="${player.display_name}">
                    <div class="info">
                        <a href="players.html?id=${player.player_id}" class="header-info">${player.display_name} (${player.player_name})</a>
                        <p class="detail-info">${player.team_name} · ${player.position}</p>
                    </div>
                    <div class="card-action">
                        ${renderHeartButton("players", player.player_id, player.display_name)}
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// สร้าง HTML หมวด Matches
function renderMatchesCategory(matches, isAllMode) {
    return `
        <div class="category matches-list">
            ${renderCategoryHeader("Matches", "matches", searchResults.matches.length, isAllMode)}
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
                    <div class="list-item matche-row is-clickable" data-href="matches.html?id=${match.match_id}">
                        <div class="info">
                            <a href="matches.html?id=${match.match_id}" class="header-info">${match.home_team_name} vs ${match.away_team_name} (${scoreOrStatus})</a>
                            <p class="detail-info">Season ${match.season_label} · MW ${match.matchweek} · ${dateStr}</p>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

// สร้างแถบ Pagination สำหรับโหมดหมวดเดี่ยว (15 card ต่อหน้า)
function renderPagination(page, totalPages, totalItems) {
    if (totalPages <= 1) return "";

    return `
        <div class="search-pagination">
            <button type="button" class="page-btn" id="search-prev-btn" ${page <= 1 ? "disabled" : ""}>
                &larr; Previous
            </button>
            <span class="page-info">Page ${page} of ${totalPages} (${totalItems} results)</span>
            <button type="button" class="page-btn" id="search-next-btn" ${page >= totalPages ? "disabled" : ""}>
                Next &rarr;
            </button>
        </div>
    `;
}

function bindPaginationEvents(totalPages) {
    const prevBtn = document.getElementById("search-prev-btn");
    const nextBtn = document.getElementById("search-next-btn");

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                renderSearchResults();
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderSearchResults();
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        });
    }
}