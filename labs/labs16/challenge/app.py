from __future__ import annotations

import os

from flask import Flask, jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

app = Flask(__name__)
limiter = Limiter(key_func=get_remote_address, app=app, storage_uri="memory://")
FLAG = open("/app/flag.txt").read().strip() if os.path.exists("/app/flag.txt") else "FLAG{missing}"

_FIRST = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
    "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
    "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
    "Kenneth", "Carol", "Kevin", "Amanda", "Brian", "Dorothy", "George", "Melissa",
    "Edward", "Deborah", "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Sharon",
    "Jeffrey", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
    "Nicholas", "Angela", "Eric", "Shirley", "Jonathan", "Anna", "Stephen", "Brenda",
    "Larry", "Pamela", "Justin", "Emma", "Scott", "Nicole", "Brandon", "Helen",
    "Benjamin", "Samantha", "Samuel", "Katherine", "Raymond", "Christine", "Gregory", "Debra",
    "Frank", "Rachel", "Alexander", "Carolyn", "Patrick", "Janet", "Jack", "Catherine",
    "Dennis", "Maria", "Jerry", "Heather", "Tyler", "Diane", "Aaron", "Ruth",
    "Jose", "Julie", "Nathan", "Olivia", "Henry", "Joyce", "Douglas", "Virginia",
    "Peter", "Victoria", "Adam", "Kelly", "Zachary", "Lauren", "Walter", "Christina",
    "Kyle", "Joan", "Harold", "Evelyn", "Carl", "Judith", "Arthur", "Megan",
    "Gerald", "Andrea", "Roger", "Cheryl", "Keith", "Hannah", "Lawrence", "Jacqueline",
    "Albert", "Martha", "Terry", "Gloria", "Sean", "Teresa", "Christian", "Ann",
    "Austin", "Sara", "Jesse", "Madison", "Dylan", "Frances", "Bryan", "Kathryn",
    "Joe", "Janice", "Jordan", "Jean", "Billy", "Abigail", "Bruce", "Alice",
    "Ralph", "Judy", "Roy", "Sophia", "Eugene", "Grace", "Russell", "Denise",
    "Louis", "Amber", "Philip", "Doris", "Randy", "Marilyn", "Howard", "Danielle",
    "Vincent", "Beverly", "Bobby", "Isabella", "Johnny", "Theresa", "Phillip", "Diana",
]
_LAST = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
    "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz",
    "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales", "Murphy", "Cook",
    "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper", "Peterson", "Bailey", "Reed",
    "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward", "Richardson", "Watson",
    "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray", "Mendoza", "Ruiz",
    "Hughes", "Price", "Alvarez", "Castillo", "Sanders", "Patel", "Myers", "Long",
    "Ross", "Foster", "Jimenez", "Powell",
]
_DEPTS = [
    "Engineering", "Sales", "Operations", "Marketing", "Finance", "HR",
    "Research", "Support", "Legal", "Product", "Design", "Security",
]

def _build_users():
    users = []
    for i in range(200):
        fn = _FIRST[i % len(_FIRST)]
        ln = _LAST[i % len(_LAST)]
        dept = _DEPTS[i % len(_DEPTS)]
        uid = i + 1
        users.append({
            "id": uid,
            "name": f"{fn} {ln}",
            "email": f"{fn.lower()}.{ln.lower()}@company.com",
            "phone": f"555-{uid:04d}",
            "department": dept,
        })
        flag_pos = 172  # 0-based index
    users[flag_pos] = {
        "id": flag_pos + 1,
        "name": "Morgan Chen",
        "email": FLAG,
        "phone": f"555-{flag_pos + 1:04d}",
        "department": "Operations",
    }
    return users

USERS = _build_users()

@app.get("/")
def index() -> str:
    return "<h1>Staff Directory</h1><!-- Staff directory API: GET /api/search?q=<name> -->"

@app.get("/api/search")
@limiter.limit("5/30second", override_defaults=False)
def search() -> tuple:
    q = request.args.get("q", "").lower()
    if not q:
        return jsonify({"error": "query parameter 'q' is required"}), 400
    results = [u for u in USERS if q in u["name"].lower()]
    return jsonify(results), 200

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
