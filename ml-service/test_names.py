"""Quick test: find Brazil/Argentina in b365api."""
import os, httpx, time

TOKEN = os.getenv("BETS_API_TOKEN", "248558-x464EYT2kttm4b")
BASE = "https://api.b365api.com"
client = httpx.Client(timeout=20)

def search(home, away, days_back):
    ts = int(time.time()) - days_back * 86400
    r = client.get(f"{BASE}/v3/events/search", params={
        "token": TOKEN, "sport_id": 1,
        "home": home, "away": away, "time": str(ts)
    })
    data = r.json()
    results = data.get("results", [])
    if results:
        ev = results[0]
        print(f"  FOUND: {ev.get('home',{}).get('name')} vs {ev.get('away',{}).get('name')} [{ev.get('league',{}).get('name')}]")
        return ev
    return None

# Try various name combinations and time ranges
for h, a in [("Brazil", "Argentina"), ("Brasil", "Argentina"), 
             ("Brazil", "Uruguay"), ("Brazil", "Colombia"),
             ("Brazil", "Chile"), ("Brazil", "Paraguay"),
             ("Argentina", "Uruguay"), ("Argentina", "Colombia")]:
    print(f"\n{h} vs {a}:")
    for days in [30, 90, 180, 365, 730]:
        ev = search(h, a, days)
        if ev:
            break

# Also try with "W" suffix (women) and check
print("\n\nLet's search club-level:")
for h, a in [("Flamengo", "Palmeiras"), ("Corinthians", "Sao Paulo"),
             ("Liverpool", "Manchester City"), ("Bayern", "Dortmund")]:
    print(f"\n{h} vs {a}:")
    for days in [30, 90, 180, 365]:
        ev = search(h, a, days)
        if ev:
            break
