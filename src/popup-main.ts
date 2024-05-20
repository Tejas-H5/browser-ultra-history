import './styles.css'
import './style-utils.css'
import { Insertable, appendChild, div, newComponent, newListRenderer, setClass, setText } from './dom-utils'
import { collectUrlsFromTabs, getTheme, getUrlMessages, setTheme } from './state';
import { makeButton } from './generic-components';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded popup main!")
}

function App() {
    const messagesRoot = div();

    const list = newListRenderer(messagesRoot, () => {
        const root = div();
        const c = newComponent<{message: string}>(root, render);
        function render() {
            setText(root, c.args.message);
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
            div({ class: "flex-1" }, [
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
            console.log("messageS", messages);
            setClass(list, "unfocused-text-color", false);
            list.render(() => {
                for (const url of Object.keys(messages)) {
                    list.getNext().render({ message: url });
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
