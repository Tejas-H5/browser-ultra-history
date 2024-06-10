import { setCssVars } from "src/utils/dom-utils";
import browser, { browserAction } from "webextension-polyfill";
import { logTrace } from "./utils/log";
import { z } from "zod";

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

export const AppThemeSchema = z.union([
    z.literal("Dark"),
    z.literal("Light"),
]);

export type AppTheme = z.infer<typeof AppThemeSchema>;

// NOTE: all schemas must be JSON-serializable.

const StateSchema = z.union([
    z.object({
        theme: z.string().optional(),
    }),
    z.record(z.string(), z.any()),
]);

// Should become a massive union type.
export type Message = {
    // Used to log things to the background script console from other environments.
    type: "log";
    message: string;
    tabUrl: string;
} | {
    // Triggers a manual collection from certain tabs, or all tabs if none specified. 
    // Ideally, we will never need to use this once this extension is working as it's intended, but it's useful for development
    type: "start_collection_from_tabs";
    tabIds?: TabId[];
} | {
    type: "content_collect_urls"
}| {
    type: "save_urls";
    currentTablUrl: string; 
    outgoingUrlInfos: UrlInfo[];
};

export function sendMessage(message: Message) {
    return browser.runtime.sendMessage(message);
}

export function sendLog(tabUrl: string, text: string) {
    if (process.env.SCRIPT === "background-main") {
        console.log(tabUrl, text);
        return;
    }

    return sendMessage({ tabUrl, type: "log", message: text });
}

export function recieveMessage(
    callback: (message: Message, sender: object, response: (message: Message) => void) => void,
    _debug: string = "idk",
) {
    browser.runtime.onMessage.addListener((...args) => {
        callback(...args);
    });
}

export type TabId = {
    tabId: number;
}

export async function getCurrentTabId(): Promise<TabId | undefined> {
    const tab = await getCurrentTab();
    if (!tab?.id) {
        return undefined;
    }

    return { tabId: tab.id };
}

export async function sendMessageToTabs(message: Message, specificTabs?: TabId[]) {
    const tabs = await browser.tabs.query({});
    const responses: Promise<Message>[] = [];

    for (const tab of tabs) {
        if (
            specificTabs &&
            !specificTabs.find(t => t.tabId === tab.id)
        ) {
            continue;
        }

        const tabId = tab.id;
        if (!tabId) {
            continue;
        }

        responses.push(browser.tabs.sendMessage(tabId, message));
    }

    const responsesSettled = await Promise.allSettled(responses);
    const fulfilled: Message[] = [];
    for (const res of responsesSettled) {
        if (res.status === "fulfilled" && res.value) {
            fulfilled.push(res.value);
        }
    }

    return fulfilled;
}


export async function getStateJSON() {
    const state = await defaultStorageArea.get();
    return JSON.stringify(state);
}

export async function loadStateJSON(json: string) {
    const obj = JSON.parse(json);

    try {
        const state = StateSchema.parse(obj);

        await defaultStorageArea.clear();

        await defaultStorageArea.set(state);
    } catch (e) {
        console.error(e);
    }

}

export async function getTheme(): Promise<AppTheme> {
    const { theme } = await defaultStorageArea.get("theme");
    if (theme === "Dark") {
        return "Dark";
    }

    return "Light";
};

