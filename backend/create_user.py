import sys
import argparse
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import SessionLocal
from models import User
from api.routes_auth import hash_password

def create_or_update_user(username: str, email: str, password: str, full_name: str = "", role: str = "officer"):
    db = SessionLocal()
    try:
        user = db.query(User).filter((User.username == username) | (User.email == email)).first()
        hashed = hash_password(password)

        if user:
            print(f"[INFO] User found (id={user.id}, username='{user.username}'). Updating password and details...")
            user.username = username
            user.email = email
            user.hashed_password = hashed
            if full_name:
                user.full_name = full_name
            user.role = role
            user.is_active = True
            db.commit()
            db.refresh(user)
            print(f"[SUCCESS] User '{user.username}' successfully updated!")
            return user
        else:
            print(f"[INFO] Creating new user '{username}'...")
            new_user = User(
                username=username,
                email=email,
                full_name=full_name or username.capitalize(),
                hashed_password=hashed,
                role=role,
                is_active=True
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            print(f"[SUCCESS] User '{new_user.username}' (id={new_user.id}) successfully created!")
            return new_user
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to create/update user: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create or update a user for IGNITE SHIELD")
    parser.add_argument("--username", "-u", default="admin", help="Username (default: admin)")
    parser.add_argument("--email", "-e", default="admin@igniteshield.com", help="Email (default: admin@igniteshield.com)")
    parser.add_argument("--password", "-p", default="Admin@123", help="Password (default: Admin@123)")
    parser.add_argument("--name", "-n", default="Forest Officer Admin", help="Full name")
    parser.add_argument("--role", "-r", default="officer", help="Role (default: officer)")

    args = parser.parse_args()

    user = create_or_update_user(
        username=args.username,
        email=args.email,
        password=args.password,
        full_name=args.name,
        role=args.role
    )

    print("\n-------------------------------------------")
    print("User Credentials Ready for Login:")
    print(f"  Username: {user.username}")
    print(f"  Email:    {user.email}")
    print(f"  Password: {args.password}")
    print(f"  Role:     {user.role}")
    print("-------------------------------------------\n")
