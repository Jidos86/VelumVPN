const manifest = {"name":"VelumVPN"};
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
    throw new Error('[@decky/api]: Failed to connect to the loader as as the loader API was not initialized. This is likely a bug in Decky Loader.');
}
let api;
try {
    api = internalAPIConnection.connect(API_VERSION, manifest.name);
}
catch {
    api = internalAPIConnection.connect(1, manifest.name);
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version 1. Some features may not work.`);
}
if (api._version != API_VERSION) {
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version ${api._version}. Some features may not work.`);
}
const callable = api.callable;
const definePlugin = (fn) => {
    return (...args) => {
        return fn(...args);
    };
};

const getStatus = callable("get_status");
const getTraffic = callable("get_traffic");
const toggle = callable("toggle");
function fmt(b) {
    if (b < 1024)
        return `${b} B/s`;
    if (b < 1048576)
        return `${(b / 1024).toFixed(1)} KB/s`;
    return `${(b / 1048576).toFixed(1)} MB/s`;
}
function Content() {
    const [status, setStatus] = SP_REACT.useState({ running: false, tun: false });
    const [traffic, setTraffic] = SP_REACT.useState({ up: 0, down: 0 });
    const [loading, setLoading] = SP_REACT.useState(false);
    SP_REACT.useEffect(() => {
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
    const handleToggle = async (val) => {
        setLoading(true);
        const s = await toggle(val);
        setStatus(s);
        setLoading(false);
    };
    return (SP_REACT.createElement(DFL.PanelSection, null,
        SP_REACT.createElement(DFL.PanelSectionRow, null,
            SP_REACT.createElement(DFL.ToggleField, { label: "VPN", description: status.tun ? "TUN активен" : status.running ? "Прокси активен" : "Выключен", checked: status.running, onChange: handleToggle, disabled: loading })),
        status.running && (SP_REACT.createElement(DFL.PanelSectionRow, null,
            SP_REACT.createElement(DFL.Field, { label: "\u0422\u0440\u0430\u0444\u0438\u043A" },
                "\u2191 ",
                fmt(traffic.up),
                " \u00B7 \u2193 ",
                fmt(traffic.down))))));
}
var index = definePlugin(() => ({
    name: "VelumVPN",
    title: SP_REACT.createElement("div", { className: DFL.staticClasses.Title }, "VelumVPN"),
    content: SP_REACT.createElement(Content, null),
    icon: SP_REACT.createElement("span", { style: { fontSize: "14px", fontWeight: "bold" } }, "V"),
    onDismount() { },
}));

export { index as default };
//# sourceMappingURL=index.js.map
