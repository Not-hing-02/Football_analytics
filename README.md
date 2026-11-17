# Football_analytics

## Analytics

Import the team's `Premier_League_5_Years.sql` into a PostgreSQL database. From
the project root, run `npm ci`, set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
and `PGPASSWORD` for that database, and run `node server.mjs`. Open
[Analytics](http://localhost:3000/analytics.html). The server reads the
`pl_history` schema using the same PostgreSQL pool as Players and Teams.

| Endpoint | Parameters | Response |
| --- | --- | --- |
| `GET /api/analytics/filters` | None | An array of `{ id, label, teams: [{ id, name }] }` sorted by newest season first. Each season includes its registered teams. |
| `GET /api/analytics/dashboard` | Required `seasonId`, optional `teamId`. Omit `teamId` for All Teams. | `{ season: { id, label }, team: { id, name } or null, coverage, outcomes, monthly, scorers }`. |

Dashboard IDs are positive PostgreSQL integers. Invalid parameters, repeated
parameters and unknown keys produce `400`. An unknown season or a team outside
the selected season produces `404`. Database errors produce `500`. Errors use
`{ error }`. A valid selection without completed matches returns `200` with
zero counts, null coverage dates, and empty arrays.

- `coverage` contains `completedMatches`, `expectedMatches`, `firstCompleted`,
  and `lastCompleted`. Expected matches assume a double round robin with the
  registered teams. The page flags partial coverage when the recorded count
  falls below the expected count.
- `outcomes` contains `wins`, `draws`, and `losses`. For one team the donut
  shows its outcomes and centers its win percentage. For All Teams the three
  counts represent home wins, draws, and away wins, with home win percentage
  in the center.
- `monthly` contains `{ month, matches, goals_per_match, points_per_match }`.
  Both bar charts use calendar month of `match_date` on the X-axis. Months with
  no scored matches are omitted, and `matches` is the count of final scores in
  that month for the selection. Both chart Y-axes start at zero.
- Goals per Match uses the mean goals scored by the selected team on the Y-axis.
  All Teams uses the mean combined home and away goals per league fixture.
- Team Performance Trend uses mean points per match on the Y-axis, with
  3 for a win, 1 for a draw, and 0 for a loss. All Teams averages the points
  earned by both sides of each fixture, equivalent to 1.5 for a decisive match
  and 1 for a draw. This measures league-wide points per team appearance.
- `scorers` contains up to four `{ id, name, goals }` rows ranked by recorded
  player goals, then by display name and player ID. Team totals count goals
  scored while playing for the selected team. Ranking coverage depends on the
  available player match records.

All metrics use completed matches. The two bar charts and the donut require
both final scores. Top Scorers uses the player stats recorded for completed
matches. Export Report downloads a CSV of the current dashboard selection with
coverage, outcomes, monthly chart values and sample sizes, and the scorer
ranking.

## Compare Players

Open [Compare Players](http://localhost:3000/compare.html) after starting the
server with the PostgreSQL setup above. The season selector uses the existing
`GET /api/analytics/filters` endpoint.

| Endpoint | Parameters | Response |
| --- | --- | --- |
| `GET /api/compare/players/options` | Required `seasonId`. | `{ seasonId, players: [{ id, name, fullName, team, position }] }`. An existing season can return an empty player list. |
| `GET /api/compare/players` | Required `seasonId`, `playerA` and `playerB`. | `{ seasonId, players: [{ id, metrics }, { id, metrics }] }` in A/B order. |

IDs are positive PostgreSQL integers. Invalid, repeated or unknown parameters
and identical player IDs return `400`. An unknown season or a player without a
recorded appearance in that season returns `404`. Database failures return
`500`. Error responses contain `{ error }`.

Eligibility and all totals use recorded appearances with minutes played in
completed matches. Cards show the latest recorded club and position within the
selected season. Totals include all of a player's appearances across clubs in
that season, including the available records for partial seasons.

| Metric key | Calculation |
| --- | --- |
| `goals` | Sum of recorded goals |
| `assists` | Sum of Fantasy Premier League assists |
| `matchesPlayed` | Count of recorded appearances |
| `passAccuracy` | `null` because the schema lacks attempted passes needed for a weighted season percentage |
| `shots`, `shotsOnTarget` | Sum each field when every recorded appearance has a value. Otherwise return `null`. |
| `averageRating` | Mean of recorded `rating_10` values when every recorded appearance has a rating. Otherwise return `null`. |
| `yellowCards` | Sum of recorded yellow cards |

The supplied data has only partial coverage for player shots and no recorded
ratings. The UI shows `N/A` with a reason for null metrics. Each count row shares
the same scale for both players, up to the largest available count in that row
(minimum scale of 1). Pass accuracy and rating use fixed scales of 100 and 10.
