import { div, initSPA, newRefetcher, newComponent, newRenderGroup } from 'src/utils/dom-utils';
import { CurrentLocationData, getCurrentLocationData, getCurrentTabUrl, getTheme, onStateChange, setTheme } from './state';
import { TopBar } from './top-bar';
import { UrlExplorer } from './url-explorer';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded popup main!")
}

// This page exists only for quick actions, and to link to the real extension page.
// Also, it exists to navigate the 
function PopupAppRoot() {
    const rg = newRenderGroup();

    const appRoot = div({
        class: "fixed col",
        style: "top: 0; bottom: 0; left: 0; right: 0;"
    }, [
        rg.component(TopBar(false)),
        div({ class: "flex-1 col" }, [
            rg.if(() => fetchState.state === "failed", div({ class: "flex-1 col flex-center" }, [
                "Loading failed: ",
                rg.text(() => fetchState.errorMessage || "An unknown error occured"),
            ])),
            rg.if(() => fetchState.state !== "failed", rg.componentArgs(UrlExplorer(), () => {
                if (!data) {
                    return;
                }

                function onPushPathItem(key: string) {

                }

                return {
                    data,
                    loading: fetchState.state === "loading",
                    currentPath: [],
                    onPushPathItem: onPushPathItem
                };
            })),
        ]),
    ]);

    let data: CurrentLocationData | undefined;

    const fetchState = newRefetcher(render, async () => {
        const currentTabUrl = await getCurrentTabUrl();
        if (!currentTabUrl) {
            throw new Error("Couldn't find current tab!");
        }

        data = await getCurrentLocationData(currentTabUrl);
        if (!data) {
            throw new Error("No data collected yet for this location!");
        }
    });

    function render() {
        rg.render();
    }

    async function renderAsync() {
        if (asyncStateInvalidated) {
            asyncStateInvalidated = false;

            await fetchState.refetch();

            if (fetchState.state !== "loaded") {
                asyncStateInvalidated = true;
            }
        }

        render();
    }

    const component = newComponent(appRoot, () => renderAsync());

    return component;
}

const app = PopupAppRoot();
initSPA("#app", app);

// Set the size to max
const body = document.querySelector("body")!;
body.style.width = "800px";
body.style.height = "600px";

function rerenderApp() {
    app.render(undefined);
}

let stateChangeDebounceTimout = 0;
let asyncStateInvalidated = true;
onStateChange(() => {
    clearTimeout(stateChangeDebounceTimout);
    stateChangeDebounceTimout = setTimeout(() => {
        asyncStateInvalidated = true;
        rerenderApp();
    }, 1000);
});

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
