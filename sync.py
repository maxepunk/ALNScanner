#!/usr/bin/env python3
"""
Simple bidirectional sync for ALN GM Scanner
Syncs token changes from/to shared repository (no QR code generation needed for GM app)
"""

import subprocess
import json
import os
import sys
from datetime import datetime

def run_command(cmd, description, capture=False):
    """Run a shell command and return output if requested"""
    print(f"📌 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0 and "nothing to commit" not in result.stdout:
            print(f"  ⚠️  {result.stderr.strip() or result.stdout.strip()}")
            return result.stdout if capture else False
        return result.stdout if capture else True
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return "" if capture else False

def sync_submodule():
    """Bidirectional sync with the shared token repository"""
    if not os.path.exists('data/.git'):
        print("⚠️  No git submodule found, initializing...")
        run_command("git submodule init", "Initializing submodule")
        run_command("git submodule update", "Getting initial data")
        return
    
    # Save current directory
    original_dir = os.getcwd()
    
    try:
        os.chdir('data')
        
        # Check if we have local changes
        status = run_command("git status --porcelain", "Checking for local changes", capture=True)
        has_local_changes = bool(status.strip())
        
        if has_local_changes:
            print("  📝 Found local changes to tokens")
            # Commit local changes
            run_command("git add tokens.json", "Staging token changes")
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            run_command(f'git commit -m "Update tokens from GM Scanner - {timestamp}"', "Committing changes")
            
            # Push to shared repo
            push_result = run_command("git push origin HEAD:main", "Pushing to shared repository")
            if push_result:
                print("  ✅ Pushed local changes to shared repo")
            else:
                print("  ⚠️  Could not push (may need to pull first)")
        
        # Pull latest changes
        run_command("git pull origin main --rebase", "Pulling latest from shared repo")
        
    finally:
        os.chdir(original_dir)
    
    # Update the parent repo's reference to the submodule
    run_command("git add data", "Updating submodule reference")
    run_command('git commit -m "Update submodule reference"', "Committing submodule update")

def load_tokens():
    """Load tokens from submodule or fallback location"""
    paths = ['data/tokens.json', 'tokens.json.backup']
    
    for path in paths:
        if os.path.exists(path):
            print(f"📄 Loading tokens from {path}")
            with open(path, 'r') as f:
                tokens = json.load(f)
                print(f"  ✅ Loaded {len(tokens)} tokens")
                return tokens, path
    
    print("❌ No tokens.json found!")
    return None, None

def verify_token_structure(tokens):
    """Verify tokens have required GM fields"""
    print("🔍 Verifying token structure for GM use...")
    
    required_fields = ['SF_RFID', 'SF_ValueRating', 'SF_MemoryType', 'SF_Group']
    missing_fields = []
    
    for token_id, token_data in list(tokens.items())[:5]:  # Check first 5 tokens
        for field in required_fields:
            if field not in token_data:
                missing_fields.append(f"{token_id}.{field}")
    
    if missing_fields:
        print(f"  ⚠️  Some tokens missing GM fields: {', '.join(missing_fields[:3])}")
    else:
        print("  ✅ Token structure valid for GM operations")

def deploy_to_github_pages():
    """Commit and push all changes to deploy via GitHub Pages"""
    print("🚀 Deploying to GitHub Pages...")
    
    # Check for changes
    status = run_command("git status --porcelain", "Checking for changes to deploy", capture=True)
    if not status.strip():
        print("  ✅ No changes to deploy")
        return True
    
    # Stage all changes
    run_command("git add -A", "Staging all changes")
    
    # Commit
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    commit_msg = f"🔄 Sync tokens for GM Scanner - {timestamp}"
    run_command(f'git commit -m "{commit_msg}"', "Committing changes")
    
    # Push to GitHub
    if run_command("git push origin main", "Pushing to GitHub Pages"):
        print("  ✅ Deployed successfully!")
        print("  🌐 Changes will be live in ~1-2 minutes")
        
        # Try to detect GitHub Pages URL
        remote_url = run_command("git remote get-url origin", "Getting repo URL", capture=True)
        if "github.com" in remote_url:
            # Extract username and repo from URL
            import re
            match = re.search(r'github\.com[:/]([^/]+)/([^/.]+)', remote_url)
            if match:
                user, repo = match.groups()
                print(f"  📱 GM Scanner live at: https://{user}.github.io/{repo}/")
        return True
    else:
        print("  ⚠️  Could not push to GitHub")
        print("  Run 'git push' manually when ready")
        return False

def main():
    """Main sync process for GM Scanner"""
    print("=" * 50)
    print("🎮 ALN GM Scanner - Token Sync")
    print("=" * 50)
    print()
    
    # Parse arguments
    deploy = '--deploy' in sys.argv
    local_only = '--local' in sys.argv
    
    if local_only:
        print("📍 LOCAL MODE - Will not push to GitHub")
        print()
    
    # Step 1: Sync with shared repository
    print("🔄 Syncing with shared token repository...")
    sync_submodule()
    print()
    
    # Step 2: Load and verify tokens
    tokens, source = load_tokens()
    if not tokens:
        print("❌ Cannot proceed without tokens")
        return 1
    
    print(f"📊 Found {len(tokens)} tokens for GM operations")
    verify_token_structure(tokens)
    print()
    
    # Note: GM Scanner doesn't need QR codes
    print("ℹ️  Note: GM Scanner uses NFC tokens - no QR generation needed")
    print("    Player Scanner handles QR code generation")
    print()
    
    # Step 3: Deploy to GitHub Pages (if requested)
    if deploy and not local_only:
        deploy_to_github_pages()
        print()
    elif not local_only:
        print("💡 Tip: Use 'python3 sync.py --deploy' to push to GitHub Pages")
        print()
    
    print("=" * 50)
    print("✨ Sync complete! Token database updated.")
    print("=" * 50)
    
    return 0

if __name__ == "__main__":
    # Show usage if --help
    if '--help' in sys.argv:
        print("""
ALN GM Scanner - Token Sync Tool

Usage:
  python3 sync.py           # Sync tokens from shared repository
  python3 sync.py --deploy  # Sync and deploy to GitHub Pages
  python3 sync.py --local   # Sync locally only (no GitHub push)
  
The GM Scanner syncs token data for NFC-based team gameplay.
QR codes are managed by the Player Scanner (aln-memory-scanner).

After running with --deploy, the GM interface will be live at your GitHub Pages URL.
        """)
        sys.exit(0)
    
    sys.exit(main())