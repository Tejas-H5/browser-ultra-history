import { setCssVars } from "src/utils/dom-utils";
import browser, { browserAction } from "webextension-polyfill";
import { logTrace } from "./utils/log";
import { newTimer } from "./utils/perf";
import { newAwaiter } from "./utils/async-utils";
import { clearKeys, getKeys, removeKey, setKeys } from "./default-storage-area";

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
    const state = await getAllData();
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

export type EnabledFlags = {
    extension: boolean;
    deepCollect: boolean;
}

const DEFAULT_ENABLED_FLAGS: EnabledFlags = {
    extension: true,
    // some of these collections are frankly unnecessary and cause a lot of lag for regular use.
    // only turn this on if you want to have some fun!
    deepCollect: false,
}

export async function getEnabledFlags(): Promise<EnabledFlags> {
    let { enabledFlags } = await getKeys("enabledFlags")

    // set defaults if they aren't already set.
    enabledFlags = enabledFlags || {};
    for (const flag in DEFAULT_ENABLED_FLAGS) {
        if (!(flag in enabledFlags)) {
            // @ts-expect-error trust me bro
            enabledFlags[flag] = DEFAULT_ENABLED_FLAGS[flag];
        }
    }

    return enabledFlags || {};
}

export async function setEnabledFlags(enabledFlags: EnabledFlags) {
    return await setKeys({ enabledFlags });
}

export async function getTheme(): Promise<AppTheme> {
    const { theme } = await getKeys("theme");
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

export async function clearAllData() {
    logTrace("Clearing all data...");
    await clearKeys();
    logTrace("Cleared!");

    browserAction.setBadgeText({ text: "0" });
}

export function getUrlKey(url: string) {
    return "#u:" + url;
}

export function isUrlKey(key: string) {
    return key.startsWith("#u:");
}

export const OUT_PREFIX = "#o:";

// an array with a list of urls that linked to this one
export function getAdjOutgoingKey(url: string) {
    return OUT_PREFIX + url;
}

export function isOutKey(key: string) {
    return key.startsWith(OUT_PREFIX);
}


export const IN_PREFIX = "#i:";

// an array with a list of urls that this one links to
export function getAdjIncomingKey(url: string) {
    return IN_PREFIX + url;
}

export function isInKey(key: string) {
    return key.startsWith(IN_PREFIX);
}

export function getLinkKey(fromUrl: string, toUrl: string) {
    return "#l:" + fromUrl + ">-->" + toUrl;
}

export async function getUrlInfo(urlKey: string): Promise<UrlInfo | undefined> {
    const data = await getKeys(urlKey);
    return data[urlKey] as UrlInfo | undefined;
}

export async function getLinkInfo(linkKey: string): Promise<LinkInfo | undefined> {
    const data = await getKeys(linkKey);
    return data[linkKey] as LinkInfo | undefined;
}

export async function setLinkMetadata(urlFrom: string, urlTo: string, metadata: LinkInfo) {
    const key = getLinkKey(urlFrom, urlTo);
    await setKeys({ [key]: metadata });
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
    const data = await getKeys(adjKey);
    return data[adjKey] || [];
}

function mergeAdjacencies(existing: string[], incoming: string[]): string[] {
    // NOTE: the ?? [] is just to appease typescript, it should never run.
    return mergeArrays(existing, incoming) ?? [];
}

export async function saveUrlInfo(info: UrlInfo): Promise<boolean> {
    const urlKey = getUrlKey(info.url);
    const existing = await getUrlInfo(urlKey);
    if (!existing) {
        await setKeys({ [urlKey]: info});
        return true;
    }

    // TODO: add merging logic here when needed.
    return false;
}

function mergeArrays(a: undefined | string[], b: undefined | string[]) {
    if(!a && !b) {
        return undefined;
    }

    if (!a) {
        return b;
    }

    if (!b) {
        return a;
    }

    return [...new Set<string>([...a, ...b])];
}

// checks if two string arrays are equal in contents. will sort them in place for the final comparison.
// for some reason, writing data to the local storage area is VERY expensive (can take several seconds), so
// we need to minimize the number of writes as much as possible, including only writing stuff if it changed.
function compareArrays(arr1: string[] | undefined, arr2: string[] | undefined): boolean {
    if (arr1 === undefined && arr2 === undefined) {
        return true;
    }

    if ( arr1 === undefined || arr2 === undefined) {
        return false;
    }

    if(arr1.length !== arr2.length) {
        return false;
    }

    arr1.sort((a, b) => a.localeCompare(b));
    arr2.sort((a, b) => a.localeCompare(b));

    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }

    return true;
}

