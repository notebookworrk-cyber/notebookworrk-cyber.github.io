@echo off
cd /d "%~dp0"
echo Starting Meridian sync...
node server\index.mjs
echo.
pause
