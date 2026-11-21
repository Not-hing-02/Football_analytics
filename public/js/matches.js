let matches = [];
let page = 1;
const pageSize = 20;

const rows = document.getElementById("match-rows");
const message = document.getElementById("match-message");
const retry = document.getElementById("match-retry");
const search = document.getElementById("match-search");
const headerSearch = document.getElementById("search");
const season = document.getElementById("match-season");
const team = document.getElementById("match-team");
const statusFilter = document.getElementById("match-status");
const previous = document.getElementById("match-prev");
const next = document.getElementById("match-next");
const pageLabel = document.getElementById("match-page");

const statusLabels = {
    completed: "จบการแข่งขัน",
    scheduled: "โปรแกรมแข่ง",
    live: "กำลังแข่ง ณ เวลาบันทึก"
};

function formatDate(match) {
    if (match.kickoff_utc) {
        return new Intl.DateTimeFormat("th-TH", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Bangkok"
        }).format(new Date(match.kickoff_utc));
    }

    return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeZone: "UTC"
    }).format(new Date(`${match.match_date}T00:00:00Z`))
        + " · เวลาไม่ระบุ";
}

function openDetails(match) {
    document.getElementById("match-detail-title").textContent =
        `${match.home_team} — ${match.away_team}`;

    document.getElementById("match-detail-info").textContent =
        `${match.season} · ${formatDate(match)} · ${match.stadium}`;

    const stats = document.getElementById("match-detail-stats");
    stats.replaceChildren();

    const values = [
        [match.home_goals, "ประตู", match.away_goals],
        [match.ht_home_goals, "ประตูครึ่งแรก", match.ht_away_goals],
        [match.home_shots, "ยิงทั้งหมด", match.away_shots],
        [
            match.home_shots_on_target,
            "ยิงตรงกรอบ",
            match.away_shots_on_target
        ]
    ];

    for (const valuesInRow of values) {
        const row = stats.insertRow();

        for (const value of valuesInRow) {
            row.insertCell().textContent = value ?? "—";
        }
    }

    document.getElementById("match-dialog").showModal();
}

function createMatchRow(match) {
    const row = document.createElement("tr");

    row.insertCell().textContent = formatDate(match);
    row.insertCell().append(createTeamLogo(match.home_id), match.home_team);

    const score = document.createElement("span");
    score.className = "match-score";
    score.textContent = match.status === "scheduled"
        ? "VS"
        : `${match.home_goals ?? "—"} – ${match.away_goals ?? "—"}`;

    row.insertCell().append(score);
    row.insertCell().append(createTeamLogo(match.away_id), match.away_team);

    const status = document.createElement("span");
    status.className = `match-status ${match.status}`;
    status.textContent = statusLabels[match.status] ?? match.status;
    row.insertCell().append(status);

    const details = document.createElement("button");
    details.type = "button";
    details.className = "match-details";
    details.textContent = "View details";
    details.setAttribute("aria-haspopup", "dialog");
    details.setAttribute(
        "aria-label",
        `View ${match.home_team} versus ${match.away_team}`
    );
    details.addEventListener("click", () => openDetails(match));

    row.insertCell().append(details);
    return row;
}

function renderMatches() {
    const query = search.value.trim().toLowerCase();
    const generalQuery = headerSearch.value.trim().toLowerCase();

    const filtered = matches.filter(match => {
        const text = `${match.home_team} ${match.away_team} ${match.stadium}`
            .toLowerCase();

        return String(match.season_id) === season.value
            && text.includes(query)
            && text.includes(generalQuery)
            && (
                !team.value
                || String(match.home_id) === team.value
                || String(match.away_id) === team.value
            )
            && (!statusFilter.value || match.status === statusFilter.value);
    });

    // โปรแกรมแข่งเรียงจากนัดที่ใกล้ที่สุดในข้อมูล
    if (statusFilter.value === "scheduled") {
        filtered.sort((a, b) =>
            a.match_date.localeCompare(b.match_date) || a.id - b.id
        );
    }

    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pages);

    const start = (page - 1) * pageSize;
    rows.replaceChildren(
        ...filtered.slice(start, start + pageSize).map(createMatchRow)
    );

    message.textContent = "ไม่พบแมตช์ที่ตรงกับตัวกรอง";
    message.hidden = filtered.length > 0;

    pageLabel.textContent =
        `${page} / ${pages} · ${filtered.length} แมตช์`;

    previous.disabled = page <= 1;
    next.disabled = page >= pages;
}

