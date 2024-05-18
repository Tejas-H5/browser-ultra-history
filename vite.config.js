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
                "index": "/index.html",
                // Extension background script
                "background-main": "/src/background-main.ts",
                // Extension content script
                "content-main": "/src/content-main.ts",
            },
            output: {
                entryFileNames: `[name].js`,
                assetFileNames: `[name].[ext]`
            }
        }
    }
});
