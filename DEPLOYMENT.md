# ALNScanner Deployment Guide

## Development Workflow

### Option 1: Standalone Vite Dev Server (Recommended for fast iteration)
```bash
npm run dev
# Opens https://localhost:8443
# Hot reload enabled
# API requests proxied to backend at https://localhost:3000
```

### Option 2: Via Backend Orchestrator (Full integration testing)
```bash
# Terminal 1: Start backend
cd ../backend
npm run dev:full

# Terminal 2: Scanner served via backend
# Access at https://localhost:3000/gm-scanner/
# (Uses symlink: backend/public/gm-scanner → ALNScanner/)
```

## Production Build

### Build for Standalone Deployment
```bash
npm run build
# Output: dist/
# Deploy dist/ contents to any static host
```

### Build for Backend Integration
```bash
npm run build:backend
# Output: dist/ with base path /gm-scanner/
# Backend serves via symlink at https://[IP]:3000/gm-scanner/
```

### GitHub Pages Deployment

Automatic deployment on push to main:

1. Push to `main` branch
2. GitHub Actions runs `sync.yml` workflow
3. Builds with `/ALNScanner/` base path
4. Deploys to: https://maxepunk.github.io/ALNScanner/

Manual build for GitHub Pages testing:
```bash
npm run build:pages
# Output: dist/ with /ALNScanner/ base path
```

## Port Configuration

- **Backend Orchestrator**: 3000 (HTTPS), 8000 (HTTP redirect)
- **Scanner Dev Server**: 8443 (HTTPS)
- **VLC**: 8080 (HTTP, internal only)
- **Discovery Service**: 8888 (UDP)

## CORS & API Integration

Vite dev server (8443) proxies `/api/*` requests to backend (3000) automatically.

Backend's `.env` has automatic CORS detection for local networks:
- Allows: 10.x, 172.16-31.x, 192.168.x, *.local
- Scanner dev server at localhost:8443 is allowed

## Deployment Checklist

### For Development
- [ ] Backend running on port 3000
- [ ] Scanner dev server on port 8443 OR served via backend symlink
- [ ] Both use HTTPS (required for NFC API)
- [ ] Browser accepts self-signed certificates

### For Production
- [ ] Build with `npm run build:backend`
- [ ] Verify dist/ output
- [ ] Backend symlink points to correct location
- [ ] Token data synced (git submodule update)
- [ ] HTTPS certificates valid
- [ ] Orchestrator environment configured
