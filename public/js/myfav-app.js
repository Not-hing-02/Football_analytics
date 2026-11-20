// ==========================================
// 1. ตัวแปรสถานะและค่าคงที่ของหน้า My Favorites
// ==========================================
let currentFilter = "teams"; // 'teams' | 'players'
let cachedFavData = { teams: [], players: [] };

// ไอคอนรูปหัวใจสีแดงสำหรับปุ่มยกเลิกรายการโปรดบนการ์ด
const HEART_ICON_SVG = `
    <svg class="heart-icon" width="50" height="50" viewBox="0 0 24 24" fill="red" xmlns="http://www.w3.org/2000/svg" style="cursor:pointer;">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
`;

// ==========================================
// 2. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    setupFilterTabs();
    loadMyFavorites(2026);
});

// ตั้งค่าปุ่มสลับแท็บ Favorite Teams / Favorite Players
function setupFilterTabs() {
    const tabButtons = document.querySelectorAll(".filter-tabs .tab-btn");

    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
            renderFavorites();
        });
    });
}

// ==========================================
// 3. ดึงข้อมูลรายการโปรดจาก Backend API
// ==========================================
async function loadMyFavorites(seasonId) {
    const teamIds = getFavorites("teams");
    const playerIds = getFavorites("players");

    try {
        const url = `/api/myfav?season=${seasonId}&teams=${teamIds.join(",")}&players=${playerIds.join(",")}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            cachedFavData = {
                teams: data.teams,
                players: data.players
            };
            renderFavorites();
        }
    } catch (error) {
        console.error("Error loading favorites:", error);
    }
}

// ==========================================
// 4. สร้างและแสดงผลการ์ดรายการโปรดตามแท็บที่เลือก
// ==========================================
function renderFavorites() {
    const container = document.querySelector(".fav-content");
    if (!container) return;

    container.innerHTML = currentFilter === "teams"
        ? renderFavoriteTeams(cachedFavData.teams)
        : renderFavoritePlayers(cachedFavData.players);
}

// สร้าง HTML การ์ดทีมโปรด
function renderFavoriteTeams(teams) {
    if (teams.length === 0) {
        return `<p style="color:#6b7280; grid-column: 1 / -1;">No favorite teams in the list yet</p>`;
    }

    return teams.map((team) => `
        <div class="fav-card team" data-id="${team.team_id}">
            <span data-fav-type="teams" data-fav-id="${team.team_id}" data-remove-card="true">
                ${HEART_ICON_SVG}
            </span>
            <img class="fav-photo" src="assets/img.jpg" alt="${team.team_name}">
            <div class="info team">
                <p class="team-name">${team.team_name}</p>
                <p class="stadium">${team.home_stadium}</p>
            </div>
        </div>
    `).join("");
}

// สร้าง HTML การ์ดนักเตะโปรด
function renderFavoritePlayers(players) {
    if (players.length === 0) {
        return `<p style="color:#6b7280; grid-column: 1 / -1;">No favorite players in the list yet</p>`;
    }

    return players.map((player) => `
        <div class="fav-card player" data-id="${player.player_id}">
            <span data-fav-type="players" data-fav-id="${player.player_id}" data-remove-card="true">
                ${HEART_ICON_SVG}
            </span>
            <img class="fav-photo" src="assets/img.jpg" alt="${player.display_name}">
            <div class="info player">
                <p class="player-name">${player.display_name}</p>
                <p class="player-detail">${player.team_name} • ${player.position}</p>
            </div>
        </div>
    `).join("");
}