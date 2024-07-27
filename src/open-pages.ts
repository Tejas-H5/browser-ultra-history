import browser from "webextension-polyfill";
import { getCurrentTab } from "./state";

// NOTE: if this window can actually be opened in a maximized, and resizeable state, then 
// I would actually use this function to open the extention in a new window. 
// Unfortunately, this is not the case.
export async function openExtensionWindow() {
    return await browser.windows.create({
        url: "/pages/index.html",
        state: "docked",
    });
}

export async function openExtensionTab() {
    return await browser.tabs.create({
        url: "/pages/index.html",
        active: true,
        index: 0,
    });
}

export async function navigateToUrl(urlTo: string, newTab: boolean, active: boolean) {
    if (newTab) {
        await browser.tabs.create({
            url: urlTo,
            active,
            index: 10000,
        });

        return;
    }

    const currentTab = await getCurrentTab();
    if (!currentTab) {
        return;
    }

    const { url, id } = currentTab;
    if (!url || (!id && id !== 0)) {
        return;
    }

    browser.tabs.update(currentTab.id, {
        url: urlTo,
    });
}
