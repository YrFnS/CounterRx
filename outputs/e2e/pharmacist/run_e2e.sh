#!/bin/bash
# E2E test for CounterRx - Pharmacist role
set -e
SESSION="pharm2"
OUT="outputs/e2e/pharmacist"
mkdir -p "$OUT"

B="agent-browser --session $SESSION"

echo "=== STEP 1: Login as R. Mensah, RPh / PIN 2222 ==="
$B open --no-sandbox http://localhost:3000
sleep 1.5
$B snapshot -i | head -5
$B screenshot "$OUT/01_lock_screen.png"

# Click R. Mensah profile
$B eval --stdin <<'EOF'
const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('R. Mensah'));
b && b.click();
JSON.stringify({clicked: !!b})
EOF
sleep 0.8
$B screenshot "$OUT/02_pin_entry.png"

# Enter PIN 2222
$B eval --stdin <<'EOF'
const twoBtn = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === '2');
if (twoBtn) { twoBtn.click(); twoBtn.click(); twoBtn.click(); twoBtn.click(); }
JSON.stringify({clicked: !!twoBtn})
EOF
sleep 1.5
$B screenshot "$OUT/03_register.png"

# Verify register loaded with name
$B eval --stdin <<'EOF'
JSON.stringify({
  bodyText: document.body.innerText.slice(0,500),
  navButtons: Array.from(document.querySelectorAll('button')).map(b=>b.innerText.replace(/\n/g,' ').replace(/\s+/g,' ').trim()).filter(x=>x)
})
EOF
