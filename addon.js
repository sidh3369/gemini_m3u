const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const express = require("express");
const axios = require("axios");

const PORT = process.env.PORT || 3000;
const DEFAULT_M3U = "https://raw.githubusercontent.com/sidh3369/m3u_bot/main/1.m3u";

const manifest = {
    id: "org.vodplaylist",
    version: "1.1.0",
    name: "SID VOD Playlist",
    description: "Watch your personal M3U playlists.",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "vod-playlist",
            name: "My VOD Playlist",
        }
    ],
    idPrefixes: ["vod-"],
    behaviorHints: {
        configurable: true,
        configurationRequired: true // Forces the user to the config page first
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

// This handles the "Cannot GET /configure" error
app.get("/configure", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`
        <html>
            <body style="background: #111; color: white; font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>M3U Playlist Configurator</h1>
                <p>Paste your M3U URL below to load your playlist:</p>
                <input type="text" id="m3u" style="width: 80%; padding: 10px; margin-bottom: 20px;" placeholder="https://example.com/playlist.m3u">
                <br>
                <button onclick="install()" style="padding: 10px 20px; cursor: pointer;">Install / Reload Playlist</button>
                
                <script>
                    function install() {
                        const m3uUrl = document.getElementById('m3u').value;
                        if (!m3uUrl) return alert("Please enter a URL");
                        // Encode the URL to Base64 to pass it safely in the manifest URL
                        const config = btoa(m3uUrl);
                        window.location.href = 'stremio://' + window.location.host + '/' + config + '/manifest.json';
                    }
                </script>
            </body>
        </html>
    `);
});

// Serve via SDK
const addonInterface = builder.getInterface();
serveHTTP(addonInterface, { server: app, port: PORT });
