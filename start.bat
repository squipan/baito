@echo off
echo Starting My Income...

:: Try Python first
python -m http.server 3000 --directory "%~dp0" >nul 2>&1
if %errorlevel% == 0 goto :python

:: Try Python3
python3 -m http.server 3000 --directory "%~dp0" >nul 2>&1
if %errorlevel% == 0 goto :python

:: Fallback: npx serve
where npx >nul 2>&1
if %errorlevel% == 0 goto :node

:: Last resort: just open the file directly
echo No server found, opening file directly (some features may not work)
start "" "%~dp0index.html"
goto :end

:python
start "" http://localhost:3000
python -m http.server 3000 --directory "%~dp0"
goto :end

:node
start "" http://localhost:3000
npx -y serve "%~dp0" -p 3000 -s
goto :end

:end
