// ==========================================
// 1. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // รอให้เช็กสถานะ Login เสร็จก่อน ค่อยโหลดข้อมูล Dashboard (เพื่อดึงทีมโปรดของผู้ใช้)
    Promise.resolve(authReady).then(() => loadDashboardData(2026));
});

// ==========================================
// 2. ดึงข้อมูล Dashboard จาก Backend API
// ==========================================
async function loadDashboardData(seasonId) {
    try {
        const response = await fetch(`/api/dashboard?season=${seasonId}`);
        const data = await response.json();

        if (!data.success) {
            console.error("Failed to load dashboard:", data.message);
            return;
        }

        // อัปเดต UI ในแต่ละส่วนของหน้า Dashboard
        renderSeasonBadge(data.season_label, data.season_id);
        renderKpis(data.kpis);
        renderRecentMatches(data.recent_matches);
        renderTopScorers(data.top_scorers);
        renderFavoriteTeams(data.favorite_teams);
    } catch (error) {
        console.error("Error connecting to API:", error);
    }
}

// ==========================================
// 3. ฟังก์ชันสร้างและอัปเดต UI แยกตามส่วน
// ==========================================

// แสดงป้ายชื่อฤดูกาลบน Hero Banner
function renderSeasonBadge(seasonLabel, seasonId) {
    const seasonBadge = document.getElementById("season-badge");
    if (!seasonBadge) return;

    if (seasonLabel) {
        seasonBadge.textContent = `Season ${seasonLabel}`;
    } else if (seasonId) {
        seasonBadge.textContent = `Season ${seasonId}`;
    }
}

// แสดงตัวเลขสถิติหลักใน KPI Cards
function renderKpis(kpis) {
    document.getElementById("kpi-teams").textContent = kpis.total_teams;
    document.getElementById("kpi-players").textContent = kpis.total_players;
    document.getElementById("kpi-played").textContent = kpis.matches_played;
    document.getElementById("kpi-upcoming").textContent = kpis.upcoming;
}

// แสดงรายการผลการแข่งขันล่าสุด
function renderRecentMatches(matches) {
    const matchesContainer = document.getElementById("recent-matches-list");
    if (!matchesContainer) return;

    matchesContainer.innerHTML = matches.map((match) => `
        <div class="match-row">
            <div class="match-item team-side home">
                ${createTeamLogo(match.home_team_id, true).outerHTML}
                <span>${match.home_team_name}</span>
            </div>
            <div class="match-item match-score">
                <span>${match.home_goals}-${match.away_goals}</span>
            </div>
            <div class="match-item team-side away">
                ${createTeamLogo(match.away_team_id, true).outerHTML}
                <span>${match.away_team_name}</span>
            </div>
        </div>
    `).join("");
}

// แสดงตารางอันดับดาวซัลโวสูงสุด 5 อันดับ
function renderTopScorers(scorers) {
    const scorersContainer = document.getElementById("top-scorers-list");
    if (!scorersContainer) return;

    scorersContainer.innerHTML = scorers.map((player, index) => `
        <tr>
            <td class="col-rank">${index + 1}.</td>
            <td class="col-player">
                <div class="player-info">
                    <img class="player-avatar" src="assets/img.jpg" alt="${player.display_name}">
                    <span class="player-name">${player.display_name}</span>
                </div>
            </td>
            <td class="col-goals">${player.total_goals}</td>
        </tr>
    `).join("");
}

// แสดงส่วนทีมโปรด (รองรับทั้ง 3 สถานะ: ยังไม่ล็อกอิน / ไม่มีทีมโปรด / มีทีมโปรด)
function renderFavoriteTeams(favoriteTeams) {
    const favSection = document.getElementById("dashboard-favorites");
    const favContainer = document.getElementById("favorite-teams-list");
    const favState = document.getElementById("fav-state");
    const seeMoreBtn = document.querySelector(".favorite-teams .see-more");
    const loginOverlay = document.querySelector(".favorites-login-overlay, #fav-login-overlay");

    if (!favContainer) return;

    // 1. กรณียังไม่ได้ล็อกอิน -> แสดงหน้ากากเบลอ + ปุ่ม Log in
    if (!currentUser) {
        if (favSection) favSection.classList.add("is-locked");
        if (seeMoreBtn) seeMoreBtn.hidden = true;
        if (loginOverlay) loginOverlay.hidden = false;
        if (favState) {
            favState.classList.add("with-blur");
            favState.innerHTML = `
                <p class="message">Not logged in</p>
                <p class="submessage">
                    Please <a href="login.html">log in</a> to use this feature
                </p>
            `;
            favState.hidden = false;
        }
        favContainer.hidden = true;
        return;
    }

    // 2. ล็อกอินแล้ว -> ปลดล็อกหน้ากากเบลอและแสดงปุ่ม See more
    if (favSection) favSection.classList.remove("is-locked");
    if (loginOverlay) loginOverlay.hidden = true;
    if (seeMoreBtn) seeMoreBtn.hidden = false;
    if (favState) favState.classList.remove("with-blur");

    // 3. ล็อกอินแล้ว แต่ยังไม่มีทีมโปรดที่บันทึกไว้
    if (!favoriteTeams || favoriteTeams.length === 0) {
        if (favState) {
            favState.innerHTML = `
                <p class="message">No favorite team yet</p>
                <p class="submessage">
                    Heart your favorite teams to track their form and stats right here.
                    <a href="teams.html" class="btn-browse-teams">+ Browse Teams</a>
                </p>
            `;
            favState.hidden = false;
        }
        favContainer.hidden = true;
        return;
    }

    // 4. ล็อกอินแล้ว และมีรายการทีมโปรด -> ซ่อนข้อความแจ้งเตือนและแสดงการ์ดทีม
    if (favState) favState.hidden = true;
    favContainer.hidden = false;
    favContainer.innerHTML = favoriteTeams.map((team) => `
        <div class="team-col" onclick="window.location.href='/teams.html?id=${team.team_id}'" style="cursor: pointer;">
            ${createTeamLogo(team.team_id, true).outerHTML}
            <p class="team-name">${team.team_name}</p>
            <p class="overview-result">
                <span class="win">W${team.wins}</span>
                <span>/</span>
                <span class="draw">D${team.draws}</span>
                <span>/</span>
                <span class="lose">L${team.losses}</span>
            </p>
        </div>
    `).join("");
}