export async function saveLinkInfo(urlFrom: string, linkInfo: LinkInfo) {
    linkInfo.urlFrom = urlFrom;
    const linkKey = getLinkKey(urlFrom, linkInfo.urlTo);
    const existing = await getLinkInfo(linkKey);
    if (!existing) {
        await setKeys({ [linkKey]: linkInfo });
        return;
    }

    if (linkInfo.urlTo !== existing.urlTo ||
        linkInfo.urlFrom !== existing.urlFrom) {
        console.log("CRITICAL", linkInfo.urlFrom, linkInfo.urlTo, existing.urlFrom, existing.urlTo);
        throw new Error("critical error!!");
    }

    const newLinkInfo: LinkInfo = {
        urlTo: existing.urlTo,
        urlFrom: existing.urlFrom,
        visitedAt: existing.visitedAt,

        redirect: linkInfo.redirect || existing.redirect,
        isAsset: linkInfo.isAsset || existing.isAsset,

        linkText: mergeArrays(existing.linkText, linkInfo.linkText),
        parentType: mergeArrays(existing.parentType, linkInfo.parentType),
        styleName: mergeArrays(existing.styleName, linkInfo.styleName),
        attrName: mergeArrays(existing.attrName, linkInfo.attrName),
        contextString: mergeArrays(existing.contextString, linkInfo.contextString),
        linkImage: mergeArrays(existing.linkImage, linkInfo.linkImage),
    };

    if (linkInfo.isAsset === true) {
        existing.isAsset = true
    }

    let changed = false;
    for (const key in newLinkInfo) {
        // NOTE: frequently changing data like visitedAt might have to be stored separately,
        // so that we don't keep saving  mostly the same metatadata blob
        if (key === "urlTo" || key === "urlFrom" || key === "visitedAt") {
            continue;
        }

        // @ts-expect-error trust me bro
        const newValue: any = newLinkInfo[key];
        // @ts-expect-error trust me bro
        const existingValue : any = existing[key];

        if (newValue === existingValue) {
            continue;
        }

        if (existingValue === undefined && newValue !== undefined) {
            console.log("link metadata changed!", key);
            changed = true;
            break;
        }

        if (Array.isArray(existingValue) && Array.isArray(newValue)) {
            if (compareArrays(existingValue, newValue)) {
                continue;
            }

            console.log("link metadata changed!", key, existingValue, newValue);
            changed = true;
            break;
        }

        // the code shouldn't ever reach here, but it might (developer skill issue)
        console.warn("unhandled case: ", existingValue, newValue, Array.isArray(existingValue), Array.isArray(newValue));
        changed = true;
        break;
    }

    if (changed) {
        await setKeys({ [linkKey]: newLinkInfo });
    }
}

export async function saveOutgoingUrls(urlFrom: string, urls: string[]) {
    const urlOutLinksKey = getAdjOutgoingKey(urlFrom);
    const existing = await getUrlsFrom(urlOutLinksKey);

    const mergedAdj = mergeAdjacencies(existing, urls);
    if (!compareArrays(mergedAdj, existing)) {
        await setKeys({ [urlOutLinksKey]: mergedAdj });
    }
}

