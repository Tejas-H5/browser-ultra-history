import browser from "webextension-polyfill";
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

        // Redirect tracking code has been disbaled for now
        // browser.webNavigation.onCompleted.addListener(async (details) => {
        //     const tab = await browser.tabs.get(details.tabId);
        //     if (!tab) {
        //         return;
        //     }
        //
        //     const url = tab.url;
        //     if (!url) {
        //         return;
        //     }
        //
        //     const recentlyVisited = await getRecentlyVisitedUrls();
        //     recentlyVisited.push(url);
        //     await saveRecentlyVisitedUrls(recentlyVisited);
        // });
        //
        // browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
        //     const enabledFlags = await getEnabledFlags();
        //     if (!enabledFlags.extension) {
        //         return;
        //     }
        //
        //     if (details.frameId !== 0) {
        //         return;
        //     }
        //
        //     const tab = await browser.tabs.get(details.tabId);
        //     if (!tab) {
        //         return;
        //     }
        //
        //     const url = tab.url;
        //     if (!url) {
        //         return;
        //     }
        //
        //     if (url === "about:blank") {
        //         const prevUrl = await getUrlBeforeRedirect({ tabId: details.tabId }, Date.now());
        //
        //         if (prevUrl && details.url !== prevUrl) {
        //             await saveOutgoingLinks(
        //                 prevUrl,
        //                 [
        //                     newUrlInfo({
        //                         urlFrom: prevUrl,
        //                         url: details.url,
        //                         redirect: true,
        //                     }),
        //                 ],
        //                 []
        //             );
        //         }
        //     } else {
        //         await setUrlBeforeRedirect({ tabId: details.tabId }, {
        //             currentUrl: details.url,
        //             timestamp: Date.now(),
        //         });
        //     }
        // });

    } catch (e) {
        console.error(e);
    }
}

recieveMessage((message, sender) => {
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
        const tabId = sender.tab?.id;
        if (tabId) {
            message.tabId = { tabId };
        }
        saveNewUrls(message);
        return;
    }
});
