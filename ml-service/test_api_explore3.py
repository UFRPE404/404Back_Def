"""Test events/search and team lookup approaches."""
import os, httpx, json

TOKEN = os.getenv("BETS_API_TOKEN", "248558-x464EYT2kttm4b")
BASE = "https://api.b365api.com"
client = httpx.Client(timeout=20)

def try_endpoint(name, url, params=None):
    params = params or {}
    params["token"] = TOKEN
    print(f"\n=== {name} ===")
    try:
        r = client.get(url, params=params)
        print(f"  Status: {r.status_code}")
        data = r.json()
        if "results" in data:
            results = data["results"]
            if isinstance(results, list):
                print(f"  Count: {len(results)}")
                for item in results[:3]:
                    if isinstance(item, dict):
                        home = item.get("home", {}).get("name", "?")
                        away = item.get("away", {}).get("name", "?")
                        league = item.get("league", {}).get("name", "?")
                        ss = item.get("ss", "")
                        eid = item.get("id", "?")
                        print(f"    [{eid}] {home} vs {away} ({ss}) [{league}]")
                    else:
                        print(f"    {json.dumps(item, indent=2)[:200]}")
            else:
                print(f"  {json.dumps(results, indent=2)[:500]}")
        else:
            print(f"  {json.dumps(data, indent=2)[:500]}")
    except Exception as e:
        print(f"  ERROR: {e}")

# 1. Events search with home and away
try_endpoint("Events search: Poland vs Albania",
    f"{BASE}/v3/events/search", {"sport_id": 1, "home": "Poland", "away": "Albania"})

# 2. Events search reversed
try_endpoint("Events search: Albania vs Poland",
    f"{BASE}/v3/events/search", {"sport_id": 1, "home": "Albania", "away": "Poland"})

# 3. Real Madrid vs Barcelona (popular teams)
try_endpoint("Events search: Real Madrid vs Barcelona",
    f"{BASE}/v3/events/search", {"sport_id": 1, "home": "Real Madrid", "away": "Barcelona"})

# 4. Search for just one team in different ways
try_endpoint("Events search: home=Real Madrid, away=''", 
    f"{BASE}/v3/events/search", {"sport_id": 1, "home": "Real Madrid", "away": " "})

# 5. Team endpoint with page parameter
try_endpoint("Team v1 page=1 sort by name?",
    f"{BASE}/v1/team", {"sport_id": 1, "page": 1})

# 6. Maybe the team endpoint needs different query
try_endpoint("Team v1 with query",
    f"{BASE}/v1/team", {"sport_id": 1, "query": "Poland"})

# 7. Team v1 search
try_endpoint("Team v1 search",
    f"{BASE}/v1/team/search", {"sport_id": 1, "name": "Poland"})

# 8. Try ended events with team name filter
try_endpoint("Ended with home=Poland",
    f"{BASE}/v3/events/ended", {"sport_id": 1, "home": "Poland"})

# 9. Ended events for league_id 113 (Poland II Liga)
try_endpoint("Ended league 113",
    f"{BASE}/v3/events/ended", {"sport_id": 1, "league_id": 113})

# 10. Check for UEFA Nations League type IDs (often in 40000+ range)
for lid in [94, 95, 96, 97, 98, 99, 135, 136, 137, 138, 139, 140]:
    try:
        r = client.get(f"{BASE}/v3/events/ended", 
            params={"token": TOKEN, "sport_id": 1, "league_id": lid, "page": 1})
        data = r.json()
        results = data.get("results", [])
        if results:
            ln = results[0].get("league", {}).get("name", "?")
            home = results[0].get("home", {}).get("name", "?")
            away = results[0].get("away", {}).get("name", "?")
            print(f"\n  Ended League {lid}: {ln} -> {home} vs {away}")
    except:
        pass

print("\n\n=== Done ===")
