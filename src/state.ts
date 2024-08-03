import { setCssVars } from "src/utils/dom-utils";
import browser, { browserAction } from "webextension-polyfill";
import { WriteTx, clearKeys, filterObject, getAllData, getSchemaInstanceFields, hasNewItems, mergeArrays, newSchema, runReadTx, runWriteTx, setInstanceFieldKeys, undefinedOrEmptyInstance } from "./default-storage-area";
import { logTrace } from "./utils/log";
import { newTimer } from "./utils/perf";
import { groupBy } from "./utils/array-utils";

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
} | SaveUrlsMessage | {
    type: "save_urls_finished",
    numNewUrls: number;
    id: TabId;
} | {
    type: "content_collect_urls"
} | {
    type: "content_highlight_url",
    url: string,
};

export type SaveUrlsMessage = {
    type: "save_urls";
    currentTablUrl: string; 
    urls: UrlInfo[];
    tabId: TabId | null;
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

export function getTabId(tab: browser.Tabs.Tab | undefined): TabId | undefined {
    if (!tab?.id) {
        return undefined;
    }

    return { tabId: tab.id };
}

export async function sendMessageToCurrentTab(message: Message) {
    const tab = await getCurrentTab();
    const activeTab = getTabId(tab);
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
    let enabledFlags = await runReadTx("enabledFlags")

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
    return await runWriteTx({ enabledFlags });
}

export async function getTheme(): Promise<AppTheme> {
    const theme = await runReadTx("theme");
    if (theme === "Dark") {
        return "Dark";
    }

    return "Light";
};

export async function setTheme(theme: AppTheme) {
    await runWriteTx({ theme });

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

export function newUrlInfo(info: Omit<UrlInfo, "visitedAt">): UrlInfo {
    return { ...info, };
}

export type UrlType = "url" | "image" | "audio" | "video";

// TODO: store visitedAt in a separate time-series list, i.e 'history'
export type UrlInfo = {
    url: string;
    type: UrlType;

    // did we find this in a stylesheet?
    isRedirect?: boolean;

    // implemented:
    urlFrom?: string[];
    styleName?: string[];
    attrName?: string[];
    linkText?: string[];
    parentType?: string[];

    // TODO: implement
    linkImageUrl?: string[];
};

const urlFields = [
    "type",
    "styleName",
    "attrName",
    "linkText",
    "linkImageUrl",
    "parentType",
] as const;

export const urlSchema = newSchema({
    type: "url",
    idField: "url", 
    fields: [...urlFields],
});

function isArrayOrUndefined(val: any): val is unknown[] | undefined {
    return val === undefined || Array.isArray(val);
}

// if previousUrlInfo is supplied, we'll try to save a delta, which should be faster
export function saveUrlInfo(tx: WriteTx, urlInfo: UrlInfo, previousUrlInfo: UrlInfo | undefined) {
    if (!previousUrlInfo) {
        setInstanceFieldKeys(tx, urlSchema, urlInfo);
        return;
    }

    const filteredUrlInfo = filterObject(urlInfo, (key, newValue) => {
        const existingValue = previousUrlInfo[key];

        if (key === "url") {
            // Could be either existingValue or newValue, makes no difference
            return newValue;
        }

        if ((
            typeof existingValue === "string"
            || typeof existingValue === "boolean"
            || typeof existingValue === "number"
        ) && existingValue === newValue) {
            return undefined;
        }

        if (isArrayOrUndefined(existingValue) && isArrayOrUndefined(newValue)) {
            if (hasNewItems(existingValue, newValue)) {
                return mergeArrays(existingValue, newValue);
            }

            return undefined;
        }

        return newValue;
    });

    setInstanceFieldKeys(tx, urlSchema, filteredUrlInfo);

    return;
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

export function groupByUrlDomain(urls: UrlInfo[]): Record<string, UrlInfo[]> {
    return groupBy(urls, (info) => getUrlDomain(info.url));
}

export function getUrlDomain(url: string) {
    // TODO: change to hostname, or somethign smarter
    return new URL(url).hostname;
}

export function getDomainUrlsKey(domain: string): string {
    return "allUrls:" + domain;
}

export function writeDomainUrlKeys(writeTx: WriteTx, domain: string, urls: string[]) {
    writeTx["allUrls:" + domain] = urls.length === 0 ? undefined : urls;
    writeTx["allUrlsCount:" + domain] = urls.length === 0 ? undefined : urls.length;
}

export async function saveNewUrls(args : SaveUrlsMessage) {
    // Make sure this happens on the background script, to reduce the chances of the script terminating early
    if (process.env.SCRIPT !== "background-main") {
        sendMessage(args);
        return;
    }

    const timer = newTimer();
    timer.logTime("Started");

    const {
        currentTablUrl,
        urls,
        tabId,
    } = args;

    const domainMap = groupByUrlDomain(urls);
    const currentDomain = getUrlDomain(currentTablUrl);
    if (!(currentDomain in domainMap)) {
        domainMap[currentDomain] = [];
    }

    // Read in the stuff
    let data;
    {
        timer.logTime("Preparing read tx")

        const readTx: Record<string, any> = {};
        for (const info of urls) {
            readTx[info.url] = getSchemaInstanceFields(urlSchema, info.url);
        }
        readTx.domainUrls = Object.keys(domainMap).map(getDomainUrlsKey);
        readTx["allDomains"] = "allDomains";

        timer.logTime("Running read tx")
        data = await runReadTx(readTx);
    }

    // Write back the new stuff
    let numNewUrls = 0;
    {
        timer.logTime("Preparing write tx")

        const writeTx: WriteTx = {};

        for (const info of urls) {
            const previousUrlInfo = data[info.url];
            if (undefinedOrEmptyInstance(previousUrlInfo, urlSchema)) {
                numNewUrls += 1;
            }

            saveUrlInfo(writeTx, info, previousUrlInfo);
        }

        for (const domain in domainMap) {
            const oldUrlIds = data.domainUrls[domain];
            const incomingUrlIds = domainMap[domain].map(i => i.url);
            if (hasNewItems(oldUrlIds, incomingUrlIds)) {
                const merged = mergeArrays(oldUrlIds, incomingUrlIds);
                writeDomainUrlKeys(writeTx, domain, merged!);
            }
        }

        const oldDomains = data["allDomains"];
        const incomingDomains = Object.keys(domainMap);
        if (hasNewItems(oldDomains, incomingDomains)) {
            writeTx["allDomains"] = mergeArrays(oldDomains, incomingDomains);
        }

        if (tabId) {
            writeTx["currentVisibleUrls:" + tabId.tabId] = urls.map(info => info.url);
        }

        timer.logTime("writing")
        await runWriteTx(writeTx);
    }


    // return messages back to the sending tab
    {
        timer.logTime("Sending completion messages back to tabs...")
        if (tabId) {
            const tab = await browser.tabs.get(tabId.tabId);
            if (tab) {
                timer.logTime("notifying the current tab...");

                await sendMessageToTabs({
                    type: "save_urls_finished",
                    numNewUrls,
                    id: tabId
                }, [tabId]);
            }
        }
    }
    timer.logTime("DONE!")
    timer.stop();
}

/**
 * deletions are a record of { [domain] : url[] }
 */
export async function deleteUrls(urlsToDelete: string[]) {
    // readl all domain lrls
    const urlsByDomain = groupBy(urlsToDelete, getUrlDomain);

    const readTx: Record<string, any> = {
        domainUrls: {},
        allDomains: "allDomains",
    };
    for (const domain in urlsByDomain) {
        readTx.domainUrls[domain] = getDomainUrlsKey(domain);
    }

    const data = await runReadTx(readTx);

    // filter them, and then write them back
    const writeTx: WriteTx = {};
    const domainsToDelete = new Set<string>();
    for (const domain in urlsByDomain) {
        const existingUrls = data.domainUrls[domain];
        const urlsToDelete = urlsByDomain[domain];
        if (!existingUrls || !urlsToDelete) {
            continue;
        }

        const remainingUrls = existingUrls.filter((url: any) => !urlsToDelete.includes(url));
        writeDomainUrlKeys(writeTx, domain, remainingUrls);
        if (remainingUrls.length === 0) {
            domainsToDelete.add(domain);
        }
    }
    if (domainsToDelete.size > 0) {
        const remainingDomains = (data.allDomains || [])
            .filter((d: any) => !domainsToDelete.has(d));
        writeTx["allDomains"] = remainingDomains;
    }

    await runWriteTx(writeTx);
}

export async function deleteDomains(domainsToDelete: string[]) {
    const data = await runReadTx("allDomains");

    const writeTx: WriteTx = {};
    const toDeleteSet = new Set(domainsToDelete);
    for (const domain of domainsToDelete) {
        writeDomainUrlKeys(writeTx, domain, []);
    }
    writeTx["allDomains"] = (data || []).filter((d: any) => !toDeleteSet.has(d));

    console.log("Deleted: ", { data, domainsToDelete, writeTx });

    await runWriteTx(writeTx);
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
    await runWriteTx({ [key]: data ?? undefined });
}

export async function getUrlBeforeRedirect(currentTabId: TabId, currentTimestamp: number) {
    const key = getTabKey(currentTabId) + "redirectTempPersistance";

    const data = await runReadTx(key);
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
    const recentlyVisitedurls = await runReadTx("recentlyVisitedUrls");
    return recentlyVisitedurls || [];
}

export async function saveRecentlyVisitedUrls(urls: string[]) {
    await runWriteTx({ recentlyVisitedUrls: urls });
}

export async function collectUrlsFromTabs() {
    await sendMessageToTabs({ type: "content_collect_urls" });
}

export async function getCurrentTab(): Promise<browser.Tabs.Tab | undefined> {
    const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0];
}

export async function collectUrlsFromActiveTab() {
    return await sendMessageToCurrentTab({ type: "content_collect_urls" });
}

// The badge only has room for 4 digits...
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


