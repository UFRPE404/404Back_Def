"""Test events/search with time param, and scan for real football teams."""
import os, httpx, json, time

TOKEN = os.getenv("BETS_API_TOKEN", "248558-x464EYT2kttm4b")
BASE = "https://api.b365api.com"
client = httpx.Client(timeout=20)

# 1. Try events/search with time
print("=== events/search with time ===")
now = int(time.time())
for endpoint_time in [str(now), str(now - 86400), str(now + 86400)]:
    try:
        r = client.get(f"{BASE}/v3/events/search", params={
            "token": TOKEN, "sport_id": 1, 
            "home": "Poland", "away": "Albania", "time": endpoint_time
        })
        data = r.json()
        print(f"  time={endpoint_time}: success={data.get('success')} "
              f"results={len(data.get('results',[]))} "
              f"error={data.get('error','')}")
        if data.get("results"):
            for ev in data["results"][:3]:
                print(f"    {ev.get('home',{}).get('name')} vs {ev.get('away',{}).get('name')}")
    except Exception as e:
        print(f"  ERROR: {e}")

# 2. Scan upcoming events filtering out esoccer to find REAL football
print("\n=== Scanning upcoming for REAL football ===")
real_teams = set()
for page in range(1, 20):
    try:
        r = client.get(f"{BASE}/v3/events/upcoming", params={
            "token": TOKEN, "sport_id": 1, "page": page
        })
        data = r.json()
        results = data.get("results", [])
        if not results:
            print(f"  Page {page}: No more results")
            break
        for ev in results:
            league = ev.get("league", {})
            league_name = league.get("name", "")
            cc = league.get("cc")
            # Filter: real football has country code, no "Esoccer"/"esoccer" in name
            if cc and "soccer" not in league_name.lower() and "esoccer" not in league_name.lower():
                home = ev.get("home", {})
                away = ev.get("away", {})
                real_teams.add((home.get("name"), home.get("id"), league_name))
                real_teams.add((away.get("name"), away.get("id"), league_name))
    except:
        break

print(f"  Found {len(real_teams)} real teams across upcoming events")
# Show some
for name, tid, league in sorted(real_teams, key=lambda x: x[2])[:30]:
    print(f"    [{tid}] {name} ({league})")

# 3. Check if any Polish national team is there
print("\n=== Looking for national teams ===")
for name, tid, league in real_teams:
    if name and any(kw in name.lower() for kw in ["poland", "albania", "germany", "france", "brazil", "argentina", "spain", "england", "italy"]):
        print(f"  [{tid}] {name} ({league})")

# 4. Also scan ended for real football
print("\n=== Scanning ended for REAL football ===")
real_ended_teams = set()
for page in range(1, 10):
    try:
        r = client.get(f"{BASE}/v3/events/ended", params={
            "token": TOKEN, "sport_id": 1, "page": page
        })
        data = r.json()
        results = data.get("results", [])
        if not results:
            break
        for ev in results:
            league = ev.get("league", {})
            league_name = league.get("name", "")
            cc = league.get("cc")
            if cc and "soccer" not in league_name.lower() and "esoccer" not in league_name.lower():
                home = ev.get("home", {})
                away = ev.get("away", {})
                real_ended_teams.add((home.get("name"), home.get("id"), league_name))
                real_ended_teams.add((away.get("name"), away.get("id"), league_name))
    except:
        break

print(f"  Found {len(real_ended_teams)} real teams in ended events")
for name, tid, league in sorted(real_ended_teams, key=lambda x: x[2])[:30]:
    print(f"    [{tid}] {name} ({league})")

# 5. Try getting history for a known league like EPL (94)
print("\n=== EPL ended events (league 94) ===")
try:
    r = client.get(f"{BASE}/v3/events/ended", params={
        "token": TOKEN, "sport_id": 1, "league_id": 94
    })
    data = r.json()
    for ev in data.get("results", [])[:5]:
        home = ev.get("home", {})
        away = ev.get("away", {})
        print(f"  [{ev.get('id')}] {home.get('name')} ({home.get('id')}) vs "
              f"{away.get('name')} ({away.get('id')}) = {ev.get('ss')}")
except Exception as e:
    print(f"  ERROR: {e}")

# 6. If we have a team_id, get its history
print("\n=== Team history by team_id (Arsenal from EPL) ===")
# We'll use whatever team_id we find from EPL
try:
    r = client.get(f"{BASE}/v3/events/ended", params={
        "token": TOKEN, "sport_id": 1, "league_id": 94
    })
    data = r.json()
    results = data.get("results", [])
    if results:
        sample_team_id = results[0].get("home", {}).get("id")
        sample_team_name = results[0].get("home", {}).get("name")
        print(f"  Using team: {sample_team_name} ({sample_team_id})")
        
        r2 = client.get(f"{BASE}/v3/events/ended", params={
            "token": TOKEN, "sport_id": 1, "team_id": sample_team_id
        })
        data2 = r2.json()
        for ev in data2.get("results", [])[:5]:
            print(f"    {ev.get('home',{}).get('name')} vs {ev.get('away',{}).get('name')} = {ev.get('ss')}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n=== Done ===")
