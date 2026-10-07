@echo off
chcp 65001 >nul
title DnD Tools - Build, Commit & Push
cd /d "%~dp0"
echo ========================================
echo   DND Tools - 推送更新(构建+提交+双推)
echo ========================================
echo.
where git >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 git。请安装 https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/4] 重建合集(node build.js,改过源码必须跑;没改也无害)...
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 node。请安装 Node.js 后重试。
    pause
    exit /b 1
)
node build.js
if errorlevel 1 (
    echo [错误] 构建失败,已中止(未提交未推送)。
    pause
    exit /b 1
)

echo.
echo [2/4] 暂存改动...
git add -A
git status --short
if "%ERRORLEVEL%" neq "0" (
    echo [错误] git add 失败。
    pause
    exit /b 1
)

git diff --cached --quiet
if %ERRORLEVEL% equ 0 (
    echo 没有需要提交的改动。
    goto PULL
)

echo.
set /p MSG=提交说明(回车默认"更新工具站"):
if "%MSG%"=="" set MSG=更新工具站
git commit -m "%MSG%"
if errorlevel 1 (
    echo [错误] 提交失败,已中止。
    pause
    exit /b 1
)

:PULL
echo.
echo [3/4] 拉取合并另一台电脑的进度(若有)...
git -c http.proxy= -c https.proxy= pull --rebase origin main
if errorlevel 1 (
    echo.
    echo [注意] 拉取/合并失败。若提示冲突,请手动解决后重新运行本脚本;
    echo 或把冲突处理交给 AI:在源码目录执行 git status 查看冲突文件。
    pause
    exit /b 1
)

echo.
echo [4/4] 推送(双推:Gitee 同步另一台电脑 + GitHub 触发 Netlify 上线)...
git -c http.proxy= -c https.proxy= push origin main
if errorlevel 1 (
    echo.
    echo [注意] 推送未完全成功(常见:GitHub 被网络拦截)。
    echo  - Gitee 若已成功:另一台电脑可正常拉取,只是网站暂未更新;
    echo  - 网络恢复后重新双击本脚本,或单独补推: git push github main
) else (
    echo.
    echo [完成] 已推送!网站 https://yourbestdndself.netlify.app 将在 1~2 分钟后自动更新。
)
echo.
echo 最近提交:
git log --oneline -3
echo.
pause
