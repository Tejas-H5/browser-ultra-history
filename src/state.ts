import { setCssVars } from "src/utils/dom-utils";
import browser, { browserAction } from "webextension-polyfill";
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

export type AppTheme = "Light" | "Dark";

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
    type: "save_urls_finished",
    numNewUrls: number;
    id: string;
} | {
    type: "save_urls";
    currentTablUrl: string; 
    outgoingLinks: LinkInfo[];
    currentVisibleUrls: string[];
} | {
    type: "content_collect_urls"
} | {
    type: "content_highlight_url",
    url: string,
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
    callback: (message: Message, sender: browser.Runtime.MessageSender, sendResponse: () => void) => Promise<any> | true | void,
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

export async function sendMessageToCurrentTab(message: Message) {
    const activeTab = await getCurrentTabId();
    if (!activeTab) {
        return;
    }

    await sendMessageToTabs(message, [activeTab]);
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
    const obj: object = JSON.parse(json);
    if (!obj || Array.isArray(obj) || typeof obj !== "object") {
        throw new Error("Invalid state!");
    }

    // TODO: extract out all the valid keys out of this json, and validate them.

    return obj;
}

export async function getIsDisabled() {
    const { isDisabled } = await defaultStorageArea.get("isDisabled")
    return isDisabled;
}

export async function setIsDisabled(isDisabled: boolean) {
    return await defaultStorageArea.set({ isDisabled });
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
export function getAdjIncomingKey(url: string) {
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

export async function getLinkInfo(linkKey: string): Promise<LinkInfo | undefined> {
    const data = await defaultStorageArea.get(linkKey);
    return data[linkKey] as LinkInfo | undefined;
}

export async function setLinkMetadata(urlFrom: string, urlTo: string, metadata: LinkInfo) {
    const key = getLinkKey(urlFrom, urlTo);
    await defaultStorageArea.set({ [key]: metadata });
}

// TODO: compress these keys somehow, maybe just as arrays, before saving the JSON.
export type LinkInfo = {
    urlTo: string;
    urlFrom: string;
    visitedAt: string;

    /** 
     * add new props as optionals below.
     * Don't forget to update the merging code in {@link saveLinkInfo} !
     */

    // was this a redirect from some other outgoing url?
    redirect?: boolean;

    // did we find this in a stylesheet?
    isAsset?: boolean;

    styleName?: string[];
    attrName?: string[];
    linkText?: string[];
    linkImage?: string[];
    contextString?: string[];
    parentType?: string[];
};

export type UrlInfo = {
    url: string;
    visitedAt: string;
}

export function newUrlInfo(info: Omit<UrlInfo, "visitedAt">, visitedAt = new Date()): UrlInfo {
    return {
        ...info,
        visitedAt: visitedAt.toISOString(),
    };
}

export function newLinkInfo(info: Omit<LinkInfo, "visitedAt">, visitedAt = new Date()): LinkInfo {
    return {
        ...info,
        visitedAt: visitedAt.toISOString(),
    };
}

export async function getUrlsFrom(adjKey: string): Promise<string[]> {
    const data = await defaultStorageArea.get(adjKey);
    return data[adjKey] || [];
}

function mergeAdjacencies(existing: string[], incoming: string[]) {
    for (const incomingUrl of incoming) {
        if (existing.includes(incomingUrl)) {
            continue;
        }

        existing.push(incomingUrl);
    }

    return existing;
}

export async function saveUrlInfo(info: UrlInfo): Promise<boolean> {
    const urlKey = getUrlKey(info.url);
    const existing = await getUrlInfo(urlKey);
    if (!existing) {
        await defaultStorageArea.set({ [urlKey]: info});
        return true;
    }

    // TODO: add merging logic here when needed.
    return false;
}

function mergeArrays<T>(a: undefined | T[], b: undefined | T[]) {
    if(!a && !b) {
        return undefined;
    }

    if (!a) {
        return b;
    }

    if (!b) {
        return a;
    }

    for (const el of b) {
        if (!a.includes(el)) {
            a.push(el);
        }
    }

    return a;
}

export async function saveLinkInfo(urlFrom: string, linkInfo: LinkInfo) {
    const linkKey = getLinkKey(urlFrom, linkInfo.urlTo);
    const existing = await getLinkInfo(linkKey);
    if (!existing) {
        await defaultStorageArea.set({ [linkKey]: linkInfo });
        return;
    }

    existing.styleName = mergeArrays(existing.styleName, linkInfo.styleName);
    existing.attrName = mergeArrays(existing.attrName, linkInfo.attrName);
    existing.contextString = mergeArrays(existing.contextString, linkInfo.contextString);
    existing.linkText = mergeArrays(existing.linkText, linkInfo.linkText);
    existing.linkImage = mergeArrays(existing.linkImage, linkInfo.linkImage);
    existing.linkText = mergeArrays(existing.linkText, linkInfo.linkText);
    existing.parentType = mergeArrays(existing.parentType, linkInfo.parentType);

    if (linkInfo.isAsset === true) {
        existing.isAsset = true
    }

    await defaultStorageArea.set({ [linkKey]: existing });
}

export async function saveOutgoingLinks(
    currentTablUrl: string, 
    outgoingLinks: LinkInfo[], 
    currentVisibleUrls: string[],
) {
    // Make sure this happens on the background script, to reduce the chances of the script terminating early
    if (process.env.SCRIPT !== "background-main") {
        sendMessage({ type: "save_urls", currentTablUrl, outgoingLinks, currentVisibleUrls });
        return;
    }

    let numNewUrls = 0;

    await defaultStorageArea.set({ currentVisibleUrls });

    // save the url infos
    {
        await saveUrlInfo(newUrlInfo({ url: currentTablUrl }));
        for (const link of outgoingLinks) {
            const isNew = await saveUrlInfo(newUrlInfo({ url: link.urlTo }));
            if (isNew) {
                numNewUrls += 1;
            }
        }
    }

    // save the link metadata
    {
        for (const link of outgoingLinks) {
            await saveLinkInfo(currentTablUrl, link);
        }
    }

    // save the adjacency info we can use to find incoming and outgoing links for a particular url
    {
        const urlOutLinksKey = getAdjOutgoingKey(currentTablUrl);
        const urlOutLinks = await getUrlsFrom(urlOutLinksKey);
        const urlOutLinksNew: string[] = outgoingLinks.map(info => info.urlTo);

        const mergedAdj = mergeAdjacencies(urlOutLinks, urlOutLinksNew);

        const savePayload: Record<string, string[]> = {
            [urlOutLinksKey]: mergedAdj,
        };

        for (const newOutgoingUrl of urlOutLinksNew) {
            const newOutgoingIncomingKey = getAdjIncomingKey(newOutgoingUrl);
            const newOutgoingIncoming = await getUrlsFrom(newOutgoingIncomingKey);

            const mergedAdj = mergeAdjacencies(newOutgoingIncoming, [ currentTablUrl ]);

            savePayload[newOutgoingIncomingKey] = mergedAdj;
        }

        await defaultStorageArea.set(savePayload);
    }

    if (currentTablUrl) {
        const tabs = await browser.tabs.query({ url: currentTablUrl });
        const tabId = tabs[0]?.id;
        if (tabs.length > 0 && tabId) {
            sendMessageToTabs({ type: "save_urls_finished", numNewUrls, id: currentTablUrl  }, tabId ? [{ tabId }] : undefined);
        }
    }
}

type UrlBeforeRedirectData = {
    currentUrl: string;
    timestamp: number;
}

export function getTabKey(tabId: TabId): string {
    return "tab:" + tabId.tabId + "|";
}

export async function setUrlBeforeRedirect(tabId: TabId, data: UrlBeforeRedirectData | undefined) {
    const key = getTabKey(tabId) + "redirectTempPersistance";
    if (!data) {
        await defaultStorageArea.remove(key);
    } else {
        await defaultStorageArea.set({ [key]: data });
    }
}

export async function getUrlBeforeRedirect(currentTabId: TabId, currentTimestamp: number) {
    const key = getTabKey(currentTabId) + "redirectTempPersistance";

    const data = await defaultStorageArea.get(key);
    const redirectTempPersistance = data[key];
    if (!redirectTempPersistance) {
        return undefined;
    }

    const { currentUrl, timestamp } = redirectTempPersistance as UrlBeforeRedirectData;
    if (
        // Make it stale after 1 min.
        (currentTimestamp - timestamp) > (1000 * 60)
    ) {
        return undefined;
    }

    return currentUrl;
}

export async function getRecentlyVisitedUrls(): Promise<string[]> {
    const { recentlyVisitedUrls } = await defaultStorageArea.get("recentlyVisitedUrls");
    return recentlyVisitedUrls || [];
}

export async function saveRecentlyVisitedUrls(urls: string[]) {
    await defaultStorageArea.set({ recentlyVisitedUrls: urls });
}

export async function collectUrlsFromTabs() {
    await sendMessageToTabs({ type: "content_collect_urls" });
}

export async function getCurrentTab(): Promise<browser.Tabs.Tab | undefined> {
    const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0];
}

export async function getCurrentTabUrl(): Promise<string | undefined> {
    const tab = await getCurrentTab();
    return tab?.url;
}

export async function collectUrlsFromActiveTab() {
    return await sendMessageToCurrentTab({ type: "content_collect_urls" });
}

function getCurrentLocationDataKeys(windowLocationHref: string) {
    const urlKey = getUrlKey(windowLocationHref);
    const incomingKey = getAdjIncomingKey(windowLocationHref);
    const outgoingKey = getAdjOutgoingKey(windowLocationHref);
    const currentVisibleKeys = "currentVisibleUrls";

    return { urlKey, incomingKey, outgoingKey, currentVisibleKeys };
}

export async function getCurrentLocationData(windowLocationHref: string): Promise<CurrentLocationData> {
    const keys = getCurrentLocationDataKeys(windowLocationHref);
    const data = await defaultStorageArea.get(Object.values(keys));

    const currentVisibleUrls: string[] = data[keys.currentVisibleKeys] || [];

    const metadata: UrlInfo = data[keys.urlKey];
    const incoming: string[] = data[keys.incomingKey] || [];
    const outgoing: string[] = data[keys.outgoingKey] || [];
    
    const adjKeysIn = incoming.map(inUrl => getLinkKey(inUrl, windowLocationHref));
    const adjKeysInData: Record<string, LinkInfo> = await defaultStorageArea.get(adjKeysIn);

    const adjKeysOut = outgoing.map(outUrl => getLinkKey(windowLocationHref, outUrl));
    const adjKeysOutData: Record<string, LinkInfo> = await defaultStorageArea.get(adjKeysOut);

    return {
        metadata,
        incoming: Object.values(adjKeysInData),
        outgoing: Object.values(adjKeysOutData),
        currentVisibleUrls: currentVisibleUrls,
    }
}

export type CurrentLocationData = {
    incoming: LinkInfo[];
    outgoing: LinkInfo[];
    metadata: UrlInfo | undefined;
    currentVisibleUrls: string[];
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

