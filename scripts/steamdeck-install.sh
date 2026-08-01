#!/usr/bin/env bash
#
# Установщик VelumVPN для Steam Deck
#
# Сохрани этот файл в ~/velumvpn-install.sh и запускай после каждого обновления SteamOS:
#   bash ~/velumvpn-install.sh
#

set -e

RELEASE_URL="https://github.com/Jidos86/VelumVPN/releases/latest/download/VelumVPN_x64.pkg.tar.xz"
SCRIPT_PATH="$HOME/velumvpn-install.sh"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()    { echo -e "\n${YELLOW}[${1}/${TOTAL}]${NC} $2"; }

TOTAL=5

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    Установка VelumVPN — Steam Deck   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Копируем скрипт в home если запустили из другого места
if [ "$(realpath "$0")" != "$(realpath "$SCRIPT_PATH")" ]; then
    cp "$0" "$SCRIPT_PATH"
    chmod +x "$SCRIPT_PATH"
    info "Скрипт сохранён в ~/velumvpn-install.sh"
fi

# Проверка SteamOS
if ! grep -qi "steamos" /etc/os-release 2>/dev/null; then
    warn "Это не Steam Deck / SteamOS — скрипт может работать некорректно"
fi

# Проверка интернета
if ! curl -s --max-time 5 https://github.com > /dev/null 2>&1; then
    error "Нет доступа к интернету. Подключись к Wi-Fi и попробуй снова."
fi

step 1 $TOTAL "Отключаем защиту от записи..."
sudo steamos-readonly disable
info "Готово"

step 2 $TOTAL "Инициализируем ключи пакетного менеджера..."
sudo pacman-key --init 2>/dev/null || true
sudo pacman-key --populate 2>/dev/null || true
info "Готово"

step 3 $TOTAL "Загружаем VelumVPN..."
PKG_FILE="/tmp/velumvpn-steamdeck.pkg.tar.xz"
curl -L --progress-bar "$RELEASE_URL" -o "$PKG_FILE"
info "Загружено"

step 4 $TOTAL "Устанавливаем..."
sudo pacman -U --noconfirm "$PKG_FILE"
rm -f "$PKG_FILE"
info "VelumVPN установлен"

step 5 $TOTAL "Настраиваем автопроверку после обновлений SteamOS..."

mkdir -p ~/.config/autostart

# Автозапуск при входе в KDE — проверяет наличие VelumVPN
cat > ~/.config/autostart/velumvpn-check.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=VelumVPN AutoCheck
Exec=/bin/bash -c 'sleep 10; if ! command -v velumvpn &>/dev/null && [ -f "$HOME/velumvpn-install.sh" ]; then kdialog --title "VelumVPN" --icon dialog-warning --yesno "После обновления SteamOS приложение VelumVPN было удалено.\n\nПереустановить сейчас? (~2 минуты)" 2>/dev/null && konsole --hold -e bash ~/velumvpn-install.sh; fi'
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF

# Ярлык на рабочем столе
mkdir -p ~/Desktop
cat > ~/Desktop/Восстановить\ VelumVPN.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=Восстановить VelumVPN
Comment=Запускать после обновления SteamOS
Exec=konsole --hold -e bash ~/velumvpn-install.sh
Icon=velumvpn
Terminal=false
Categories=Network;
EOF
chmod +x ~/Desktop/Восстановить\ VelumVPN.desktop
gio set ~/Desktop/Восстановить\ VelumVPN.desktop metadata::trusted true 2>/dev/null || true

info "Автопроверка настроена"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  VelumVPN успешно установлен!                        ║"
echo "║                                                       ║"
echo "║  После обновления SteamOS:                           ║"
echo "║  • При входе в систему появится диалог               ║"
echo "║    с предложением переустановить (автоматически)     ║"
echo "║  • Или нажми ярлык на рабочем столе                  ║"
echo "║    «Восстановить VelumVPN»                           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
