"""Quick test of live data service."""
import os
os.environ["BETS_API_TOKEN"] = "248558-x464EYT2kttm4b"

from app.services.live_data_service import (
    get_upcoming_events,
    search_team_in_events,
    fetch_live_context,
    get_team_recent_matches,
    _extract_team_stats_from_matches,
)
import json

print("=== UPCOMING EVENTS (first 10) ===")
upcoming = get_upcoming_events()
for ev in upcoming[:10]:
    h = ev.get("home", {}).get("name", "?")
    a = ev.get("away", {}).get("name", "?")
    league = ev.get("league", {}).get("name", "?")
    print(f"  {h} vs {a}  [{league}]")

print(f"\nTotal upcoming: {len(upcoming)}")

# Try to find a team that exists
if upcoming:
    first_home = upcoming[0].get("home", {}).get("name", "")
    first_away = upcoming[0].get("away", {}).get("name", "")
    print(f"\n=== TESTING SEARCH for '{first_home}' ===")
    info = search_team_in_events(first_home)
    print(f"Result: {info}")

    if info:
        print(f"\n=== RECENT MATCHES for {info['name']} (id={info['id']}) ===")
        matches = get_team_recent_matches(info["id"])
        print(f"Found {len(matches)} matches")
        for m in matches[:5]:
            h = m.get("home", {}).get("name", "?")
            a = m.get("away", {}).get("name", "?")
            ss = m.get("ss", "?")
            print(f"  {h} {ss} {a}")

        stats = _extract_team_stats_from_matches(matches, info["id"])
        print(f"\nStats: {json.dumps(stats, indent=2, default=str)}")

    print(f"\n=== FULL LIVE CONTEXT for {first_home} vs {first_away} ===")
    ctx = fetch_live_context(first_home, first_away)
    print(json.dumps({k: v for k, v in ctx.items() if k not in ("home_live", "away_live")}, indent=2, default=str))
    if ctx.get("home_live"):
        print(f"Home live matches: {ctx['home_live'].get('matches', 0)}")
        print(f"Home goals avg: {ctx['home_live'].get('goals_scored_avg', 'N/A')}")
    if ctx.get("away_live"):
        print(f"Away live matches: {ctx['away_live'].get('matches', 0)}")
        print(f"Away goals avg: {ctx['away_live'].get('goals_scored_avg', 'N/A')}")

# Also test Poland
print("\n=== SEARCHING for 'Poland' ===")
pl = search_team_in_events("Poland")
print(f"Result: {pl}")
