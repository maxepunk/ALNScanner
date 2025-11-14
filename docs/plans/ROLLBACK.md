# Rollback Procedure

## If migration fails at any point:

### Option 1: Revert to checkpoint
```bash
git reset --hard pre-es6-migration
git push origin feature/es6-module-migration --force
```

### Option 2: Delete branch and start over
```bash
git checkout main
git branch -D feature/es6-module-migration
git worktree remove ../ALNScanner-es6-migration
```

### Option 3: Cherry-pick successful tasks
```bash
git checkout main
git cherry-pick <successful-commit-hash>
```
