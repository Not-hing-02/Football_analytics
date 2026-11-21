let teams;
let favoritesOnly = false;

const grid = document.getElementById("team-grid");
const cardTemplate = document.getElementById("team-card-template");
const dialog = document.getElementById("team-dialog");
const statusMessage = document.getElementById("team-status");
const retryButton = document.getElementById("team-retry");
const nameSearch = document.getElementById("team-search");
const headerSearch = document.getElementById("search");
const seasonFilter = document.getElementById("team-season");
const stadiumFilter = document.getElementById("stadium-filter");
const cityFilter = document.getElementById("city-filter");
const favoritesFilter = document.getElementById("team-favorites");

document.addEventListener("favoriteschange", () => {
    if (teams) renderTeams();
});

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
        selectedTeams.map(team => team.stadium).filter(Boolean),
        "All stadiums"
    );

    fillOptions(
        cityFilter,
        selectedTeams.map(team => team.city).filter(Boolean),
        "All cities"
    );

    renderTeams();
}

function openTeamDetails(team) {
    document.getElementById("team-detail-name").textContent = team.name;
    document.getElementById("team-detail-abbreviation").textContent = team.abbreviation || "—";
    document.getElementById("team-detail-stadium").textContent = team.stadium || "—";
    document.getElementById("team-detail-city").textContent = team.city || "—";
    dialog.showModal();
}

function createTeamCard(team) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);

    const badge = card.querySelector(".team-badge");
    badge.textContent = team.abbreviation || team.name.slice(0, 3).toUpperCase();

    const teamId = Number(team.id);

    if (Number.isSafeInteger(teamId) && teamId > 0) {
        const crest = document.createElement("img");
        crest.alt = "";
        crest.width = 36;
        crest.height = 36;

        crest.addEventListener("load", () => {
            badge.replaceChildren(crest);
            badge.classList.add("has-crest");
        }, { once: true });

        crest.src = `/assets/Logo_Teams/${teamId}.png`;
    }
    card.querySelector(".team-name").textContent = team.name;
    card.querySelector(".team-stadium").textContent = team.stadium || "—";

    const record = card.querySelector(".team-record");
    const seasonTotals = [
        ["Wins", team.wins],
        ["Draws", team.draws],
        ["Losses", team.losses]
    ];

    for (const [label, value] of seasonTotals) {
        const stat = document.createElement("span");
        const abbreviation = document.createElement("abbr");
        abbreviation.title = label;
        abbreviation.textContent = label[0];
        stat.append(abbreviation, ` ${value ?? "—"}`);
        record.append(stat);
    }

    const details = card.querySelector(".team-details");
    details.setAttribute("aria-label", `View details for ${team.name}`);
    details.addEventListener("click", () => openTeamDetails(team));

    const heart = card.querySelector(".team-heart");
    heart.setAttribute("aria-label", `Favorite ${team.name}`);
    heart.dataset.favType = "teams";
    heart.dataset.favId = team.id;
    heart.setAttribute("aria-pressed", String(favoriteIds.teams.has(Number(team.id))));

    return card;
}

function renderTeams() {
    if (!teams) {
        return;
    }

    const nameQuery = nameSearch.value.trim().toLowerCase();
    const generalQuery = headerSearch.value.trim().toLowerCase();

    const visibleTeams = teams.filter(team => {
        const name = team.name.toLowerCase();
        const code = team.abbreviation?.toLowerCase() ?? "";
        const searchable = [name, code, team.stadium, team.city].join(" ").toLowerCase();

        return String(team.season_id) === seasonFilter.value
            && (name.includes(nameQuery) || code.includes(nameQuery))
            && searchable.includes(generalQuery)
            && (!stadiumFilter.value || team.stadium === stadiumFilter.value)
            && (!cityFilter.value || team.city === cityFilter.value)
            && (!favoritesOnly || favoriteIds.teams.has(Number(team.id)));
    });

    grid.replaceChildren(...visibleTeams.map(createTeamCard));
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

        teams = (await response.json()).sort((a, b) => a.name.localeCompare(b.name, "en"));

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
