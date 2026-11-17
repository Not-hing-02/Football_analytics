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
