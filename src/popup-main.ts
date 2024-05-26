import { Insertable, appendChild, div, newComponent, setErrorClass, setText } from 'src/utils/dom-utils'
import { makeButton } from 'src/components';
import { collectUrlsFromTabs, getTheme, getCollectedUrls, setTheme, clearAllData, onStateChange } from './state';
import { openExtensionTab } from './open-pages';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded popup main!")
}

// This page exists only for quick actions, and to link to the real extension page.
function App() {
    const collectButton = makeButton("Collect");
    const clearButton = makeButton("Clear");
    const gotoTabButton = makeButton("Open Tab");
    const urlCountEl = div();

    const root = div({ class: "row sbt1", style: "gap: 3px" }, [
        collectButton,
        div({}, ["|"]),
        clearButton,
        div({}, ["|"]),
        gotoTabButton,
        div({ class: "flex-1" }),
        urlCountEl,
    ]);

    const component = newComponent(root, rerenderAppComponent);

    async function rerenderAppComponent() {
        setErrorClass(urlCountEl, false);

        try {
            const urls = await getCollectedUrls();
            setText(urlCountEl, "urls: " + Object.keys(urls).length);
        } catch (e) {
            setErrorClass(urlCountEl, true);
        }
    }

    collectButton.el.addEventListener("click", async () => {
        await collectUrlsFromTabs();
        rerenderApp();
    });

    gotoTabButton.el.addEventListener("click", async () => {
        await openExtensionTab();
    });

    clearButton.el.addEventListener("click", async () => {
        await clearAllData();
        rerenderApp();
    });

    return component;
}

const app = App();

const root: Insertable = {
    el: document.querySelector<HTMLDivElement>('#app')!,
    _isInserted: true,
};

appendChild(root, app);

// Set the size to max
const body = document.querySelector("body")!;
body.style.width = "600px";

// body.style.height = "600px";

async function rerenderApp() {
    await app.render(app.args);
}

onStateChange(() => {
    rerenderApp();
});

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
