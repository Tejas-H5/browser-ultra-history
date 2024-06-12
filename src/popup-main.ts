import { div, initSPA, newComponent, newRenderGroup } from 'src/utils/dom-utils';
import browser from "webextension-polyfill";
import { getCurrentTab, getTheme, onStateChange, setTheme, setUrlBeforeRedirect } from './state';
import { UrlExplorer } from './url-explorer';
import { renderContext } from './render-context';
import { TopBar } from './top-bar';

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
            rg.componentArgs(UrlExplorer(), () => {
                return { onNavigate }
            }),
        ]),
    ]);

    async function onNavigate(urlTo: string) {
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

    function render() {
        rg.render();
    }

    async function renderAsync() {
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

function rerenderApp(forceRefetch = false) {
    renderContext.forceRefetch = forceRefetch;
    app.render(undefined);
}

let stateChangeDebounceTimout = 0;

onStateChange(() => {
    clearTimeout(stateChangeDebounceTimout);
    stateChangeDebounceTimout = setTimeout(() => {
        rerenderApp(true);
    }, 1000);
});

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
