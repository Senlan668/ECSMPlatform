@echo off
chcp 65001 >nul 2>&1
setlocal

echo ============================================
echo     STOP - Kill all services
echo ============================================
echo.

echo [1/2] Stopping backend (port 8000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo       Kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo       Done.

echo [2/2] Stopping frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo       Kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo       Done.

echo.
echo ============================================
echo     All services stopped.
echo ============================================
echo.
pause
