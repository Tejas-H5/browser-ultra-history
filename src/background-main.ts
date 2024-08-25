import browser, { browserAction } from "webextension-polyfill";
import { openExtensionTab } from "./open-pages";
import { clearAllData, collectUrlsFromTabs, recieveMessage, saveNewUrls } from "./state";
import { runAllTests } from "./tests";

browser.runtime.onInstalled.addListener(() => {
    onStart();
});

function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), ms);
    });
}

async function onStart() {
    try {
        if (process.env.ENVIRONMENT === "dev") {
            console.log("Loaded background main")

            runAllTests();

            await openExtensionTab();

            const initialCollect = false;
            if (initialCollect) {
                await clearAllData();
                await sleep(1000);
                await collectUrlsFromTabs().catch(console.error)
            }
        }
    } catch (e) {
        console.error(e);
    }
}

recieveMessage(async (message, sender) => {
    if (message.type === "log") {
        console.log(message.tabUrl, ":", message.message);
        return;
    }

    const tabId = sender.tab?.id;
    if (tabId) {
        message.senderTabId = { tabId };
    }

    console.log("got message: ", message.type);

    if (
        message.type === "start_collection_from_tabs"
        && message.tabIds
    ) {
        await collectUrlsFromTabs();
        return;
    }

    if (
        message.type === "set_tab_badge_text"
        && message.senderTabId
    ) {
        await browserAction.setBadgeText({
            text: message.text,
            tabId: message.senderTabId.tabId,
        })
    }

    if (message.type === "save_urls") {
        await saveNewUrls(message);
        return;
    }
});
