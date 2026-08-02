import React, { useState, useEffect } from "react";
import { callable, definePlugin } from "@decky/api";
import { PanelSection, PanelSectionRow, ToggleField, Field, staticClasses } from "@decky/ui";

const getStatus = callable<[], { running: boolean; tun: boolean }>("get_status");
const getTraffic = callable<[], { up: number; down: number }>("get_traffic");
const toggle = callable<[boolean], { running: boolean; tun: boolean }>("toggle");

function fmt(b: number): string {
    if (b < 1024) return `${b} B/s`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB/s`;
    return `${(b / 1048576).toFixed(1)} MB/s`;
}

function Content() {
    const [status, setStatus] = useState({ running: false, tun: false });
    const [traffic, setTraffic] = useState({ up: 0, down: 0 });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const refresh = async () => {
            const s = await getStatus();
            setStatus(s);
            if (s.running) {
                const t = await getTraffic();
                setTraffic(t);
            }
        };
        refresh();
        const id = setInterval(refresh, 3000);
        return () => clearInterval(id);
    }, []);

    const handleToggle = async (val: boolean) => {
        setLoading(true);
        const s = await toggle(val);
        setStatus(s);
        setLoading(false);
    };

    return (
        <PanelSection>
            <PanelSectionRow>
                <ToggleField
                    label="VPN"
                    description={status.tun ? "TUN активен" : status.running ? "Прокси активен" : "Выключен"}
                    checked={status.running}
                    onChange={handleToggle}
                    disabled={loading}
                />
            </PanelSectionRow>
            {status.running && (
                <PanelSectionRow>
                    <Field label="Трафик">
                        ↑ {fmt(traffic.up)} · ↓ {fmt(traffic.down)}
                    </Field>
                </PanelSectionRow>
            )}
        </PanelSection>
    );
}

export default definePlugin(() => ({
    name: "VelumVPN",
    title: <div className={staticClasses.Title}>VelumVPN</div>,
    content: <Content />,
    icon: <span style={{ fontSize: "14px", fontWeight: "bold" }}>V</span>,
    onDismount() {},
}));
