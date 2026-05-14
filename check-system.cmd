@echo off
echo Checking system for Delta Scanner V7...
echo.
node -v
if errorlevel 1 (
  echo Node.js not found. Install Node.js 18 or newer, then run again.
  pause
  exit /b 1
)
echo.
echo OK. Node.js is available.
pause
