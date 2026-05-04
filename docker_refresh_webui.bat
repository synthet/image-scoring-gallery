@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================================
echo   Driftara Gallery - Docker Refresh
echo ========================================================
echo   Rebuilds the gallery image and restarts the container.
echo   Requires the backend (Postgres + WebUI) to be running
echo   via docker compose in the sibling backend folder.
echo.
echo   Available at: http://localhost:5173/
echo ========================================================
echo.

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop is not running. Please start it first.
    pause
    exit /b 1
)

REM Ensure the backend network exists (usually created by backend's docker compose)
docker network inspect image-scoring-backend_default >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Network 'image-scoring-backend_default' not found.
    echo           Please ensure the backend is running - docker_refresh_webui.bat in backend repo.
    echo           If you use a different project name, update docker-compose.yml networks.
    pause
)

echo [INFO] Building gallery image...
docker compose build gallery
if errorlevel 1 (
    echo [ERROR] Docker build failed.
    pause
    exit /b 1
)

echo [INFO] Starting gallery container...
docker compose up -d gallery
if errorlevel 1 (
    echo [ERROR] Docker compose up failed.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Gallery is running in Docker.
echo           URL: http://localhost:5173/
echo           Logs: docker compose logs -f gallery
echo.
pause
