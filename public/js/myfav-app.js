// ==========================================
// 1. ตัวแปรสถานะและค่าคงที่ของหน้า My Favorites
// ==========================================
let currentFilter = "teams"; // 'teams' | 'players'
let cachedFavData = { teams: [], players: [] };

// ไอคอนรูปหัวใจมาตรฐานเดียวกับหน้า Teams, Players และ Search
const HEART_ICON_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67
            l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78
            L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/>
    </svg>
`;

// ==========================================
// 2. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    setupFilterTabs();

    // อัปเดตรายการใหม่ทุกครั้งที่มีการเพิ่ม/ลบรายการโปรด
    document.addEventListener("favoriteschange", () => loadMyFavorites(2026));
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
    try {
        const response = await fetch(`/api/myfav?season=${seasonId}`);
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
            <button
                type="button"
                class="standings-heart favorite-remove"
                aria-label="Remove favorite ${team.team_name}"
                aria-pressed="true"
                data-fav-type="teams"
                data-fav-id="${team.team_id}"
            >
                ${HEART_ICON_SVG}
            </button>
            ${createTeamLogo(team.team_id, true, "fav-photo").outerHTML}
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
            <button
                type="button"
                class="player-heart favorite-remove"
                aria-label="Remove favorite ${player.display_name}"
                aria-pressed="true"
                data-fav-type="players"
                data-fav-id="${player.player_id}"
            >
                ${HEART_ICON_SVG}
            </button>
            <img class="fav-photo" src="assets/img.jpg" alt="${player.display_name}">
            <div class="info player">
                <p class="player-name">${player.display_name}</p>
                <p class="player-detail">${player.team_name} • ${player.position}</p>
            </div>
        </div>
    `).join("");
}