export async function saveIncomingUrls(urls: string[], urlTo: string) {
    const newOutgoingIncomingKey = getAdjIncomingKey(urlTo);
    const existing = await getUrlsFrom(newOutgoingIncomingKey);
    
    const mergedAdj = mergeAdjacencies(existing, urls);
    if (!compareArrays(mergedAdj, existing)) {
        await setKeys({ [newOutgoingIncomingKey]: mergedAdj });
    }
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

    const timer = newTimer();


    const awaiter = newAwaiter();

    timer.logTime("saving urls...");

    awaiter(
        () => setKeys({ currentVisibleUrls })
    );

    timer.logTime("saving url infos...");

    // save the url infos
    {
        awaiter(
            () => saveUrlInfo(newUrlInfo({ url: currentTablUrl }))
        );

        for (const link of outgoingLinks) {
            awaiter(async () => {
                const isNew = await saveUrlInfo(newUrlInfo({ url: link.urlTo }));
                if (isNew) {
                    numNewUrls += 1;
                }
            })
        }
    }

    timer.logTime("saving link metadatas...");

    // save the link metadata
    {
        for (const link of outgoingLinks) {
            awaiter(
                () => saveLinkInfo(currentTablUrl, link)
            );
        }
    }

    timer.logTime("saving adjacencies...");

    // save the adjacency info we can use to find incoming and outgoing links for a particular url
    {
        const urlOutLinksNew: string[] = outgoingLinks.map(info => info.urlTo);
        awaiter(
            () => saveOutgoingUrls(currentTablUrl, urlOutLinksNew)
        );

        for (const newOutgoingUrl of urlOutLinksNew) {
            awaiter(
                () => saveIncomingUrls([currentTablUrl], newOutgoingUrl)
            );
        }
    }

    timer.logTime("awaiting all tasks in parallel...")

    const results = await awaiter.allSettled();

    timer.logTime("collating errors from tasks ...", awaiter.tasks.length);

    let successful = 0;
    let errorReasons: string[] = [];
    for (const res of results) {
        if (res.status === "rejected") {
            errorReasons.push(res.reason);
        } else {
            successful += 1;
        }
    }

    if (errorReasons.length > 0) {
        console.log("Some errors have occured while saving: ", [...new Set(errorReasons)]);
    }

    if (currentTablUrl) {
        const tabs = await browser.tabs.query({ url: currentTablUrl });
        const tabId = tabs[0]?.id;
        if (tabs.length > 0 && tabId) {
            timer.logTime("notifying the current tab...");
            
            await sendMessageToTabs({ type: "save_urls_finished", numNewUrls, id: currentTablUrl  }, tabId ? [{ tabId }] : undefined);
        }
    }

    timer.stop();
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
        await removeKey(key);
    } else {
        await setKeys({ [key]: data });
    }
}

export async function getUrlBeforeRedirect(currentTabId: TabId, currentTimestamp: number) {
    const key = getTabKey(currentTabId) + "redirectTempPersistance";

    const data = await getKeys(key);
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
    const { recentlyVisitedurls } = await getKeys(["recentlyVisitedUrls"]);
    return recentlyVisitedurls || [];
}

export async function saveRecentlyVisitedUrls(urls: string[]) {
    await setKeys({ recentlyVisitedUrls: urls });
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
    const data = await getKeys(Object.values(keys));

    const currentVisibleUrls: string[] = data[keys.currentVisibleKeys] || [];

    const metadata: UrlInfo = data[keys.urlKey];
    const incoming: string[] = data[keys.incomingKey] || [];
    const outgoing: string[] = data[keys.outgoingKey] || [];
    
    const adjKeysIn = incoming.map(inUrl => getLinkKey(inUrl, windowLocationHref));
    const adjKeysInData: Record<string, LinkInfo> = await getKeys(adjKeysIn);

    const adjKeysOut = outgoing.map(outUrl => getLinkKey(windowLocationHref, outUrl));
    const adjKeysOutData: Record<string, LinkInfo> = await getKeys(adjKeysOut);

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

export async function getAllData(): Promise<any> {
    return await getKeys(null);
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

