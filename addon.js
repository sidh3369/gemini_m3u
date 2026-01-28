const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const express = require("express");
const axios = require("axios");
const app = express();

const PORT = process.env.PORT || 3000;
const DEFAULT_M3U = "https://raw.githubusercontent.com/sidh3369/m3u_bot/main/1.m3u";

// 1. Manifest Configuration
const manifest = {
    id: "org.vodplaylist.sid",
    version: "1.1.0",
    name: "SID VOD Playlist",
    description: "Add your own M3U links and watch instantly.",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "vod-playlist",
            name: "My M3U Playlist",
            extra: [{ name: "search" }]
        }
    ],
    idPrefixes: ["vod-"],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

// 2. M3U Parser Logic
async function fetchPlaylist(url) {
    try {
        const targetUrl = url || DEFAULT_M3U;
        const res = await axios.get(targetUrl, { timeout: 10000 });
        const lines = res.data.split(/\r?\n/);
        let metas = [];
        let currentMeta = {};
        let idCounter = 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("#EXTINF:")) {
                const name = line.split(",")[1] || `Video ${idCounter}`;
                currentMeta = {
                    id: `vod-${idCounter}`,
                    name: name.trim(),
                    type: "movie",
                    poster: "https://dl.strem.io/addon-logo.png",
                    description: `Stream: ${name.trim()}`
                };
            } else if (line && !line.startsWith("#")) {
                if (currentMeta.id) {
                    currentMeta.url = line;
                    metas.push(currentMeta);
                    idCounter++;
                    currentMeta = {};
                }
            }
        }
        return metas;
    } catch (e) {
        console.error("Playlist Fetch Error:", e.message);
        return [];
    }
}

// 3. Stremio Addon Handlers
const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
    // args.config contains the decoded user URL
    const m3uUrl = args.config ? args.config.m3u : DEFAULT_M3U;
    const metas = await fetchPlaylist(m3uUrl);
    return { metas };
});

builder.defineMetaHandler(async (args) => {
    const m3uUrl = args.config ? args.config.m3u : DEFAULT_M3U;
    const metas = await fetchPlaylist(m3uUrl);
    const meta = metas.find(m => m.id === args.id);
    return { meta: meta || {} };
});

builder.defineStreamHandler(async (args) => {
    const m3uUrl = args.config ? args.config.m3u : DEFAULT_M3U;
    const metas = await fetchPlaylist(m3uUrl);
    const meta = metas.find(m => m.id === args.id);
    if (meta) {
        return { streams: [{ url: meta.url, title: meta.name }] };
    }
    return { streams: [] };
});

// 4. Custom Routes for Express (The Fix)

// Configuration Page UI
app.get("/configure", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>SID Playlist Config</title>
            <style>
                body { background: #0c0d19; color: white; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1b1d2f; padding: 30px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); width: 400px; text-align: center; }
                input { width: 100%; padding: 12px; margin: 20px 0; border-radius: 6px; border: none; background: #2a2c3f; color: white; box-sizing: border-box; }
                button { background: #3d5afe; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; }
                button:hover { background: #536dfe; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>M3U Configurator</h2>
                <p>Paste your M3U link below to sync your playlist.</p>
                <input type="text" id="m3uInput" placeholder="https://example.com/playlist.m3u">
                <button onclick="generateLink()">Install Addon</button>
            </div>
            <script>
                function generateLink() {
                    const url = document.getElementById('m3uInput').value;
                    if(!url) return alert("Please enter a link!");
                    // We pass the URL as a config object: { "m3u": "URL" }
                    const config = encodeURIComponent(JSON.stringify({ m3u: url }));
                    window.location.href = 'stremio://' + window.location.host + '/' + config + '/manifest.json';
                }
            </script>
        </body>
        </html>
    `);
});

// Redirect root to configure
app.get("/", (req, res) => res.redirect("/configure"));

// 5. Start the Server
const addonInterface = builder.getInterface();
serveHTTP(addonInterface, { server: app, port: PORT });

console.log(`Addon running at http://localhost:${PORT}`);
console.log(`Config page available at http://localhost:${PORT}/configure`);
