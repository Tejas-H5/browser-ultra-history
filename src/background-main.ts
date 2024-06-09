import browser from "webextension-polyfill";
import { openExtensionTab } from "./open-pages";
import { clearAllData, collectUrlsFromTabs, recieveMessage, saveOutgoingUrls } from "./state";
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
        // await clearAllData();

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

        browser.webNavigation.onCompleted.addListener((details) => {
            console.log("recieved navigation event");
            // const tabId = details.tabId;
            // collectUrlsFromTabs([{ tabId }]);
        });

        browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
            console.log("history updated");
            // TODO: collect stuff??
        });

    } catch (e) {
        console.error(e);
    }
}

recieveMessage((message) => {
    if (message.type === "log") {
        console.log(message.tabUrl, ":", message.message);
        return;
    } 

    console.log("got message: ", message.type);

    if (message.type === "start_collection_from_tabs") {
        if (message.tabIds) {
            collectUrlsFromTabs();
        }
        return;
    }

    if(message.type === "save_urls") {
        saveOutgoingUrls(message.currentTablUrl, message.outgoingUrlInfos);
        return;
    }
});
