import { setCssVars } from "src/utils/dom-utils";
import { UrlInfo, sendLog, sendMessageToTabs } from "./message";
import browser from "webextension-polyfill";
import { logTrace } from "./utils/log";

const defaultStorageArea = browser.storage.local;

declare global {
    const process: {
        // See the build script for the true types.
        // I'm copying them over here for better autocomplete
        env: {
            ENVIRONMENT: "dev" | "prod";
            SCRIPT: "background-main" | "content-main" | "popup-main" | "index-main";
        },
    };
}

export type AppTheme = "Dark" | "Light";

type State = {
    savedUrls: Record<string, UrlInfo>;
    lastCollectedAt: string;
    theme: AppTheme;
}

async function getKey<K extends keyof State>(key: K): Promise<State[K] | undefined> {
    const res = await defaultStorageArea.get([ key ]);
    const val = res?.[key];
    if (!val) {
        return undefined;
    }

    return val as State[K];
}

async function setKeys<K extends keyof State>(vals: Record<K, State[K]>) {
    await defaultStorageArea.set(vals);
}

export async function getTheme(): Promise<AppTheme> {
    const theme = await getKey("theme");
    if (theme === "Dark") {
        return "Dark";
    }

    return "Light";
};

export async function setTheme(theme: AppTheme) {
    await setKeys({ theme });

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

export async function getLastCollectedAtIso() {
    return await getKey("lastCollectedAt");
}

export async function getLastCollectedAt() {
    const dateStr = await getLastCollectedAtIso();
    if (!dateStr) {
        return undefined;
    }

    return new Date(dateStr);
}

export async function getCollectedUrls(): Promise<Record<string, UrlInfo>> {
    const urls = await getKey("savedUrls");
    if (!urls) {
        return {};
    }
    
    return urls;
}

export async function clearAllData() {
    logTrace("Clearing all data...");
    await defaultStorageArea.clear();
    logTrace("Cleared!");
}

export async function collectUrlsFromTabs() {
    sendLog("state", "sending messages to tabs");
    const responses = await sendMessageToTabs({ type: "collect_urls" });

    sendLog("state", "getting existing urls");
    const savedUrls = await getCollectedUrls();

    function addUrl(urlInfo: UrlInfo) {
        savedUrls[urlInfo.url] = urlInfo;
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

    const lastCollectedAt = new Date().toISOString();

    await setKeys({ savedUrls, lastCollectedAt });

    await sendLog("state", "Saved! length=" + Object.keys(savedUrls).length);
}

export function onStateChange(fn: () => void) {
    defaultStorageArea.onChanged.addListener(() => {
        fn();
    });
}
