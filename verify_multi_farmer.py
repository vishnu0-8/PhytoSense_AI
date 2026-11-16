"""PlantAI multi-farmer authentication/isolation smoke test.
Run from project root: python verify_multi_farmer.py
Uses two existing farmer accounts and does not modify or delete project data.
"""
import getpass
import sys
import requests

BASE = input("Backend URL [http://localhost:8000]: ").strip() or "http://localhost:8000"
BASE = BASE.rstrip("/")


def login(label):
    print(f"\n{label} account")
    identifier = input("Email or mobile: ").strip()
    password = getpass.getpass("Password: ")
    session = requests.Session()
    response = session.post(
        f"{BASE}/api/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=20,
    )
    if response.status_code != 200:
        raise RuntimeError(f"{label} login failed ({response.status_code}): {response.text[:300]}")
    me = session.get(f"{BASE}/api/auth/me", timeout=20)
    if me.status_code != 200:
        raise RuntimeError(f"{label} session cookie was not accepted: {me.status_code}")
    print(f"PASS: {label} login and session cookie")
    return session


def check(session, path, expected, label):
    response = session.get(f"{BASE}{path}", timeout=30)
    if response.status_code != expected:
        raise RuntimeError(
            f"FAIL: {label}: expected HTTP {expected}, got {response.status_code}: {response.text[:250]}"
        )
    print(f"PASS: {label} (HTTP {expected})")
    return response


def main():
    print("\nPlantAI multi-farmer verification")
    health = requests.get(f"{BASE}/api/health", timeout=20)
    if health.status_code != 200:
        raise RuntimeError(f"Backend health check failed: HTTP {health.status_code}")
    print("PASS: backend health")

    anonymous = requests.Session()
    for path in ("/api/auth/me", "/api/history", "/api/dashboard/stats", "/api/conversations"):
        check(anonymous, path, 401, f"anonymous access blocked for {path}")

    farmer_a = login("Farmer A")
    check(farmer_a, "/api/history", 200, "Farmer A detection history")
    check(farmer_a, "/api/dashboard/stats", 200, "Farmer A dashboard stats")
    check(farmer_a, "/api/dashboard/analytics?period=7d", 200, "Farmer A analytics")
    conversations_response = check(farmer_a, "/api/conversations", 200, "Farmer A conversations")
    conversations = conversations_response.json().get("conversations", [])

    farmer_b = login("Farmer B")
    check(farmer_b, "/api/history", 200, "Farmer B detection history")
    check(farmer_b, "/api/dashboard/stats", 200, "Farmer B dashboard stats")
    check(farmer_b, "/api/dashboard/analytics?period=7d", 200, "Farmer B analytics")
    check(farmer_b, "/api/conversations", 200, "Farmer B conversations")

    if conversations:
        conversation_id = conversations[0].get("id")
        if conversation_id is not None:
            check(farmer_a, f"/api/chat/{conversation_id}", 200, "Farmer A can open own conversation")
            check(farmer_b, f"/api/chat/{conversation_id}", 404, "Farmer B cannot open Farmer A conversation")
        else:
            print("SKIP: conversation ownership test (conversation list has no id field)")
    else:
        print("SKIP: conversation ownership test (Farmer A has no saved conversations)")

    logout = farmer_a.post(f"{BASE}/api/auth/logout", timeout=20)
    if logout.status_code != 200:
        raise RuntimeError(f"Logout failed: HTTP {logout.status_code}")
    check(farmer_a, "/api/auth/me", 401, "logout invalidates browser session")

    print("\nSUCCESS: All applicable multi-farmer checks passed.")
    print("If a check fails, save the full terminal output and share it before changing files.")


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as exc:
        print(f"NETWORK ERROR: {exc}")
        sys.exit(1)
    except Exception as exc:
        print(f"\nTEST FAILED: {exc}")
        sys.exit(1)
