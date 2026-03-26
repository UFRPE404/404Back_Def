"""Quick search for La Liga and international league IDs."""
import os, httpx

TOKEN = os.getenv("BETS_API_TOKEN", "248558-x464EYT2kttm4b")
BASE = "https://api.b365api.com"
client = httpx.Client(timeout=20)

# Try some specific ranges for La Liga, Champions League, etc.
keywords = ["la liga", "spain primera", "champions", "world cup", "nations league",
    "copa libertadores", "copa america", "euro ", "europa league", "conference league",
    "brasileir", "liga mx", "argentina primera"]

for lid in list(range(350, 700)) + list(range(1000, 1200)):
    try:
        r = client.get(f"{BASE}/v3/events/ended", params={
            "token": TOKEN, "sport_id": 1, "league_id": lid
        })
        data = r.json()
        results = data.get("results", [])
        if results:
            league = results[0].get("league", {})
            name = league.get("name", "")
            cc = league.get("cc")
            name_lower = name.lower()
            if cc and any(kw in name_lower for kw in keywords):
                print(f"  League {lid}: {name} ({cc})")
    except:
        pass

# Also check the league from Poland's upcoming match
print("\n=== Check league from upcoming events with known teams ===")
r = client.get(f"{BASE}/v3/events/upcoming", params={
    "token": TOKEN, "sport_id": 1, "page": 10
})
data = r.json()
for ev in data.get("results", []):
    league = ev.get("league", {})
    cc = league.get("cc")
    if cc:
        name = league.get("name", "")
        if any(kw in name.lower() for kw in keywords):
            lid = league.get("id")
            print(f"  League {lid}: {name} ({cc})")
