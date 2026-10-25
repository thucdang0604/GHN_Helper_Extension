@echo off
chcp 65001 >nul
echo ========================================================
echo       GHN Helper Pro - Cong Cu Cap Nhat Tu Dong
echo ========================================================
echo.

where git >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] Dang keo ma nguon moi nhat tu GitHub...
    git pull origin main
    if %errorlevel% equ 0 (
        echo.
        echo [OK] Cap nhat thanh cong!
        echo Vui long vao edge://extensions hoac chrome://extensions va nhan nut Reload (Lam moi).
    ) else (
        echo.
        echo [!] Khong the cap nhat qua git. Vui long kiem tra ket noi.
    )
) else (
    echo [*] May khong co git. Dang mo trang tai ban moi nhat...
    start https://github.com/thucdang0604/GHN_Helper_Extension/releases/latest
)

echo.
pause
