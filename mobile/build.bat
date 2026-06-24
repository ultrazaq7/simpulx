@echo off
REM ============================================
REM Simpulx Mobile - Build Script
REM ============================================
REM
REM Usage:
REM   build.bat dev      - Build dev APK (emulator)
REM   build.bat staging  - Build staging APK
REM   build.bat prod     - Build production APK
REM   build.bat          - Show this help
REM
REM Examples:
REM   build.bat dev
REM   build.bat staging
REM   build.bat prod
REM

cd /d "%~dp0"

if "%1"=="" goto help
if "%1"=="dev" goto dev
if "%1"=="staging" goto staging
if "%1"=="prod" goto prod
goto help

:dev
echo [BUILD] Building DEV APK (http://10.0.2.2:8080)...
flutter build apk --flavor dev --release
goto done

:staging
echo [BUILD] Building STAGING APK (https://staging.simpulx.com)...
flutter build apk --flavor staging --release
goto done

:prod
echo [BUILD] Building PRODUCTION APK (https://app.simpulx.com)...
flutter build apk --flavor prod --release
goto done

:help
echo.
echo  Simpulx Mobile Build Script
echo  ============================
echo.
echo  Usage: build.bat [environment]
echo.
echo  Environments:
echo    dev      - Dev build (emulator, localhost backend)
echo    staging  - Staging build (staging.simpulx.com)
echo    prod     - Production build (app.simpulx.com)
echo.
echo  Output: mobile\build\app\outputs\flutter-apk\
echo.
echo  Examples:
echo    build.bat dev
echo    build.bat staging
echo    build.bat prod
echo.
goto :eof

:done
echo.
echo  Done! APK location:
echo  mobile\build\app\outputs\flutter-apk\app-prod-release.apk
echo.