function resetPage() {
    page = 1;
    renderMatches();
}

function updateTeams() {
    const seasonMatches = matches.filter(
        match => String(match.season_id) === season.value
    );

    const availableTeams = new Map();

    for (const match of seasonMatches) {
        availableTeams.set(match.home_id, match.home_team);
        availableTeams.set(match.away_id, match.away_team);
    }

    team.replaceChildren(new Option("All teams", ""));

    const sorted = [...availableTeams]
        .sort((a, b) => a[1].localeCompare(b[1]));

    for (const [id, name] of sorted) {
        team.add(new Option(name, String(id)));
    }

    resetPage();
}

async function loadMatches() {
    message.hidden = false;
    message.textContent = "กำลังโหลดแมตช์...";
    retry.hidden = true;

    try {
        const response = await fetch("/api/matches");

        if (!response.ok) {
            throw new Error(`Unable to load matches (${response.status})`);
        }

        matches = await response.json();

        const seasons = [...new Map(
            matches.map(match => [match.season_id, match.season])
        )].sort((a, b) => b[0] - a[0]);

        season.replaceChildren();

        for (const [id, label] of seasons) {
            season.add(new Option(label, String(id)));
        }

        updateTeams();

        // รับค่า ?id=... ที่คลิกมาจากหน้า Search แล้วเปิด Dialog รายละเอียดอัตโนมัติ
        const targetMatchId = new URLSearchParams(window.location.search).get("id");
        if (targetMatchId) {
            const matchedMatch = matches.find((m) => String(m.id) === targetMatchId);
            if (matchedMatch) openDetails(matchedMatch);
        }
    } catch (error) {
        message.hidden = false;
        message.textContent = "โหลดแมตช์ไม่สำเร็จ กรุณาลองอีกครั้ง";
        retry.hidden = false;
        console.error(error);
    }
}

search.addEventListener("input", resetPage);
headerSearch.addEventListener("input", resetPage);
season.addEventListener("change", updateTeams);
team.addEventListener("change", resetPage);
retry.addEventListener("click", loadMatches);

headerSearch.form?.addEventListener("submit", event => {
    event.preventDefault();
    resetPage();
});

previous.addEventListener("click", () => {
    page--;
    renderMatches();
});

next.addEventListener("click", () => {
    page++;
    renderMatches();
});

const matchTabs = document.querySelectorAll(".match-tabs button");

// [แก้ไข] แยกฟังก์ชันอัปเดตสถานะตัวกรองและปุ่มแท็บ เพื่อใช้ร่วมกันทั้งตอนคลิกแท็บและตอนอ่านค่าจาก URL
function setMatchStatus(status) {
    statusFilter.value = status;

    for (const tab of matchTabs) {
        tab.setAttribute(
            "aria-pressed",
            String(tab.dataset.status === status)
        );
    }
}

for (const button of matchTabs) {
    button.addEventListener("click", () => {
        setMatchStatus(button.dataset.status);
        resetPage();
    });
}

// [แก้ไข] อ่านค่า ?status=... จาก URL (เช่น ?status=completed ที่กดมาจาก See more หน้า Dashboard)
// ถ้าไม่มีค่าใน URL หรือค่าไม่ถูกต้อง ให้ใช้ "scheduled" เป็นค่าเริ่มต้นเหมือนเดิม
const urlStatus = new URLSearchParams(window.location.search).get("status");
const validStatuses = new Set([...matchTabs].map((btn) => btn.dataset.status));
setMatchStatus(validStatuses.has(urlStatus) ? urlStatus : "scheduled");

loadMatches();