@echo off
title Updating Vercel...
color 0b
echo ======================================================================
echo          UPDATING ENTRY ^& VERIFY SYSTEM ON VERCEL
echo ======================================================================
echo.

set "PATH=C:\Users\dibya\AppData\Local\NodeJS\node-v20.18.0-win-x64;C:\Users\dibya\AppData\Local\MinGit\cmd;%PATH%"

cd /d "%~dp0"

echo [1/3] Adding changes and committing...
git add .
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Fix total and grand total auto sum formulas on new report entry"
git commit -m "%MSG%"

echo [2/3] Connecting to GitHub (dib1297/entry-report-vercel)...
echo [3/3] Pushing latest updates to main branch...
echo.

git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    color 0a
    echo ======================================================================
    echo   [SUCCESS] Code pushed to GitHub successfully!
    echo   Vercel has automatically started building and deploying your update.
    echo   Your website will be live in 1-2 minutes!
    echo ======================================================================
) else (
    echo.
    color 0c
    echo ======================================================================
    echo   [NOTICE] If GitHub requested sign-in, please complete it above.
    echo ======================================================================
)

echo.
echo Press any key to close this window...
pause >nul
