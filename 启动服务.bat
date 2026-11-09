@echo off
chcp 65001 >nul
cd /d "%~dp0site"
echo.
echo   只启动后端服务（不打开浏览器）
echo   用途：给单文件 HTML 做「本地代理」，或用微信小程序的接口
echo   地址 http://localhost:8099
echo.
node server.mjs
pause
