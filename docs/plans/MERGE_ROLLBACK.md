# Emergency Rollback Procedure

**Last Updated**: 2025-11-12
**Safety Tags**:
- Scanner: `pre-merge-prep-20251112-0913`
- Parent: `pre-merge-prep-20251112-0914`

---

## When to Use This

Use this rollback procedure if:
- Critical bugs discovered after starting merge prep
- Test failures that block progress
- Need to restart merge preparation from clean state
- Merge conflicts that can't be resolved

---

## Scenario 1: Rollback During Preparation (Before PR Merge)

### Scanner Repo

```bash
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner
git checkout pr-4-review

# Hard reset to safety checkpoint
git reset --hard pre-merge-prep-20251112-0913

# Force push to PR branch (use with caution)
git push origin pr-4-review --force-with-lease

# Verify clean state
git status
git log -1
```

### Parent Repo

```bash
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem
git checkout feature/e2e-es6-scanner-alignment

# Hard reset to safety checkpoint
git reset --hard pre-merge-prep-20251112-0914

# Force push to PR branch (use with caution)
git push origin feature/e2e-es6-scanner-alignment --force-with-lease

# Verify clean state
git status
git log -1
```

### Clean Up After Rollback

```bash
# Scanner repo: clean node_modules if needed
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner
rm -rf node_modules package-lock.json
npm install

# Parent repo: clean if needed
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/backend
rm -rf node_modules package-lock.json
npm install
```

---

## Scenario 2: Rollback After PR Merge (Nuclear Option)

⚠️ **WARNING**: Only use this if PRs were already merged to main and there's a critical issue in production.

### Identify Merge Commits

```bash
# Scanner repo
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner
git checkout main
git log --oneline --merges | head -5

# Find the merge commit SHA for PR #4 and PR #5
```

### Revert Merges (Safest Approach)

```bash
# Scanner repo - revert PR #4 merge
git revert --mainline 1 <PR-4-merge-commit-sha>

# If PR #5 was also merged, revert it too
git revert --mainline 1 <PR-5-merge-commit-sha>

# Push revert commits
git push origin main
```

### Alternative: Hard Reset Main (DANGEROUS)

⚠️ **ONLY IF**: You are 100% sure no one else has pulled main.

```bash
# Scanner repo
git checkout main
git reset --hard pre-merge-prep-20251112-0913
git push origin main --force

# ⚠️ This WILL break anyone who pulled main after merge!
```

---

## Scenario 3: Partial Rollback (Cherry-Pick Good Changes)

If some changes are good but others need to be reverted:

```bash
# Create new branch from safety tag
git checkout -b fix/partial-rollback pre-merge-prep-20251112-0913

# Cherry-pick specific good commits
git cherry-pick <good-commit-sha-1>
git cherry-pick <good-commit-sha-2>

# Push and create new PR
git push origin fix/partial-rollback
```

---

## Verification After Rollback

### Scanner Repo

```bash
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner
git log -1  # Verify on safety tag commit
git status  # Should be clean
git diff pr-5-review  # Check differences
npm install
npm test  # May fail (Babel issue) - that's expected at safety tag
```

### Parent Repo

```bash
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem
git log -1  # Verify on safety tag commit
git status  # Should be clean
cd backend
npm run test:e2e  # Should pass 11-12/12 tests
```

---

## Recovery Options

### Option 1: Restart Merge Prep from Scratch

```bash
# After rollback, follow comprehensive merge plan from beginning
# Start at Phase 1.1 with new safety tags
```

### Option 2: Fix Issues and Continue

```bash
# Identify what went wrong
# Fix the specific issue
# Create new commits
# Continue from where you left off
```

### Option 3: Abandon and Re-Plan

```bash
# If approach was fundamentally flawed
# Review what went wrong
# Create new plan
# Start fresh
```

---

## Rollback Checklist

Before executing rollback:
- [ ] Document what went wrong
- [ ] Verify safety tags exist (`git tag --list "pre-merge-prep-*"`)
- [ ] Notify team (if applicable)
- [ ] Backup any work in progress
- [ ] Understand which scenario applies (1, 2, or 3)

After rollback:
- [ ] Verify git log shows safety tag commit
- [ ] Verify git status is clean
- [ ] Run baseline tests
- [ ] Document lessons learned
- [ ] Update merge plan if needed

---

## Contact Points

**Safety Tags**:
- Scanner: `pre-merge-prep-20251112-0913`
- Parent: `pre-merge-prep-20251112-0914`

**Baseline Test Results**:
- Scanner: `/tmp/scanner-baseline-tests.log` (19 failed test suites - expected)
- Parent: `/tmp/e2e-baseline-tests.log` (11/12 passing - 1 flaky)

**Comprehensive Plan**: `docs/plans/2025-11-12-comprehensive-merge-plan.md`

---

## Notes

- `--force-with-lease` is safer than `--force` (checks remote hasn't changed)
- Always verify with `git log` and `git status` after rollback
- Rollback doesn't delete tags - safety tags remain accessible
- Consider creating new safety tags before attempting again
