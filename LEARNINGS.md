# Development Learnings

## Windows Group Policy Bypass for Node.js

### Problem
On some Windows systems (especially corporate environments), group policy restrictions block execution of `npm`, `npx`, and other Node.js commands even when Node.js is installed.

**Symptoms:**
- `npm run dev` → "npm is not recognized" or "This program is blocked by group policy"
- `npx vite` → same errors
- `where.exe node` → returns nothing even though Node.js is installed

**Verification:**
```powershell
Test-Path "C:\Program Files\nodejs\npm.cmd"  # Returns True if Node.js is installed
```

### Solution
Bypass the restriction by calling `node.exe` directly with the script path:

```powershell
# Instead of:
npm run dev

# Use:
& "C:\Program Files\nodejs\node.exe" "node_modules\vite\bin\vite.js"
```

### Why This Works
- Group policy blocks `npm.cmd` and `npx.cmd` batch files
- But `node.exe` itself is not blocked
- Vite's CLI is just a JavaScript file that can be executed directly by node

### Other Commands
```powershell
# npm install equivalent (if npm is blocked)
# May need to manually download dependencies or use a different machine

# Running any npm script
& "C:\Program Files\nodejs\node.exe" "node_modules\[package]\bin\[script].js"
```