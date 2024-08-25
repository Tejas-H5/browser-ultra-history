// NOTE: This will only work if our framework's render tree is synchronous.
// This is the main reason why I've actually removed all the Promise<void> and async stuff from dom-utils.
// The synchronicity gives us a lot of guarantees for free.

import { initializeDefaultStorageArea } from "./default-storage-area";
import { getTheme, setTheme } from "./state";

// Try not to add too much crap into here
const renderContext = {
    externalStateChanged: false,
    renderFn: () => {},
};

export function rerenderApp(externalStateChaged = false) {
    renderContext.externalStateChanged = externalStateChaged;
    renderContext.renderFn();
}

export function hasExternalStateChanged(): boolean {
    return renderContext.externalStateChanged;
}

export function insertAndInitializeAppAndRenderContext(renderFn: () => void) {
    renderContext.renderFn = renderFn;

    (async () => {
        const theme = await getTheme();
        console.log("Set theme", theme);
        await setTheme(theme);
    })();

    initializeDefaultStorageArea(() => rerenderApp(true));

    rerenderApp(true);
}
