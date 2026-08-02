#!/usr/bin/env bash
#
# Установщик VelumVPN для Steam Deck
#
# Первая установка:
#   curl -Lo ~/velumvpn-install.sh https://github.com/Jidos86/VelumVPN/raw/main/scripts/steamdeck-install.sh
#   bash ~/velumvpn-install.sh
#
# После обновления SteamOS запустить снова — или нажать ярлык на рабочем столе.
#

set -e

RELEASE_URL="https://github.com/Jidos86/VelumVPN/releases/latest/download/VelumVPN_x64.pkg.tar.xz"
SCRIPT_PATH="$HOME/velumvpn-install.sh"
SERVICE_DIR="$HOME/.config/velumvpn-service"
VELUMVPN_WORK="$HOME/.config/com.velumvpn.app/work"
MIHOMO_BIN="/opt/VelumVPN/resources/sidecar/mihomo"
API_PORT=9090

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
step() { echo -e "\n${YELLOW}[$1/6]${NC} $2"; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    Установка VelumVPN — Steam Deck   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Сохраняем скрипт в home для повторного использования
if [ "$(realpath "$0" 2>/dev/null)" != "$(realpath "$SCRIPT_PATH" 2>/dev/null)" ]; then
    cp "$0" "$SCRIPT_PATH" && chmod +x "$SCRIPT_PATH"
    info "Скрипт сохранён в ~/velumvpn-install.sh"
fi

# Проверка интернета
curl -s --max-time 5 https://github.com > /dev/null 2>&1 || {
    echo -e "${RED}Нет доступа к интернету. Подключись к Wi-Fi.${NC}"; exit 1
}

step 1 "Отключаем защиту от записи..."
sudo steamos-readonly disable 2>/dev/null || true
info "Готово"

step 2 "Инициализируем пакетный менеджер..."
sudo pacman-key --init 2>/dev/null || true
sudo pacman-key --populate 2>/dev/null || true
info "Готово"

step 3 "Загружаем и устанавливаем VelumVPN..."
curl -L --progress-bar "$RELEASE_URL" -o /tmp/velumvpn-steamdeck.pkg.tar.xz
sudo pacman -U --noconfirm /tmp/velumvpn-steamdeck.pkg.tar.xz
rm -f /tmp/velumvpn-steamdeck.pkg.tar.xz
sudo chmod +sx /opt/VelumVPN/resources/sidecar/mihomo
sudo chmod 4755 /opt/VelumVPN/chrome-sandbox
info "VelumVPN установлен"

step 4 "Настраиваем фоновый VPN-сервис для Gaming Mode..."

mkdir -p "$SERVICE_DIR/work"

# Генерируем секрет для API если нет
if [ ! -f "$SERVICE_DIR/secret" ]; then
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 32 > "$SERVICE_DIR/secret"
fi
SECRET=$(cat "$SERVICE_DIR/secret")

# Скрипт запуска сервиса (ждёт пока не закроется VelumVPN, потом стартует; следит пока работает)
cat > "$SERVICE_DIR/run.sh" << RUNEOF
#!/usr/bin/env bash
WORK="$HOME/.config/com.velumvpn.app/work"
SVC_WORK="$SERVICE_DIR/work"
MIHOMO="$MIHOMO_BIN"
SECRET="$SECRET"
API_PORT=$API_PORT

_velumvpn_active() {
    pgrep -x velumvpn > /dev/null 2>&1 || ip link show velumvpn > /dev/null 2>&1
}

# Ждём пока VelumVPN не закроется
while _velumvpn_active; do sleep 3; done

# Копируем актуальный конфиг VelumVPN (если есть)
if [ -f "\$WORK/config.yaml" ]; then
    grep -v "^external-controller\|^secret\|^log-level" "\$WORK/config.yaml" > "\$SVC_WORK/config.yaml"
    cp "\$WORK/"*.dat "\$SVC_WORK/" 2>/dev/null || true
else
    printf '' > "\$SVC_WORK/config.yaml"
fi

