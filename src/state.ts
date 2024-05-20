import browser from "webextension-polyfill";
import { setCssVars } from "./dom-utils";
import { sendMessageToTabs } from "./message";

function getStorageArea() {
    return browser.storage.local;
}


declare global {
    const process: {
        env: {
            ENVIRONMENT: "dev" | "prod";
        }
    };
}

export type AppTheme = "Dark" | "Light";

const THEME_KEY = "theme";
const URLS_KEY = "urls";

export async function getTheme(): Promise<AppTheme> {
    const storage = await getStorageArea().get(THEME_KEY);
    const theme = storage[THEME_KEY];
    if (theme === "Dark") {
        return "Dark";
    }

    return "Light";
};

export async function setTheme(theme: AppTheme) {
    getStorageArea().set({ [THEME_KEY]: theme });

    if (theme === "Light") {
        setCssVars([
            ["--bg-in-progress", "rgb(255, 0, 0, 1"],
            ["--fg-in-progress", "#FFF"],
            ["--bg-color", "#FFF"],
            ["--bg-color-focus", "#CCC"],
            ["--bg-color-focus-2", "rgb(0, 0, 0, 0.4)"],
            ["--fg-color", "#000"],
            ["--unfocus-text-color", "#A0A0A0"],
        ]);
    } else {
        // assume dark theme
        setCssVars([
            ["--bg-in-progress", "rgba(255, 0, 0, 1)"],
            ["--fg-in-progress", "#FFF"],
            ["--bg-color", "#000"],
            ["--bg-color-focus", "#333"],
            ["--bg-color-focus-2", "rgba(255, 255, 255, 0.4)"],
            ["--fg-color", "#EEE"],
            ["--unfocus-text-color", "#707070"],
        ]);
    }
};



export async function getUrlMessages(): Promise<Record<string, any>> {
    const res = await getStorageArea().get(URLS_KEY);
    return res[URLS_KEY] ?? {};
}

export async function clearAllForDev() {
    return getStorageArea().clear();
}


export async function collectUrlsFromTabs() {
    const responses = await sendMessageToTabs({ type: "collect_urls" });

    const savedUrls = await getUrlMessages();

    function addUrl(url: string) {
        if (url in savedUrls) {
            return;
        }

        savedUrls[url] = {
            visited: new Date().toISOString(),
        };
    }

    for (const res of responses) {
        if (res.type === "urls") {
            for (const url of res.urls) {
                addUrl(url);
            }
        }
    }

    return await getStorageArea().set({ [URLS_KEY]: savedUrls });
}













