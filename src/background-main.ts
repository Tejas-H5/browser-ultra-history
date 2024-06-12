import browser from "webextension-polyfill";
import { openExtensionTab } from "./open-pages";
import { clearAllData, collectUrlsFromTabs, getCurrentTabId, getCurrentTabUrl, getIsDisabled, getUrlBeforeRedirect, newLinkInfo, recieveMessage, saveOutgoingLinks, setUrlBeforeRedirect } from "./state";
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

        browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
            const disabled = await getIsDisabled();
            if (disabled) {
                return;
            }

            if (details.frameId !== 0) {
                return;
            }

            const tab = await browser.tabs.get(details.tabId);
            if (!tab) {
                return;
            }

            const url = tab.url;
            if (!url) {
                return;
            }

            if (url === "about:blank") {
                const prevUrl = await getUrlBeforeRedirect(details.tabId, Date.now());

                if (prevUrl && details.url !== prevUrl) {
                    console.log("saving redirect:", prevUrl, " -> ", details.url);
                    await saveOutgoingLinks(prevUrl, [
                        newLinkInfo({
                            urlFrom: prevUrl,
                            urlTo: details.url,
                            redirect: true,
                        }),
                    ]);
                }
            } else {
                await setUrlBeforeRedirect({
                    currentUrl: details.url,
                    tabId: details.tabId,
                    timestamp: Date.now(),
                });
            }      
        });

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
        saveOutgoingLinks(message.currentTablUrl, message.outgoingLinks, sender.tab?.id);
        return;
    }
});
