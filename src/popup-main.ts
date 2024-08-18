import { RenderGroup, appendChild, div, newComponent, newInsertable, setVisible } from 'src/utils/dom-utils';
import { onStateChange } from './default-storage-area';
import { renderContext } from './render-context';
import { getTheme, sendMessageToCurrentTab, setTheme } from './state';
import { makeTopBar } from './top-bar';
import { UrlExplorer } from './url-explorer';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded popup main!")
}

const TopBar = makeTopBar(false);

// This page exists only for quick actions, and to link to the real extension page.
// Also, it exists to navigate the 
function PopupAppRoot(rg: RenderGroup) {
    function onHighlightUrl(url: string) {
        setVisible(appRoot, false);
        sendMessageToCurrentTab({ type: "content_highlight_url", url })

        body.style.width = "1px";
        body.style.height = "1px";

        setTimeout(() => {
            body.style.width = "800px";
            body.style.height = "600px";
            setVisible(appRoot, true);
            // TODO: we should really await the animation rather than hardcoding the delay.
            // That seems like a pain to do though, so I've not done it yet
        }, 1000);
    }

    const appRoot = div({
        class: "fixed col",
        style: "top: 0; bottom: 0; left: 0; right: 0;"
    }, [
        rg.cNull(TopBar),
        div({ class: "flex-1 col" }, [
            rg.c(UrlExplorer, c => c.render({
                openInNewTab: false,
                onHighlightUrl,
            }))
        ]),
    ]);

    return appRoot;
}

const app = newComponent(PopupAppRoot);
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
    app.render(null);
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
