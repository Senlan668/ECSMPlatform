@echo off
chcp 65001 >nul 2>&1
setlocal

set "ROOT=%~dp0"

echo ============================================
echo     START - Kill old + Launch new
echo ============================================
echo.

echo [1/4] Stopping backend (port 8000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo       Kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo       Done.

echo [2/4] Stopping frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo       Kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo       Done.
echo.

echo [3/4] Starting backend (uvicorn)...
start "" cmd /k "chcp 65001 >nul & cd /d %ROOT% & call app\venv\Scripts\activate.bat & uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo       Backend: http://localhost:8000

echo [4/4] Starting frontend (vite)...
start "" cmd /k "chcp 65001 >nul & cd /d %ROOT%frontend & npm run dev"
echo       Frontend: http://localhost:3000
echo.

echo ============================================
echo     All services started!
echo     Backend:  http://localhost:8000
echo     Frontend: http://localhost:3000
echo     API Docs: http://localhost:8000/docs
echo ============================================
echo.
pause
