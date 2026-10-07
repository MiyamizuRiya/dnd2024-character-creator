@echo off
chcp 65001 >nul
title DnD Tools - Pull Latest
cd /d "%~dp0"
echo ========================================
echo   DND Tools - Sync Latest Code
echo ========================================
echo.
where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] git not found. Install from https://git-scm.com/download/win
    pause
    exit /b 1
)
echo [1/2] Pulling from Gitee (origin/main) ...
git -c http.proxy= -c https.proxy= pull origin main
if errorlevel 1 (
    echo.
    echo Pull failed. Trying force-align to remote ...
    git -c http.proxy= -c https.proxy= fetch origin
    if not errorlevel 1 (
        git reset --hard origin/main
        echo [OK] Force-aligned to origin/main
    ) else (
        echo [ERROR] Cannot reach remote. Check network.
    )
) else (
    echo.
    echo [OK] Sync complete!
)
echo.
echo Recent changes:
git log --oneline -5
echo.
pause