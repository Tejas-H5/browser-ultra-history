import './styles.css'
import './style-utils.css'
import { Insertable, appendChild, div, newComponent, newListRenderer, setClass, setText } from './dom-utils'
import { collectUrlsFromTabs, getTheme, getUrlMessages, setTheme } from './state';
import { makeButton } from './generic-components';
import { UrlInfo } from './message';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded popup main!")
}

function App() {
    const messagesRoot = div();

    const list = newListRenderer(messagesRoot, () => {
        const root = div();

        const c = newComponent<{info: UrlInfo}>(root, render);

        function render() {
            const url = c.args.info.url;
            setText(root, "length=" + url.length + " - " + url);
        }

        return c;
    });

    const collectButton = makeButton("Collect");
    
    const root = div({ 
        class: "row solid-border-sm align-items-stretch", 
        style: "position: fixed; top: 10px; left: 10px; bottom: 10px; right: 10px;" 
    }, [
        div({ class: "col" }, [
            div({ class: "row" }, [
                collectButton,
            ]),
            div({ class: "flex-1 overflow-y-auto" }, [
                list,
            ]),
        ]),
        div({ class: "col flex-1" }, [
            
        ]),
    ]);

    const component = newComponent(root, () => rerenderAppComponent());

    async function rerenderAppComponent() {
        setClass(list, "unfocused-text-color", true);

        const urls = await getUrlMessages();
        setClass(list, "unfocused-text-color", false);
        list.render(() => {
            for (const key in urls) {
                const info = urls[key];
                if (info.url) {
                    list.getNext().render({ info });
                }
            }
        });
    }

    collectButton.el.addEventListener("click", () => {
        handleClick();
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

function rerenderApp() {
    app.render(app.args);
}

(async () => {
    await setTheme(await getTheme());
})();

rerenderApp();
