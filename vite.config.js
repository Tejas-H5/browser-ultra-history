import { defineConfig } from 'vite'

const EXTENSION_DIR = "dist";

export default defineConfig({
    base: "/dist",
    build: {
        outDir: EXTENSION_DIR,
        assetsDir: "",
        rollupOptions: {
            input: {
                // The popup page
                "index.html": "/index.html",
                // Extension background script
                "background-main.js": "/src/background-main.ts",
                // Extension content script
                "content-main.js": "/src/content-main.ts",
            },
            output: {
                entryFileNames: `[name].js`,
                chunkFileNames: `[name].js`,
                assetFileNames: `[name].[ext]`
            }
        }
    }
});
