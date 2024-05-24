import browser from "webextension-polyfill";
import { setCssVars } from "./dom-utils";
import { UrlInfo, sendLog, sendMessageToTabs } from "./message";
import { hashCode } from "./hash";

const defaultStorageArea = browser.storage.local;


declare global {
    const process: {
        env: {
            ENVIRONMENT: "dev" | "prod";
            SCRIPT: "background-main" | "content-main" | "popup-main";
        },
    };
}

export type AppTheme = "Dark" | "Light";

const THEME_KEY = "theme";

export async function getTheme(): Promise<AppTheme> {
    const storage = await defaultStorageArea.get(THEME_KEY);
    const theme = storage[THEME_KEY];
    if (theme === "Dark") {
        return "Dark";
    }

    return "Light";
};

export async function setTheme(theme: AppTheme) {
    await defaultStorageArea.set({ [THEME_KEY]: theme });

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


export async function getUrlMessages(): Promise<Record<string, UrlInfo>> {
    console.log("getting urls...");

    // TODO: Fix this. right now its experimental - I'm seeing if I can just save everything at the root level, and if it makes a difference as to whether I can fetch it or not.
    const res = await defaultStorageArea.get([ "savedUrls" ]);
    if (!res?.savedUrls) {
        return {};
    }

    const savedUrls = res.savedUrls;
    console.log("got urls", Object.keys(savedUrls).length, savedUrls);
    return savedUrls;
}

export async function clearAllForDev() {
    await defaultStorageArea.clear();
}


export async function collectUrlsFromTabs() {
    sendLog("state", "sending messages to tabs");
    const responses = await sendMessageToTabs({ type: "collect_urls" });

    sendLog("state", "getting existing urls");
    const savedUrls = await getUrlMessages();

    function addUrl(urlInfo: UrlInfo) {
        // TODO: handle multiple urls pointing to the same thing
        
        // Using a hash here, because we get an undocumented error when we try to save with keys that are too long.
        // TODO: handle collisions, verify if above is correct.
        const hash = hashCode(urlInfo.url);
        savedUrls[hash] = urlInfo;
    }

    await sendLog("state", "Merging urls");
    for (const res of responses) {
        if (res.type !== "urls") {
            continue;
        }

        for (const url of res.urls) {
            addUrl(url);
        }
    }

    await sendLog("state", "Saving...");
    if (process.env.SCRIPT === "background-main") {
        console.log(savedUrls);
    }

    await defaultStorageArea.set({ "savedUrls": savedUrls });

    await sendLog("state", "Saved!");
}













