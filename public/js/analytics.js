const element = (id) => document.getElementById(`analytics-${id}`);
const seasonSelect = element("season");
const teamSelect = element("team");
const exportButton = element("export");
const retryButton = element("retry");
const status = element("status");
const results = element("results");
const monthFormat = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

let seasons;
let request;
let report;

function node(tag, className, value = "") {
    const item = document.createElement(tag);
    item.className = className;
    item.textContent = value;
    return item;
}

function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
}

async function getJson(path, signal) {
    const response = await fetch(path, { signal });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to load analytics data.");
    }
    return response.json();
}

function updateTeams() {
    const previous = teamSelect.value;
    const season = seasons.find((option) => String(option.id) === seasonSelect.value);
    teamSelect.replaceChildren(new Option("All Teams", ""));
    for (const team of season.teams) teamSelect.add(new Option(team.name, team.id));
    if (season.teams.some((team) => String(team.id) === previous)) teamSelect.value = previous;
}

function outcomeLabels(team) {
    return team ? ["Wins", "Draws", "Losses"] : ["Home wins", "Draws", "Away wins"];
}

function renderOutcomes({ team, outcomes }) {
    const target = element("outcomes");
    const { wins, draws, losses } = outcomes;
    const total = wins + draws + losses;
    element("outcome-caption").textContent = team
        ? "Share of scored matches for the selected team"
        : "League match outcomes from the home side’s perspective";
    if (!total) {
        target.replaceChildren(node("p", "analytics-notice", "No final scores available."));
        return;
    }
    const winShare = wins / total * 100;
    const donut = node("div", "analytics-donut");
    donut.style.setProperty("--wins", `${winShare}%`);
    donut.style.setProperty("--draws", `${(wins + draws) / total * 100}%`);
    donut.setAttribute("role", "img");
    donut.setAttribute("aria-label", `${winShare.toFixed(1)}% ${team ? "team wins" : "home wins"}`);
    donut.append(node("strong", "", `${Math.round(winShare)}%`));
    const legend = node("div", "analytics-legend");
    outcomeLabels(team).forEach((label, index) => {
        legend.append(node("span", "", `${label} ${[wins, draws, losses][index]}`));
    });
    target.replaceChildren(donut, legend);
}

function renderBars(target, monthly, key, unit, maximum) {
    if (!monthly.length) {
        target.replaceChildren(node("p", "analytics-notice", "No monthly data available."));
        return;
    }
    const chart = node("div", "analytics-chart");
    const ticks = node("div", "analytics-ticks");
    ticks.setAttribute("aria-hidden", "true");
    for (const value of [maximum, maximum / 2, 0]) ticks.append(node("span", "", value));
    const plot = node("ul", "analytics-plot");
    plot.setAttribute("aria-label", unit + " by calendar month");
    plot.tabIndex = 0;
    for (const row of monthly) {
        const value = row[key];
        const date = new Date(`${row.month}-01T00:00:00Z`);
        const label = `${row.month}: ${value.toFixed(2)} ${unit} across ${row.matches} scored matches`;
        const entry = node("li", "");
        entry.setAttribute("aria-label", label);
        entry.title = label;
        const bar = node("div", "analytics-bar");
        const fill = node("span", "");
        fill.style.setProperty("--bar-height", `${value / maximum * 100}%`);
        bar.append(fill);
        entry.append(bar, node("span", "analytics-month", monthFormat.format(date)));
        plot.append(entry);
    }
    chart.append(ticks, plot);
    target.replaceChildren(chart);
}

