"""Find major league IDs in b365api."""
import os, httpx

TOKEN = os.getenv("BETS_API_TOKEN", "248558-x464EYT2kttm4b")
BASE = "https://api.b365api.com"
client = httpx.Client(timeout=20)

# Scan a wide range of league IDs looking for major competitions
major_keywords = ["premier", "la liga", "bundesliga", "serie a", "ligue 1", 
    "eredivisie", "brasileir", "campeonato brasileiro", "champions league",
    "europa league", "world cup", "nations league", "copa america",
    "serie b", "championship", "segunda", "2. bundesliga", "liga portugal",
    "mls", "serie a brazil"]

found = {}
for lid in range(1, 1000):
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
            if cc:  # real football
                name_lower = name.lower()
                is_major = any(kw in name_lower for kw in major_keywords)
                if is_major:
                    found[lid] = (name, cc)
                    print(f"  ★ League {lid}: {name} ({cc})")
    except:
        pass

print(f"\n=== Found {len(found)} major leagues ===")
for lid, (name, cc) in sorted(found.items()):
    print(f"  {lid}: {name} ({cc})")
