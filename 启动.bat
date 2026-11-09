@echo off
chcp 65001 >nul
cd /d "%~dp0site"
echo.
echo   Mao Method Knowledge Base
echo   Starting local server...
echo.
start "" "http://localhost:8099"
node server.mjs
pause
