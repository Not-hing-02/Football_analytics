// ==========================================
// 1. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    loadDashboardData(2026); // ดึงข้อมูลฤดูกาล 2026/27
});

// ==========================================
// 2. ดึงข้อมูล Dashboard จาก Backend API
// ==========================================
async function loadDashboardData(seasonId) {
    try {
        const response = await fetch(`/api/dashboard?season=${seasonId}`);
        const data = await response.json();
        console.log(response)

        if (!data.success) {
            console.error("Failed to load dashboard:", data.message);
            return;
        }

        console.log("Data from DB:", data);

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
                <img src="assets/img.jpg" alt="${match.home_team_name}">
                <span>${match.home_team_name}</span>
            </div>
            <div class="match-item match-score">
                <span>${match.home_goals}-${match.away_goals}</span>
            </div>
            <div class="match-item team-side away">
                <img src="assets/img.jpg" alt="${match.away_team_name}">
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

// แสดงส่วนทีมโปรด (รองรับ 3 สถานะ: ยังไม่ล็อกอิน / ไม่มีทีมโปรด / มีทีมโปรด)
function renderFavoriteTeams(favoriteTeams) {
    const favContainer = document.getElementById("favorite-teams-list");
    const favState = document.getElementById("fav-state");
    const seeMoreBtn = document.querySelector(".favorite-teams .see-more");

    if (!favContainer) return;

    currentUser = true;

    // กรณีที่ 1: ผู้ใช้ยังไม่ได้เข้าสู่ระบบ
    if (!currentUser) {
        favState.classList.add("with-blur");
        favState.innerHTML = `
            <p class="message">Not logged in </p>
            <p class="submessage">
                Please <a href="login.html">log in</a> to use this feature
            </p>
        `;
        favState.hidden = false;
        favContainer.hidden = true;
        return;
    }

    // กรณีที่ 2: เข้าสู่ระบบแล้ว แต่ยังไม่มีทีมโปรดที่บันทึกไว้
    if (!favoriteTeams || favoriteTeams.length === 0) {
        favState.hidden = false;
        favContainer.hidden = true;
        return;
    }

    // กรณีที่ 3: เข้าสู่ระบบแล้ว และมีรายการทีมโปรด
    favState.hidden = true;
    favContainer.hidden = false;
    favContainer.innerHTML = favoriteTeams.map((team) => `
        <div class="team-col">
            <img src="${team.logo_url || "assets/img.jpg"}" alt="${team.team_name}">
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

    // ตรวจสอบว่าการ์ดทีมโปรดล้นความกว้างกล่องหรือไม่ เพื่อแสดง/ซ่อนปุ่ม See more
    const checkOverflow = () => {
        if (!seeMoreBtn) return;
        const isOverflow = favContainer.scrollWidth > favContainer.clientWidth;
        seeMoreBtn.hidden = !isOverflow;
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);
}