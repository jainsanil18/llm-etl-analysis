@echo off
echo ========================================
echo Starting Chrome with Debug Port 9222
echo ========================================
echo.
echo IMPORTANT: Close ALL other Chrome windows first!
echo.
echo After Chrome opens, run: npm run test:cdp
echo.
echo ========================================

"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%CD%\chrome_profile_cdp"
