import { appendChild, div, newComponent, newInsertable, newRenderGroup } from 'src/utils/dom-utils';
import { onStateChange } from './default-storage-area';
import { renderContext } from './render-context';
import { getTheme, sendMessageToCurrentTab, setTheme } from './state';
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
        rg.c(TopBar(false)),
        div({ class: "flex-1 col" }, [
            rg(UrlExplorer(), c => c.render({
                openInNewTab: false,
                onHighlightUrl,
            })),
        ]),
    ]);

    function onHighlightUrl(url: string) {
        sendMessageToCurrentTab({ type: "content_highlight_url", url })
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
appendChild(
    newInsertable(document.body),
    app
);

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
