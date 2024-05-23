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
            console.log(c.args.info);
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

    const component = newComponent(root, rerenderAppComponent);

    function rerenderAppComponent() {
        setClass(list, "unfocused-text-color", true);
        getUrlMessages().then((messages) => {
            setClass(list, "unfocused-text-color", false);
            list.render(() => {
                console.log(messages);
                for (const url in messages) {
                    list.getNext().render({ info: messages[url] });
                }
            });
        });
    }

    collectButton.el.addEventListener("click", () => {
        collectUrlsFromTabs().then(() => rerenderApp());
    });

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
    setTheme(await getTheme());
})();

rerenderApp();
