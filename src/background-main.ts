import { recieveMessage } from "./message";
import { openExtensionTab } from "./open-pages";
import { clearAllForDev, collectUrlsFromTabs, } from "./state";
import browser from "webextension-polyfill";

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
            console.log("Loaded background main!")

            await openExtensionTab();

            const initialCollect = false;

            if (initialCollect) {
                console.log("Clearing all for dev");
                await clearAllForDev();

                await sleep(1000);

                await collectUrlsFromTabs().catch(console.error)
            }
        }

    } catch (e) {
        console.error(e);
    }
}

recieveMessage((message) => {
    if (message.type === "log") {
        console.log(message.tabUrl, ":", message.message);
    }
});
