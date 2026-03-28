"""Explore b365api endpoints to find team search/lookup capabilities."""
import os, httpx, json

TOKEN = os.getenv("BETS_API_TOKEN", "248558-x464EYT2kttm4b")
BASE = "https://api.b365api.com"
client = httpx.Client(timeout=20)

def try_endpoint(name, url, params=None):
    params = params or {}
    params["token"] = TOKEN
    print(f"\n=== {name} ===")
    print(f"  URL: {url}")
    print(f"  Params: {params}")
    try:
        r = client.get(url, params=params)
        print(f"  Status: {r.status_code}")
        data = r.json()
        # Show structure
        if "results" in data:
            results = data["results"]
            if isinstance(results, list):
                print(f"  Results count: {len(results)}")
                if results:
                    print(f"  First result keys: {list(results[0].keys()) if isinstance(results[0], dict) else type(results[0])}")
                    print(f"  First result: {json.dumps(results[0], indent=2)[:500]}")
            elif isinstance(results, dict):
                print(f"  Results keys: {list(results.keys())[:20]}")
                print(f"  Results preview: {json.dumps(results, indent=2)[:500]}")
        else:
            print(f"  Top keys: {list(data.keys())}")
            print(f"  Preview: {json.dumps(data, indent=2)[:500]}")
    except Exception as e:
        print(f"  ERROR: {e}")

# Try different league filters for upcoming (to find real football, not esoccer)
try_endpoint("Upcoming with league_id=1 (try Premier League?)", 
    f"{BASE}/v3/events/upcoming", {"sport_id": 1, "league_id": 1})

# Try football-specific endpoint patterns
try_endpoint("Upcoming page=2", 
    f"{BASE}/v3/events/upcoming", {"sport_id": 1, "page": 2})

# Try to see if there's a league search
try_endpoint("Leagues list",
    f"{BASE}/v3/leagues", {"sport_id": 1})

# Try v1 endpoints for team
try_endpoint("Team search v1 (Poland)",
    f"{BASE}/v1/team", {"name": "Poland"})

# Try events with specific country or filter
try_endpoint("Upcoming day=20250610",
    f"{BASE}/v3/events/upcoming", {"sport_id": 1, "day": "20250610"})

# Try upcoming with cc (country code)
try_endpoint("Upcoming cc=pl",
    f"{BASE}/v3/events/upcoming", {"sport_id": 1, "cc": "pl"})

# Check ended events with a page further in
try_endpoint("Ended page=5",
    f"{BASE}/v3/events/ended", {"sport_id": 1, "page": 5})

print("\n\n=== Done exploring ===")
