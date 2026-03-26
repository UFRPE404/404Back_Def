"""Test b365api team search endpoint and other filters."""
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
                for item in results[:5]:
                    print(f"  - {json.dumps(item, indent=2)[:300]}")
            else:
                print(f"  {json.dumps(results, indent=2)[:500]}")
        else:
            print(f"  {json.dumps(data, indent=2)[:500]}")
    except Exception as e:
        print(f"  ERROR: {e}")

# Test /v1/team with sport_id
try_endpoint("Team search (Poland, sport_id=1)", 
    f"{BASE}/v1/team", {"sport_id": 1, "name": "Poland"})

try_endpoint("Team search (id param)", 
    f"{BASE}/v1/team", {"sport_id": 1, "id": "Poland"})

# Try search endpoint
try_endpoint("Search endpoint",
    f"{BASE}/v1/search", {"sport_id": 1, "query": "Poland"})

try_endpoint("Search v3",
    f"{BASE}/v3/search", {"sport_id": 1, "query": "Poland"})

# Try team by name in different format
try_endpoint("Team v3", 
    f"{BASE}/v3/team", {"sport_id": 1, "name": "Poland"})

# Check if there's events/search
try_endpoint("Events search",
    f"{BASE}/v3/events/search", {"sport_id": 1, "home": "Poland"})

# Try international football league IDs (common ones)
# UEFA Nations League, World Cup Qualifiers, Friendlies etc.
for league_id in [111, 112, 113, 1, 2, 3, 10, 100, 200, 500, 1000]:
    try:
        r = client.get(f"{BASE}/v3/events/upcoming", params={
            "token": TOKEN, "sport_id": 1, "league_id": league_id
        })
        data = r.json()
        results = data.get("results", [])
        if results:
            league_name = results[0].get("league", {}).get("name", "?")
            print(f"\n  League {league_id}: {league_name} ({len(results)} events)")
            print(f"    First: {results[0].get('home', {}).get('name')} vs {results[0].get('away', {}).get('name')}")
    except:
        pass

print("\n\n=== Done ===")
