// ==========================================
// 1. ตัวแปรสถานะหลักของหน้า Standings
// ==========================================
let currentSeason = null; // null = ให้ Backend เลือกฤดูกาลล่าสุดจาก DB อัตโนมัติ
let currentFilter = "all"; // 'all' | 'home' | 'away'
let isSeasonInitialized = false;

// ==========================================
// 2. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initStickyHeader();
    initSeasonListener();
    initFilterTabs();
    loadStandings();
});

// ตรวจจับการเลื่อนหน้าจอเพื่อเปลี่ยนสีหัวตารางเมื่อติด Sticky ด้านบน
function initStickyHeader() {
    const sentinel = document.querySelector(".table-sentinel");
    const thead = document.querySelector(".standings-table thead");

    if (!sentinel || !thead) return;

    const observer = new IntersectionObserver(
        ([entry]) => {
            const isStuck = !entry.isIntersecting && entry.boundingClientRect.top < 0;
            thead.classList.toggle("is-stuck", isStuck);
        },
        { threshold: [0] }
    );

    observer.observe(sentinel);
}

// ผูก Event เมื่อเปลี่ยนค่าใน Dropdown ฤดูกาล
function initSeasonListener() {
    const seasonSelect = document.getElementById("season-select");
    if (!seasonSelect) return;

    seasonSelect.addEventListener("change", (e) => {
        currentSeason = Number(e.target.value);
        loadStandings();
    });
}

// นำรายการ seasons จาก Database มาสร้าง <option> ใน Dropdown
function populateSeasonSelect(seasons, activeSeasonId) {
    const seasonSelect = document.getElementById("season-select");
    if (!seasonSelect || !Array.isArray(seasons)) return;

    seasonSelect.innerHTML = seasons
        .map((s) => {
            const selected = Number(s.season_id) === Number(activeSeasonId) ? "selected" : "";
            return `<option value="${s.season_id}" ${selected}>${s.label}</option>`;
        })
        .join("");

    isSeasonInitialized = true;
}

// ผูก Event สำหรับปุ่มสลับตัวกรอง Overview / Home / Away
function initFilterTabs() {
    const tabButtons = document.querySelectorAll(".filter-tabs .tab-btn");

    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
            loadStandings();
        });
    });
}

// ==========================================
// 3. ดึงข้อมูลและอัปเดตตารางคะแนน
// ==========================================
async function loadStandings() {
    try {
        const params = new URLSearchParams({ filter: currentFilter });
        if (currentSeason !== null) {
            params.set("season", String(currentSeason));
        }

        const res = await fetch(`/api/standing?${params.toString()}`);
        const data = await res.json();

        if (!data.success) return;

        currentSeason = Number(data.season_id);

        if (!isSeasonInitialized && data.seasons) {
            populateSeasonSelect(data.seasons, currentSeason);
        }

        updateMetaBar(data);
        renderStandingsTable(data);
    } catch (error) {
        console.error("Error loading standings:", error);
    }
}

// อัปเดตแถบข้อมูลสรุปเหนือตาราง (จำนวนทีม และสถานะฤดูกาล)
function updateMetaBar(data) {
    const teamCountEl = document.querySelector(".table-meta-bar .team-count");
    const seasonStatusEl = document.querySelector(".table-meta-bar .season-status");

    if (teamCountEl) {
        teamCountEl.textContent = `${data.standings.length} Teams`;
    }

    if (seasonStatusEl) {
        seasonStatusEl.textContent = data.is_completed
            ? `Season ${data.season_label} · Final Standings`
            : `Season ${data.season_label} · Matchweek ${data.current_matchweek}`;
    }
}

// สร้างแถวข้อมูลทีมทั้งหมดในตารางคะแนน
function renderStandingsTable(data) {
    const tbody = document.getElementById("standings-list");
    if (!tbody) return;

    tbody.innerHTML = data.standings.map((team, index) => {
        const rank = index + 1;
        const rowClasses = [];

        // กำหนดแถบสีโซน Champions League (อันดับ 1-5) และโซนตกชั้น (อันดับ 18-20)
        if (rank <= 5) rowClasses.push("zone-ucl");
        if (rank >= 18) rowClasses.push("zone-relegation");

        // แสดงไฮไลต์และป้าย CHAMPION เฉพาะอันดับ 1 เมื่อจบฤดูกาลและดูตารางรวม
        const isChampion = rank === 1 && data.is_completed && currentFilter === "all";
        if (isChampion) rowClasses.push("is-champion");

        const championBadge = isChampion
            ? `<span class="badge-champion">CHAMPION</span>`
            : "";

        const gdFormatted = team.gd > 0 ? `+${team.gd}` : team.gd;

        return `
            <tr class="${rowClasses.join(" ")}">
                <td class="col-pos">${rank}</td>
                <td class="col-team">
                    <div class="team-info">
                        ${createTeamLogo(team.team_id).outerHTML}
                        <span class="team-name">${team.team_name}</span>
                        ${championBadge}
                    </div>
                </td>
                <td class="col-played">${team.played}</td>
                <td class="col-won">${team.won}</td>
                <td class="col-drawn">${team.drawn}</td>
                <td class="col-lost">${team.lost}</td>
                <td class="col-gf">${team.gf}</td>
                <td class="col-ga">${team.ga}</td>
                <td class="col-gd">${gdFormatted}</td>
                <td class="col-pts">${team.pts}</td>
            </tr>
        `;
    }).join("");
}