const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const express = require("express");
const axios = require("axios");

const PORT = process.env.PORT || 3000;
const DEFAULT_M3U = "https://raw.githubusercontent.com/sidh3369/m3u_bot/main/1.m3u";

const manifest = {
    id: "org.vodplaylist",
    version: "1.1.0",
    name: "SID VOD Playlist",
    description: "Watch your personal M3U playlists. Add your own link in settings!",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "vod-playlist",
            name: "My VOD Playlist",
            extra: [{ name: "search", isRequired: false }]
        }
    ],
    idPrefixes: ["vod-"],
    behaviorHints: {
        configurable: true, // Allows users to see a 'Configure' button
        configurationRequired: false
    }
};

// Helper: Parse M3U from a specific URL
async function fetchPlaylist(url) {
    try {
        const targetUrl = url || DEFAULT_M3U;
        const res = await axios.get(targetUrl, { timeout: 5000 });
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
                    description: `Source: ${name}`
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
        console.error("Error fetching playlist:", e.message);
        return [];
    }
}

const app = express();

// Middleware to extract M3U URL from the path if present
// Path format: /config=BASE64_URL/manifest.json
app.use((req, res, next) => {
    const configMatch = req.url.match(/\/config=([^/]+)/);
    if (configMatch) {
        try {
            req.userM3u = Buffer.from(configMatch[1], 'base64').toString('utf8');
        } catch (e) {
            req.userM3u = DEFAULT_M3U;
        }
    } else {
        req.userM3u = DEFAULT_M3U;
    }
    next();
});

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
    // Note: In a production scenario, you'd pass the URL through the 'args'
    // Stremio SDK usually passes the config in the request
    const metas = await fetchPlaylist(args.config?.m3u); 
    return { metas };
});

builder.defineMetaHandler(async (args) => {
    const metas = await fetchPlaylist(args.config?.m3u);
    const meta = metas.find(m => m.id === args.id);
    return { meta: meta || {} };
});

builder.defineStreamHandler(async (args) => {
    const metas = await fetchPlaylist(args.config?.m3u);
    const meta = metas.find(m => m.id === args.id);
    return { streams: meta ? [{ url: meta.url, title: meta.name }] : [] };
});

// Configure the Landing Page/Config UI
app.get("/", (req, res) => {
    res.send(`
        <h1>SID VOD Playlist Config</h1>
        <p>Enter your M3U URL below:</p>
        <input type="text" id="m3u" style="width:80%" placeholder="https://example.com/list.m3u">
        <button onclick="install()">Install on Stremio</button>
        <script>
            function install() {
                const url = document.getElementById('m3u').value;
                const b64 = btoa(url);
                window.location.href = 'stremio://' + window.location.host + '/config=' + b64 + '/manifest.json';
            }
        </script>
    `);
});

// Serve via SDK
const addonInterface = builder.getInterface();
serveHTTP(addonInterface, { server: app, port: PORT });
