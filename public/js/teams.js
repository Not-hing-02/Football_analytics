let teams = [];
let favoritesOnly = false;
let savedTeams = new Set();

const favoritesKey = "football.teams.favorites.v1";
const grid = document.getElementById("team-grid");
const statusMessage = document.getElementById("team-status");
const retryButton = document.getElementById("team-retry");
const nameSearch = document.getElementById("team-search");
const headerSearch = document.getElementById("search");
const seasonFilter = document.getElementById("team-season");
const stadiumFilter = document.getElementById("stadium-filter");
const cityFilter = document.getElementById("city-filter");
const favoritesFilter = document.getElementById("team-favorites");

try {
    const stored = JSON.parse(localStorage.getItem(favoritesKey));
    if (Array.isArray(stored)) {
        savedTeams = new Set(stored.map(Number));
    }
} catch {
    // Favorites remain available for this visit.
}

function fillOptions(select, values, placeholder) {
    select.replaceChildren(new Option(placeholder, ""));

    for (const value of [...new Set(values)].sort()) {
        select.add(new Option(value, value));
    }
}

function updateSeasonFilters() {
    const selectedTeams = teams.filter(
        team => String(team.season_id) === seasonFilter.value
    );

    fillOptions(
        stadiumFilter,
        selectedTeams.map(team => team.stadium),
        "All stadiums"
    );

    fillOptions(
        cityFilter,
        selectedTeams.map(team => team.city),
        "All cities"
    );

    renderTeams();
}

function openTeamDetails(team) {
    document.getElementById("team-detail-name").textContent = team.name;
    document.getElementById("team-detail-info").textContent =
        `${team.season} · ${team.stadium} · ${team.city}`;

    const stats = document.getElementById("team-detail-stats");
    stats.replaceChildren();

    const values = [
        ["Played", team.played],
        ["Wins", team.wins],
        ["Draws", team.draws],
        ["Losses", team.losses],
        ["Goals for", team.goals_for],
        ["Goals against", team.goals_against]
    ];

    for (const [label, value] of values) {
        const group = document.createElement("div");
        const title = document.createElement("dt");
        const number = document.createElement("dd");

        title.textContent = label;
        number.textContent = value;
        group.append(title, number);
        stats.append(group);
    }

    document.getElementById("team-dialog").showModal();
}

function createTeamRow(team) {
    const row = document.createElement("tr");

    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "standings-team";
    nameButton.textContent = team.name;
    nameButton.setAttribute("aria-haspopup", "dialog");
    nameButton.addEventListener("click", () => openTeamDetails(team));
    row.insertCell().append(nameButton);

    const fields = [
        "played",
        "wins",
        "draws",
        "losses",
        "goals_for",
        "goals_against",
        "goal_difference",
        "points"
    ];

    for (const field of fields) {
        const cell = row.insertCell();
        cell.textContent = team[field];

        if (field === "points") {
            cell.className = "standings-points";
        }
    }

    const heart = document.createElement("button");
    heart.type = "button";
    heart.className = "standings-heart";
    heart.setAttribute("aria-label", `Favorite ${team.name}`);
    heart.setAttribute("aria-pressed", String(savedTeams.has(team.id)));

    heart.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67
                l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78
                L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/>
        </svg>
    `;

    heart.addEventListener("click", () => {
        if (savedTeams.has(team.id)) {
            savedTeams.delete(team.id);
        } else {
            savedTeams.add(team.id);
        }

        try {
            localStorage.setItem(favoritesKey, JSON.stringify([...savedTeams]));
        } catch {
            // Keep favorites in memory for this visit.
        }

        heart.setAttribute("aria-pressed", String(savedTeams.has(team.id)));

        if (favoritesOnly) {
            renderTeams();
            favoritesFilter.focus();
        }
    });

    row.insertCell().append(heart);
    return row;
}
function renderTeams() {
    const nameQuery = nameSearch.value.trim().toLowerCase();
    const generalQuery = headerSearch.value.trim().toLowerCase();

    const visibleTeams = teams.filter(team => {
        const searchable = `${team.name} ${team.stadium} ${team.city}`
            .toLowerCase();

        return String(team.season_id) === seasonFilter.value
            && team.name.toLowerCase().includes(nameQuery)
            && searchable.includes(generalQuery)
            && (!stadiumFilter.value || team.stadium === stadiumFilter.value)
            && (!cityFilter.value || team.city === cityFilter.value)
            && (!favoritesOnly || savedTeams.has(team.id));
    });

    grid.replaceChildren(...visibleTeams.map(createTeamRow));
    statusMessage.textContent = "ไม่พบทีมที่ตรงกับตัวกรอง";
    statusMessage.hidden = visibleTeams.length > 0;
}

async function loadTeams() {
    statusMessage.hidden = false;
    statusMessage.textContent = "กำลังโหลดข้อมูลทีม...";
    retryButton.hidden = true;

    try {
        const response = await fetch("/api/teams");

        if (!response.ok) {
            throw new Error(`Unable to load teams (${response.status})`);
        }

        teams = await response.json();

        const seasons = [...new Map(
            teams.map(team => [team.season_id, team.season])
        )].sort((a, b) => b[0] - a[0]);

        seasonFilter.replaceChildren();

        for (const [id, label] of seasons) {
            seasonFilter.add(new Option(label, String(id)));
        }

        updateSeasonFilters();
    } catch (error) {
        statusMessage.hidden = false;
        statusMessage.textContent = "โหลดข้อมูลทีมไม่สำเร็จ";
        retryButton.hidden = false;
        console.error(error);
    }
}

nameSearch.addEventListener("input", renderTeams);
headerSearch.addEventListener("input", renderTeams);
seasonFilter.addEventListener("change", updateSeasonFilters);
stadiumFilter.addEventListener("change", renderTeams);
cityFilter.addEventListener("change", renderTeams);
retryButton.addEventListener("click", loadTeams);

headerSearch.form?.addEventListener("submit", event => {
    event.preventDefault();
    renderTeams();
});

favoritesFilter.addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    favoritesFilter.setAttribute("aria-pressed", String(favoritesOnly));
    renderTeams();
});

loadTeams();