"""Check exact team names from b365api in specific leagues."""
import os, httpx, json

TOKEN = os.getenv("BETS_API_TOKEN", "248558-x464EYT2kttm4b")
BASE = "https://api.b365api.com"
client = httpx.Client(timeout=20)

# Known leagues from earlier discovery
leagues = {
    94: "England Premier League",
    99: "France Ligue 1",
    100: "Sweden Allsvenskan",
    113: "Poland II Liga",
}

# Get all team names from EPL
print("=== EPL Teams (league 94) ===")
r = client.get(f"{BASE}/v3/events/ended", params={
    "token": TOKEN, "sport_id": 1, "league_id": 94
})
data = r.json()
teams = set()
for ev in data.get("results", []):
    h = ev.get("home", {})
    a = ev.get("away", {})
    teams.add((h.get("name"), h.get("id")))
    teams.add((a.get("name"), a.get("id")))

for name, tid in sorted(teams):
    print(f"  [{tid}] {name}")

# Now try events/search with EXACT b365api names
import time
now = int(time.time())

# Try searching for these exact names
print("\n=== events/search with exact EPL names ===")
for name, tid in list(sorted(teams))[:4]:
    other_name = list(teams - {(name, tid)})[0][0]
    for days in [-30, -90, -180]:
        ts = now + days * 86400
        r = client.get(f"{BASE}/v3/events/search", params={
            "token": TOKEN, "sport_id": 1,
            "home": name, "away": other_name, "time": str(ts)
        })
        result = r.json()
        results = result.get("results", [])
        if results:
            ev = results[0]
            print(f"  FOUND ({days}d): {ev.get('home',{}).get('name')} vs {ev.get('away',{}).get('name')}")
            break
    else:
        print(f"  NOT FOUND: {name} vs {other_name}")

# Check if there's something different about the search endpoint
# Let's try with team_id instead of name
print("\n=== Try using team_id in events/ended ===")
# Get Tottenham's history (ID 17212 from earlier)
r = client.get(f"{BASE}/v3/events/ended", params={
    "token": TOKEN, "sport_id": 1, "team_id": "17212"
})
data = r.json()
print(f"Tottenham (17212) ended events: {len(data.get('results', []))}")
for ev in data.get("results", [])[:5]:
    home = ev.get("home", {})
    away = ev.get("away", {})
    league = ev.get("league", {}).get("name", "?")
    print(f"  {home.get('name')} ({home.get('id')}) vs {away.get('name')} ({away.get('id')}) = {ev.get('ss')} [{league}]")

# Now try Liverpool
# First find Liverpool's ID from EPL
liverpool_id = None
for name, tid in teams:
    if "liverpool" in name.lower():
        liverpool_id = tid
        print(f"\nLiverpool ID: {tid}")
        break

if liverpool_id:
    r = client.get(f"{BASE}/v3/events/ended", params={
        "token": TOKEN, "sport_id": 1, "team_id": liverpool_id
    })
    data = r.json()
    print(f"Liverpool ended events: {len(data.get('results', []))}")
    for ev in data.get("results", [])[:3]:
        print(f"  {ev.get('home',{}).get('name')} vs {ev.get('away',{}).get('name')} = {ev.get('ss')}")

# Also check what league IDs exist for La Liga, Bundesliga, Serie A, Brasileirão
print("\n=== Searching for more league IDs ===")
# Try a wider range of league IDs
for lid in range(80, 120):
    try:
        r = client.get(f"{BASE}/v3/events/ended", params={
            "token": TOKEN, "sport_id": 1, "league_id": lid
        })
        data = r.json()
        results = data.get("results", [])
        if results:
            ln = results[0].get("league", {}).get("name", "?")
            cc = results[0].get("league", {}).get("cc", "?")
            if cc:  # Only real football
                print(f"  League {lid}: {ln} ({cc})")
    except:
        pass