# Добавляем внешний контроллер для Decky плагина
printf 'external-controller: 127.0.0.1:%s\nsecret: %s\nlog-level: silent\n' "\$API_PORT" "\$SECRET" >> "\$SVC_WORK/config.yaml"

# Запускаем mihomo в фоне
"\$MIHOMO" -d "\$SVC_WORK" &
MIHOMO_PID=\$!

# Следим: если VelumVPN открылся — останавливаем mihomo и выходим
# (systemd перезапустит нас через RestartSec и мы снова будем ждать закрытия)
while kill -0 \$MIHOMO_PID 2>/dev/null; do
    sleep 5
    if _velumvpn_active; then
        kill \$MIHOMO_PID 2>/dev/null
        wait \$MIHOMO_PID 2>/dev/null
        exit 0
    fi
done
RUNEOF
chmod +x "$SERVICE_DIR/run.sh"

# systemd user сервис
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/velumvpn-core.service" << SVCEOF
[Unit]
Description=VelumVPN Core (Gaming Mode)
After=network-online.target

[Service]
Type=simple
ExecStart=$SERVICE_DIR/run.sh
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
SVCEOF

systemctl --user daemon-reload
systemctl --user enable velumvpn-core
systemctl --user restart velumvpn-core
info "VPN-сервис запущен и включён в автозапуск"

step 5 "Устанавливаем Decky плагин..."

DECKY_PLUGINS="$HOME/homebrew/plugins"
PLUGIN_DIR="$DECKY_PLUGINS/VelumVPN"

if [ ! -d "$HOME/homebrew" ]; then
    info "Decky Loader не найден — устанавливаем автоматически..."
    curl -L https://github.com/SteamDeckHomebrew/decky-installer/releases/latest/download/install_release.sh | sh
fi

if [ -d "$HOME/homebrew" ]; then
    sudo mkdir -p "$PLUGIN_DIR/dist"
    sudo chown -R "$USER:" "$PLUGIN_DIR"

    cat > "$PLUGIN_DIR/plugin.json" << 'JSONEOF'
{
  "name": "VelumVPN",
  "author": "VelumVPN",
  "flags": [],
  "publish": {
    "overlayName": "VelumVPN",
    "tags": ["VPN", "Network", "Privacy"],
    "description": "VPN-клиент для обхода блокировок"
  }
}
JSONEOF

    # Python backend
    cat > "$PLUGIN_DIR/main.py" << PYEOF
import os, asyncio, subprocess, json
SECRET_FILE = os.path.expanduser("~/.config/velumvpn-service/secret")
API = "http://127.0.0.1:$API_PORT"

def _secret():
    try:
        return open(SECRET_FILE).read().strip()
    except:
        return ""

def _get(path):
    import urllib.request
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {_secret()}"})
    try:
        with urllib.request.urlopen(req, timeout=2) as r:
            return json.loads(r.read())
    except:
        return None

class Plugin:
    async def get_status(self):
        data = _get("/")
        running = data is not None
        tun = False
        if running:
            cfg = _get("/configs")
            tun = bool(cfg and cfg.get("tun", {}).get("enable"))
        return {"running": running, "tun": tun}

    async def get_traffic(self):
        data = _get("/traffic")
        return data or {"up": 0, "down": 0}

    async def toggle(self, enable: bool):
        action = "start" if enable else "stop"
        subprocess.run(["systemctl", "--user", action, "velumvpn-core"])
        await asyncio.sleep(2)
        return await self.get_status()

    async def _main(self):
        pass

    async def _unload(self):
        pass
PYEOF

    # JS-фронтенд в legacy Decky формате (eval-контекст, definePlugin + serverAPI)
    cat > "$PLUGIN_DIR/dist/index.js" << 'JSEOF'
const React = window.SP_REACT;
const { useState, useEffect } = React;

function fmt(b) {
  if (b < 1024) return b + " B/s";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB/s";
  return (b / 1048576).toFixed(1) + " MB/s";
}

