@echo off
title X3F Games Server
cd /d "%~dp0"
echo ============================================
echo   X3F GAMES - local server
echo ============================================
echo.

rem --- find a Python launcher ---
set "PYCMD="
where python >nul 2>nul && set "PYCMD=python"
if not defined PYCMD ( where py >nul 2>nul && set "PYCMD=py" )

if defined PYCMD (
  echo Starting server with %PYCMD% on http://localhost:8000
  start "X3F Server" cmd /k "%PYCMD% -m http.server 8000"
  timeout /t 2 >nul
  start "" http://localhost:8000/X3F_Arena.html
  echo.
  echo Server window opened. Leave it running while you play.
  echo Games:
  echo   http://localhost:8000/X3F_Arena.html   ^(2D - works offline^)
  echo   http://localhost:8000/X3F_Ascent.html  ^(3D - needs internet^)
  echo.
  echo Close the server window when you are done.
  timeout /t 4 >nul
  goto :eof
)

rem --- fallback: try Node ---
where npx >nul 2>nul && (
  echo Python not found - starting Node server instead...
  start "X3F Server" cmd /k "npx --yes serve -l 8000"
  timeout /t 3 >nul
  start "" http://localhost:8000/X3F_Arena.html
  goto :eof
)

echo Could not find Python or Node on this PC.
echo Install Python from https://www.python.org/downloads/
echo ^(check "Add python.exe to PATH" during install^), then run this file again.
echo.
pause
