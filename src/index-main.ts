import { Insertable, appendChild, div, newComponent, newListRenderer, setText, setVisible } from './utils/dom-utils'
import { getCollectedUrls, getLastCollectedAtIso, getTheme, setTheme } from './state';
import { UrlInfo, isNotOwnRenderMessage, recieveMessage, sendRerenderMessage } from './message';
import { formatDate } from './utils/datetime';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded main main extension page!!!")
}

function UrlList() {
    function UrlComponent() {
        const urlEl = div();
        const visitedAtEl = div();
        const urlFromEl = div();
        const textEl = div();
        const styleNameEl = div();
        const attrNameEl = div();
        const root = div({ 
            class: "handle-long-words row",
        }, [
            div({}, [
                urlEl,
                urlFromEl,
                textEl,
                div({
                    class: "row",
                    style: "gap: 5px",
                }, [
                    visitedAtEl,
                    styleNameEl,
                    attrNameEl,
                ])
            ])
        ]);

        const component = newComponent<{ info: UrlInfo; }>(root, render);

        function render() {
            const { info } = component.args;

            const { url, urlCollectedFrom, metadata } = info;
            const visitedAt = new Date(info.visitedAt);

            setText(urlEl, url);
            setText(urlFromEl, "from: " + urlCollectedFrom);
            setText(visitedAtEl, formatDate(visitedAt));

            setVisible(textEl, metadata.source === "text")
            if (metadata.source === "text") {
                setText(textEl, "text: " + metadata.text);
            }

            setVisible(styleNameEl, metadata.source === "style")
            if (metadata.source === "style") {
                setText(styleNameEl, "style: " + metadata.styleName);
            }

            setVisible(attrNameEl, metadata.source === "attribute")
            if (metadata.source === "attribute") {
                setText(attrNameEl, "attr: " + metadata.attrName);
            }
        }
        
        return component;
    }

    const listRoot = div({ class: "flex-1 col", style: "gap: 10px" });
    const empty = div({ class: "row align-items-center justify-content-center" }, [ "No urls collected yet" ]);
    const root = div({ class: "col flex-1 overflow-y-auto" }, [
        listRoot,
        empty,
    ]);

    const list = newListRenderer(listRoot, UrlComponent);
    const component = newComponent(root, render);

    let lastUrls: Record<string, UrlInfo> = {};
    let urlsSorted: UrlInfo[] = [];
    let lastUrlsCollectedAt: string | undefined = undefined;
    async function refetchUrls() {
        const urlsCollectedAt = await getLastCollectedAtIso();
        if (urlsCollectedAt === lastUrlsCollectedAt) {
            return;
        }

        lastUrlsCollectedAt = urlsCollectedAt;
        if (!lastUrlsCollectedAt) {
            return;
        }

        lastUrls = await getCollectedUrls();
        urlsSorted = Object.values(lastUrls);
        urlsSorted.sort((a, b) => {
            return a.url.localeCompare(b.url);
        });
    }

    async function render() {
        await refetchUrls();

        setVisible(empty, lastUrlsCollectedAt === undefined);

        if (setVisible(listRoot, lastUrlsCollectedAt !== undefined)) {
            list.render(() => {
                for (const info of urlsSorted) {
                    const c = list.getNext();
                    c.render({ info });
                }
            });
        }
    }

    return component;
}

// This page exists only for quick actions, and to link to the real extension page.
function App() {
    const urlList = UrlList();
    const root = div({ 
        class: "fixed row", 
        style: "top: 0; bottom: 0; left: 0; right: 0;" 
    }, [
        urlList,
    ]);

    const c = newComponent(root, render);

    async function render() {
        await urlList.render(undefined);
    }

    return c;
}

const app = App();

const root: Insertable = {
    el: document.querySelector<HTMLDivElement>('#app')!,
    _isInserted: true,
};

appendChild(root, app);

async function rerenderApp() {
    await app.render(app.args);
    await sendRerenderMessage();
}

recieveMessage((message) => {
    console.log(message);
    if (!isNotOwnRenderMessage(message)) {
        rerenderApp();
    }
});

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