export async function setTheme(theme: AppTheme) {
    await defaultStorageArea.set({ theme });

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

export async function clearAllData() {
    logTrace("Clearing all data...");
    await defaultStorageArea.clear();
    logTrace("Cleared!");

    browserAction.setBadgeText({ text: "0" });
}

export function getUrlKey(url: string) {
    return "#u:" + url;
}

export function isUrlKey(key: string) {
    return key.startsWith("#u:");
}

// an array with a list of urls that linked to this one
export function getAdjOutgoingKey(url: string) {
    return OUT_PREFIX + url;
}

export function isOutKey(key: string) {
    return key.startsWith(OUT_PREFIX);
}

export const OUT_PREFIX = "#o:";

// an array with a list of urls that this one links to
export function getAdjIncmingKey(url: string) {
    return IN_PREFIX + url;
}

export function isInKey(key: string) {
    return key.startsWith(IN_PREFIX);
}

export const IN_PREFIX = "#i:";

export function getLinkKey(fromUrl: string, toUrl: string) {
    return "#l:" + fromUrl + ">-->" + toUrl;
}

export async function getUrlInfo(urlKey: string): Promise<UrlInfo | undefined> {
    const data = await defaultStorageArea.get(urlKey);
    return data[urlKey] as UrlInfo | undefined;
}

export async function getLinkInfo(urlFrom: string, urlTo: string): Promise<LinkInfo | undefined> {
    const key = getLinkKey(urlFrom, urlTo);
    const data = await defaultStorageArea.get(key);
    return data[key] as LinkInfo | undefined;
}

export async function setLinkMetadata(urlFrom: string, urlTo: string, metadata: LinkInfo) {
    const key = getLinkKey(urlFrom, urlTo);
    await defaultStorageArea.set({ [key]: metadata });
}

// TODO: compress these keys somehow, maybe just as arrays, before saving the JSON.
export type UrlInfo = {
    url: string;
    visitedAt: string;

    // add new props as optionals below

    styleName?: string;
    attrName?: string;
    contextString?: string;
};

export type LinkInfo = {
    visitedAt: string;
}

export function newUrlInfo(info: Omit<UrlInfo, "visitedAt">, visitedAt = new Date()): UrlInfo {
    return {
        ...info,
        visitedAt: visitedAt.toISOString(),
    };
}

export async function getUrlsFrom(adjKey: string): Promise<string[]> {
    const data = await defaultStorageArea.get(adjKey);
    return data[adjKey] || [];
}

function mergeAdjacencies(existing: string[], incoming: string[]): void {
    for (const incomingUrl of incoming) {
        if (existing.indexOf(incomingUrl) !== -1) {
            continue;
        }

        existing.push(incomingUrl);
    }
}

export async function saveUrlInfo(info: UrlInfo): Promise<void>{
    const urlKey = getUrlKey(info.url);
    const existing = await getUrlInfo(urlKey);
    if (!existing) {
        await defaultStorageArea.set({ [urlKey]: info});
        return;
    }

    // TODO: add merging logic here when needed.
}

export async function saveOutgoingUrls(currentTablUrl: string, outgoingUrlInfos: UrlInfo[]) {
    // Make sure this happens on the background script, to reduce the chances of the script terminating early
    if (process.env.SCRIPT !== "background-main") {
        sendMessage({ type: "save_urls", currentTablUrl, outgoingUrlInfos });
        return;
    }

    // save the url infos
    {
        await saveUrlInfo(newUrlInfo({ url: currentTablUrl }));

        for (const url of outgoingUrlInfos) {
            await saveUrlInfo(url);
        }
    }

    // save the links between the urls
    {
        const urlOutKey = getAdjOutgoingKey(currentTablUrl);
        const urlOutgoing = await getUrlsFrom(urlOutKey);
        const newOutgoingUrls: string[] = outgoingUrlInfos.map(info => info.url);

        mergeAdjacencies(urlOutgoing, newOutgoingUrls);

        const payload: Record<string, string[]> = {
            [urlOutKey]: urlOutgoing,
        };

        for (const newOutgoingUrl of newOutgoingUrls) {
            const newOutgoingIncomingKey = getAdjIncmingKey(newOutgoingUrl);
            const newOutgoingIncoming = await getUrlsFrom(newOutgoingIncomingKey);

            mergeAdjacencies(newOutgoingIncoming, [ currentTablUrl ]);

            payload[newOutgoingIncomingKey] = newOutgoingIncoming;
        }

        await defaultStorageArea.set(payload);
    }
}

export async function collectUrlsFromTabs() {
    await sendMessageToTabs({ type: "content_collect_urls" });
}

async function getCurrentTab(): Promise<browser.Tabs.Tab | undefined> {
    const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0];
}

export async function getCurrentTabUrl(): Promise<string | undefined> {
    const tab = await getCurrentTab();
    return tab?.url;
}

export async function collectUrlsFromActiveTab() {
    const activeTab = await getCurrentTabId();
    if (!activeTab) {
        return;
    }

    await sendMessageToTabs({ type: "content_collect_urls" }, [activeTab]);
}

type AllData = Record<string, any>;

function getCurrentLocationDataKeys(windowLocationHref: string) {
    const urlKey = getUrlKey(windowLocationHref);
    const incomingKey = getAdjIncmingKey(windowLocationHref);
    const outgoingKey = getAdjOutgoingKey(windowLocationHref);

    return { urlKey, incomingKey, outgoingKey };
}

export function getCurrentLocationDataFromAllData(windowLocationHref: string, data: AllData): CurrentLocationData{
    const keys = getCurrentLocationDataKeys(windowLocationHref);
    return {
        metadata: data[keys.urlKey] as UrlInfo,
        incoming: data[keys.incomingKey] || [] as string[],
        outgoing: data[keys.outgoingKey] || [] as string[],
    };
}

export async function getCurrentLocationData(windowLocationHref: string): Promise<CurrentLocationData> {
    console.log("getting data for ", windowLocationHref);
    const keys = getCurrentLocationDataKeys(windowLocationHref);
    const data = await defaultStorageArea.get(Object.values(keys));

    return getCurrentLocationDataFromAllData(windowLocationHref, data);
}

export type CurrentLocationData = {
    incoming: string[];
    outgoing: string[];
    metadata: UrlInfo | undefined;
}

export function onStateChange(fn: () => void) {
    defaultStorageArea.onChanged.addListener(() => {
        fn();
    });
}

export async function getAllData(): Promise<any> {
    return await defaultStorageArea.get(null);
}

const THOUSANDS_SUFFIXES = ["", "k", "m", "b", "t", "q", "s",];
function formatNumberForBadge(num: number): string {
    for (const s of THOUSANDS_SUFFIXES) {
        if (num < 1000) {
            return num + s;
        }

        num = Math.floor(num / 1000);
    }

    return "inf";
}