function Content({ serverAPI }) {
  const [status, setStatus] = useState({ running: false, tun: false });
  const [traffic, setTraffic] = useState({ up: 0, down: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      const s = await serverAPI.callPluginMethod("get_status", {});
      if (s.success) setStatus(s.result);
      if (s.result && s.result.running) {
        const t = await serverAPI.callPluginMethod("get_traffic", {});
        if (t.success) setTraffic(t.result);
      }
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    const s = await serverAPI.callPluginMethod("toggle", { enable: !status.running });
    if (s.success) setStatus(s.result);
    setLoading(false);
  };

  const color = status.running ? "#00d4ff" : "#888";
  const label = status.tun ? "TUN активен" : status.running ? "Прокси активен" : "Выключен";

  return React.createElement("div", { style: { padding: "12px" } },
    React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }
    },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: "14px", fontWeight: "bold", color } }, "VelumVPN"),
        React.createElement("div", { style: { fontSize: "12px", color: "#aaa" } }, label)
      ),
      React.createElement("button", {
        onClick: handleToggle,
        disabled: loading,
        style: {
          background: status.running ? "#00d4ff" : "#444",
          color: status.running ? "#000" : "#fff",
          border: "none", borderRadius: "6px",
          padding: "8px 18px", fontSize: "13px",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1
        }
      }, loading ? "..." : status.running ? "Выкл" : "Вкл")
    ),
    status.running && React.createElement("div", {
      style: { fontSize: "12px", color: "#aaa", marginTop: "4px" }
    }, "↑ " + fmt(traffic.up) + " · ↓ " + fmt(traffic.down))
  );
}

definePlugin((serverAPI) => {
  return {
    title: React.createElement("div", { style: { fontWeight: "bold" } }, "VelumVPN"),
    content: React.createElement(Content, { serverAPI }),
    icon: React.createElement("span", { style: { fontSize: "16px", fontWeight: "bold", color: "#00d4ff" } }, "V"),
    onDismount() {}
  };
});
JSEOF

    info "Decky плагин установлен в $PLUGIN_DIR"
else
    warn "Decky Loader не удалось установить — плагин Gaming Mode пропущен"
    warn "Установи вручную с https://deckbrew.xyz и запусти скрипт снова"
fi

step 6 "Настраиваем автовосстановление..."

# Автозапуск при входе в KDE — предлагает переустановить если VelumVPN слетел
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/velumvpn-check.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=VelumVPN AutoCheck
Exec=/bin/bash -c 'sleep 10; if ! command -v velumvpn &>/dev/null && [ -f "$HOME/velumvpn-install.sh" ]; then kdialog --title "VelumVPN" --icon dialog-warning --yesno "После обновления SteamOS VelumVPN был удалён.\n\nПереустановить сейчас? (~2 минуты)" 2>/dev/null && konsole --hold -e bash ~/velumvpn-install.sh; fi'
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF

# Ярлык на рабочем столе
mkdir -p "$HOME/Desktop"
cat > "$HOME/Desktop/Восстановить VelumVPN.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=Восстановить VelumVPN
Comment=Запускать после обновления SteamOS
Exec=konsole --hold -e bash ~/velumvpn-install.sh
Icon=velumvpn
Terminal=false
Categories=Network;
EOF
chmod +x "$HOME/Desktop/Восстановить VelumVPN.desktop"
gio set "$HOME/Desktop/Восстановить VelumVPN.desktop" metadata::trusted true 2>/dev/null || true

info "Автовосстановление настроено"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Готово!                                                  ║"
echo "║                                                           ║"
echo "║  В Gaming Mode:                                           ║"
echo "║  • VPN запускается автоматически при загрузке            ║"
echo "║  • Управляй через Decky → VelumVPN (кнопка «···»)       ║"
echo "║                                                           ║"
echo "║  В Desktop Mode:                                          ║"
echo "║  • Используй VelumVPN как обычно                         ║"
echo "║  • Сервис Gaming Mode остановится автоматически          ║"
echo "║                                                           ║"
echo "║  После обновления SteamOS:                               ║"
echo "║  • Появится диалог переустановки при входе               ║"
echo "║  • Или нажми ярлык «Восстановить VelumVPN»               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