function renderReport(data) {
    renderOutcomes(data);
    element("goals-caption").textContent = data.team
        ? "X: month · Y: team goals scored per match"
        : "X: month · Y: combined goals per league match";
    renderBars(element("goals"), data.monthly, "goals_per_match", "goals per match",
        Math.max(2, Math.ceil(Math.max(0, ...data.monthly.map((row) => row.goals_per_match)) / 2) * 2));

    element("trend-caption").textContent = data.team
        ? "X: month · Y: team points per match (win 3, draw 1)"
        : "X: month · Y: league mean points per team appearance";
    renderBars(element("trend"), data.monthly, "points_per_match",
        data.team ? "points per match" : "points per team appearance", data.team ? 3 : 1.5);

    element("scorers").replaceChildren(...data.scorers.map(({ name, goals }) => {
        const entry = node("li", "");
        const line = node("div", "analytics-scorer");
        line.append(node("span", "", name), node("strong", "", goals));
        entry.append(line);
        return entry;
    }));
    element("no-scorers").hidden = data.scorers.length > 0;

    const { completedMatches, expectedMatches, firstCompleted, lastCompleted } = data.coverage;
    if (!completedMatches) {
        showStatus("No completed matches for this selection.");
    } else {
        const scored = data.outcomes.wins + data.outcomes.draws + data.outcomes.losses;
        const notes = [
            `${completedMatches} of ${expectedMatches} expected matches recorded (${firstCompleted} to ${lastCompleted}).`,
        ];
        if (completedMatches < expectedMatches) notes.push("Partial season coverage.");
        if (scored < completedMatches) notes.push(`${completedMatches - scored} missing final scores excluded from charts.`);
        notes.push("Months without scored matches are omitted.");
        showStatus(notes.join(" "));
    }
    results.hidden = false;
    exportButton.disabled = !completedMatches;
}

async function loadDashboard() {
    request?.abort();
    request = new AbortController();
    const { signal } = request;
    report = null;
    retryButton.hidden = true;
    results.hidden = true;
    exportButton.disabled = true;
    showStatus("Loading analytics…");
    const params = new URLSearchParams({ seasonId: seasonSelect.value });
    if (teamSelect.value) params.set("teamId", teamSelect.value);
    try {
        const data = await getJson(`/api/analytics/dashboard?${params}`, signal);
        if (signal.aborted) return;
        renderReport(data);
        report = data;
    } catch (error) {
        if (signal.aborted) return;
        showStatus(error.message);
        retryButton.hidden = false;
    }
}

async function loadFilters() {
    retryButton.hidden = true;
    showStatus("Loading analytics…");
    try {
        seasons = await getJson("/api/analytics/filters");
        if (!seasons.length) {
            showStatus("No seasons available.");
            return;
        }
        seasonSelect.replaceChildren(...seasons.map(({ id, label }) => new Option(`Season ${label}`, id)));
        seasonSelect.disabled = teamSelect.disabled = false;
        updateTeams();
        await loadDashboard();
    } catch (error) {
        showStatus(error.message);
        retryButton.hidden = false;
    }
}

function csvCell(value) {
    const safe = typeof value === "string" && /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + String(safe ?? "").replaceAll('"', '""') + '"';
}

function exportReport() {
    if (!report) return;
    const { season, team, coverage, outcomes, monthly, scorers } = report;
    const [winLabel, drawLabel, lossLabel] = outcomeLabels(team);
    const rows = [
        ["Section", "Label", "Value", "Sample size"],
        ["Selection", "Season", season.label],
        ["Selection", "Team", team?.name ?? "All Teams"],
        ["Coverage", "Completed matches", coverage.completedMatches],
        ["Coverage", "Matches with final scores", outcomes.wins + outcomes.draws + outcomes.losses],
        ["Coverage", "Expected matches", coverage.expectedMatches],
        ["Coverage", "First completed", coverage.firstCompleted],
        ["Coverage", "Last completed", coverage.lastCompleted],
        ["Outcomes", winLabel, outcomes.wins],
        ["Outcomes", drawLabel, outcomes.draws],
        ["Outcomes", lossLabel, outcomes.losses],
        ...monthly.map((row) => [team ? "Team goals per match" : "Combined goals per league match",
            row.month, row.goals_per_match, row.matches]),
        ...monthly.map((row) => [team ? "Team points per match" : "League points per team appearance",
            row.month, row.points_per_match, team ? row.matches : row.matches * 2]),
        ...scorers.map(({ name, goals }) => ["Top scorers", name, goals]),
    ];
    const csv = rows.map(([section, label, value, sample]) =>
        [section, label, value, sample].map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-${season.id}-${team?.id ?? "all-teams"}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

seasonSelect.addEventListener("change", () => {
    updateTeams();
    loadDashboard();
});
teamSelect.addEventListener("change", loadDashboard);
retryButton.addEventListener("click", () => seasons?.length ? loadDashboard() : loadFilters());
exportButton.addEventListener("click", exportReport);
loadFilters();
