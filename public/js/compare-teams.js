export function initTeamComparison() {
const teamElement = (id) => document.getElementById(id);
const teamSeason = teamElement("team-compare-season");
const teamSelects = [teamElement("team-select-a"), teamElement("team-select-b")];
const teamStatus = teamElement("team-compare-status");
const teamRetry = teamElement("team-compare-retry");
const teamResults = teamElement("team-compare-results");
const teamMetrics = [
    ["matchesPlayed", "Matches Played"], ["wins", "Wins"], ["draws", "Draws"],
    ["losses", "Losses · lower is better"], ["goalsFor", "Goals For"],
    ["goalsAgainst", "Goals Against · lower is better"],
    ["goalDifference", "Goal Difference"], ["points", "Points"],
];
let teamSeasons = [];
let teamRequest;
let teamRetryAction;

function teamNode(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}

function teamMessage(message, retry) {
    teamStatus.textContent = message;
    teamStatus.hidden = !message;
    teamRetryAction = retry;
    teamRetry.hidden = !retry;
}

async function teamJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to load teams.");
    }
    return response.json();
}

function refreshTeamChoices() {
    const season = teamSeasons.find(({ id }) => String(id) === teamSeason.value);
    teamSelects.forEach((select) => {
        const previous = select.value;
        select.replaceChildren(new Option("Choose a team", ""),
            ...season.teams.map(({ id, name }) => new Option(name, id)));
        if (season.teams.some(({ id }) => String(id) === previous)) select.value = previous;
        select.disabled = season.teams.length < 2;
    });
    loadTeamComparison();
}

function renderTeamComparison(data) {
    const rows = teamMetrics.map(([key, title]) => {
        const values = data.teams.map(({ metrics }) => metrics[key]);
        const scale = Math.max(1, ...values.map(Math.abs));
        const row = teamNode("section", "compare-metric");
        row.append(teamNode("h3", "", title));
        values.forEach((value, slot) => {
            const cell = teamNode("div", `compare-value compare-${slot ? "right" : "left"}`);
            cell.setAttribute("aria-label", `${data.teams[slot].name}: ${value}`);
            const track = teamNode("span", key === "goalDifference" ? "team-signed-track" : "compare-track");
            const fill = teamNode("span", "compare-fill");
            // ผลต่างประตูใช้เส้นศูนย์ตรงกลางและสเกลสมมาตรร่วมกันทั้งสองทีม
            const width = Math.abs(value) / scale * (key === "goalDifference" ? 50 : 100);
            fill.style.width = `${width}%`;
            if (key === "goalDifference") fill.style.left = `${value < 0 ? 50 - width : 50}%`;
            track.setAttribute("aria-hidden", "true");
            track.append(fill);
            cell.append(teamNode("strong", "", String(value)), track);
            row.append(cell);
        });
        return row;
    });
    teamElement("team-compare-metrics").replaceChildren(...rows);
    teamElement("team-compare-coverage").textContent = data.teams.map(({ name, metrics, coverage }) =>
        `${name}: ${metrics.matchesPlayed} scored matches of ${coverage.expectedMatches} expected.`
        + (metrics.matchesPlayed < coverage.expectedMatches ? " Partial season coverage." : "")
        + (coverage.missingScores ? ` ${coverage.missingScores} completed matches without full scores excluded.` : "")
    ).join(" ");
    teamResults.hidden = false;
    teamMessage(data.teams.every(({ metrics }) => metrics.matchesPlayed === 0)
        ? "No completed matches with final scores for either team." : "");
}

async function loadTeamComparison() {
    teamRequest?.abort();
    teamRequest = new AbortController();
    const { signal } = teamRequest;
    teamResults.hidden = true;
    teamSelects.forEach((select, slot) => {
        for (const option of select.options) {
            option.disabled = !!option.value && option.value === teamSelects[1 - slot].value;
        }
        teamElement(slot ? "team-name-b" : "team-name-a").textContent =
            select.selectedOptions[0]?.textContent || (slot ? "Team B" : "Team A");
    });
    const season = teamSeasons.find(({ id }) => String(id) === teamSeason.value);
    if (!season || season.teams.length < 2) {
        teamMessage("Fewer than two teams are available for this season.");
        return;
    }
    if (teamSelects.some((select) => !select.value)) {
        teamMessage("Choose two different teams to compare.");
        return;
    }
    if (teamSelects[0].value === teamSelects[1].value) {
        teamMessage("Choose two different teams.");
        return;
    }
    teamMessage("Loading team comparison…");
    const params = new URLSearchParams({
        seasonId: teamSeason.value, teamA: teamSelects[0].value, teamB: teamSelects[1].value,
    });
    try {
        const data = await teamJson(`/api/compare/teams?${params}`, signal);
        if (!signal.aborted) renderTeamComparison(data);
    } catch (error) {
        if (!signal.aborted) teamMessage(error.message, loadTeamComparison);
    }
}

async function loadTeamSeasons() {
    teamMessage("Loading seasons…");
    try {
        teamSeasons = await teamJson("/api/analytics/filters");
        if (!teamSeasons.length) {
            teamSeason.replaceChildren(new Option("No seasons available", ""));
            teamMessage("No seasons available.");
            return;
        }
        teamSeason.replaceChildren(...teamSeasons.map(({ id, label }) => new Option(label, id)));
        teamSeason.disabled = false;
        refreshTeamChoices();
    } catch (error) {
        teamMessage(error.message, loadTeamSeasons);
    }
}

teamSeason.addEventListener("change", refreshTeamChoices);
teamSelects.forEach((select) => select.addEventListener("change", loadTeamComparison));
teamRetry.addEventListener("click", () => teamRetryAction?.());
loadTeamSeasons();

}
