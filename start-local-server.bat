@echo off
setlocal
cd /d "%~dp0"
echo Starting Baby Growth at http://127.0.0.1:8080
if not exist "C:\Program Files\Python39\python.exe" (
  echo Python was not found at C:\Program Files\Python39\python.exe
  pause
  exit /b 1
)
"C:\Program Files\Python39\python.exe" "%~dp0local-server.py"
if errorlevel 1 pause
