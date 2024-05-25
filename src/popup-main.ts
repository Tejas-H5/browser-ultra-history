import { Insertable, appendChild, div, newComponent, setErrorClass, setText } from './dom-utils'
import { collectUrlsFromTabs, getTheme, getUrlMessages, setTheme } from './state';
import { makeButton } from './generic-components';
import browser from "webextension-polyfill";

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded popup main!")
}

// NOTE: if this window can actually be opened in a maximized, and resizeable state, then 
// I would actually use this function to open the extention in a new window. 
// Unfortunately, this is not the case.
// @ts-expect-error
function openExtensionWindow() {
    browser.windows.create({
        url: "index.html",
        state: "docked",
    });
}

async function openExtensionTab() {
    browser.tabs.create({
        url: "index.html",
        active: true,
        index: 0,
    });
}

// This page exists only for quick actions, and to link to the real extension page.
function App() {
    const collectButton = makeButton("Collect");
    const gotoTabButton = makeButton("Open Window");
    const urlCountEl = div();
    
    const root = div({ class: "row sbt1", style: "gap: 3px" }, [
        collectButton,
        div({}, ["|"]),
        gotoTabButton,
        div({ class: "flex-1" }),
        urlCountEl,
    ]);

    const component = newComponent(root, () => rerenderAppComponent());

    async function rerenderAppComponent() {
        setErrorClass(urlCountEl, false);

        try {
            const urls = await getUrlMessages();
            setText(urlCountEl, "urls: " + Object.keys(urls).length);
        } catch (e) {
            setErrorClass(urlCountEl, true);
        }
    }

    collectButton.el.addEventListener("click", () => {
        handleClick();
    });

    gotoTabButton.el.addEventListener("click", () => {
        openExtensionTab();
    });

    async function handleClick() {
        await collectUrlsFromTabs();

        rerenderApp();
    }

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

function rerenderApp() {
    app.render(app.args);
}

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
