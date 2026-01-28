const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const axios = require("axios");
const app = express();

const PORT = process.env.PORT || 3000;
const DEFAULT_M3U = "https://raw.githubusercontent.com/sidh3369/m3u_bot/main/1.m3u";

// 1. Manifest
const manifest = {
    id: "org.vodplaylist.sid",
    version: "1.1.0",
    name: "SID VOD Playlist",
    description: "Personal M3U VOD Addon. Click configure to add your link.",
    resources: ["catalog", "meta", "stream"],
    types: ["movie"],
    catalogs: [{ type: "movie", id: "vod-playlist", name: "My M3U Playlist" }],
    idPrefixes: ["vod-"],
    behaviorHints: { configurable: true, configurationRequired: false }
};

const builder = new addonBuilder(manifest);

// 2. M3U Parser
async function fetchPlaylist(url) {
    try {
        const res = await axios.get(url || DEFAULT_M3U, { timeout: 10000 });
        const lines = res.data.split(/\r?\n/);
        let metas = [];
        let currentMeta = {};
        let idCounter = 1;
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith("#EXTINF:")) {
                currentMeta = {
                    id: `vod-${idCounter}`,
                    name: line.split(",")[1] || `Video ${idCounter}`,
                    type: "movie",
                    poster: "https://dl.strem.io/addon-logo.png"
                };
            } else if (line && !line.startsWith("#") && currentMeta.id) {
                currentMeta.url = line;
                metas.push(currentMeta);
                idCounter++;
                currentMeta = {};
            }
        }
        return metas;
    } catch (e) { return []; }
}

// 3. Handlers
builder.defineCatalogHandler(async (args) => {
    const metas = await fetchPlaylist(args.config?.m3u);
    return { metas };
});

builder.defineMetaHandler(async (args) => {
    const metas = await fetchPlaylist(args.config?.m3u);
    return { meta: metas.find(m => m.id === args.id) || {} };
});

builder.defineStreamHandler(async (args) => {
    const metas = await fetchPlaylist(args.config?.m3u);
    const meta = metas.find(m => m.id === args.id);
    return { streams: meta ? [{ url: meta.url, title: meta.name }] : [] };
});

// 4. THE FIX: Custom Configuration Route
app.get("/configure", (req, res) => {
    res.send(`
        <body style="background:#111;color:white;text-align:center;padding:50px;font-family:sans-serif;">
            <h1>SID Playlist Config</h1>
            <input type="text" id="m3u" placeholder="Paste M3U URL here" style="width:80%;padding:10px;">
            <br><br>
            <button onclick="install()" style="padding:10px 20px;">Install Addon</button>
            <script>
                function install() {
                    const url = document.getElementById('m3u').value;
                    const config = encodeURIComponent(JSON.stringify({ m3u: url }));
                    window.location.href = 'stremio://' + window.location.host + '/' + config + '/manifest.json';
                }
            </script>
        </body>
    `);
});

// 5. Connect Stremio SDK to Express
const addonRouter = getRouter(builder.getInterface());
app.use("/", addonRouter);

app.listen(PORT, () => {
    console.log(`Addon live at http://localhost:${PORT}/configure`);
});
