import requests

API_KEY = "FW26Ykh19VlJY0pkP0hN983HTnhI4MEZPMzCTY1v"
headers = {"Authorization": f"Token {API_KEY}"}

print("Searching for hollandm's kalimba samples...")
print("="*60)

resp = requests.get(
    'https://freesound.org/apiv2/search/text/',
    headers=headers,
    params={
        'query': 'kalimba',
        'filter': 'username:hollandm',
        'fields': 'id,name,duration,tags',
        'page_size': 30
    }
)

if resp.status_code == 200:
    data = resp.json()
    results = data.get('results', [])
    print(f"Found {len(results)} results from hollandm:")
    for s in results[:20]:
        dur = s.get('duration', 0)
        status = "✓" if dur < 5.0 else "✗ >5s"
        print(f"  {status} ID:{s['id']} | {dur:.1f}s | {s['name']}")
else:
    print(f"Failed: {resp.status_code} - {resp.text}")
