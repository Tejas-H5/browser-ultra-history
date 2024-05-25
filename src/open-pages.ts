import browser from "webextension-polyfill";

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
