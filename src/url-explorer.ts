import { CurrentLocationData } from "./state";
import { div, divClass, newComponent, newRenderGroup, on, setClass } from "./utils/dom-utils";

function UrlList()  {
    type Args = {
        urls: string[]; 
        isIncoming: boolean;
        onClick: (key: string) => void;
    };

    function UrlListItem() {
        type Args = {
            url: string;
            isIncoming: boolean;
            onClick(): void;
        };

        let isMouseOver = false;

        const rg = newRenderGroup();
        const root = divClass("hover-parent hover", {}, [
            rg.text(() => c.args.isIncoming && isMouseOver ? "<-- " : ""),
            rg.text(() => c.args.url),
            rg.text(() => !c.args.isIncoming && isMouseOver ? " -->" : ""),
        ]);

        const c = newComponent<Args>(root, render);

        function render() {
            rg.render();

            setClass(root, "pointer", isMouseOver);
            setClass(root, "underline", isMouseOver);
        }

        on(root, "click", () => {
            const { onClick } = c.args;
            onClick();
        });

        on(root, "mouseenter", () => {
            isMouseOver = true;
            render();
        });

        on(root, "mouseleave", () => {
            isMouseOver = false;
            render();
        });

        return c;
    }

    const scrollContainer = div({ class: "overflow-y-auto" });
    const rg = newRenderGroup();
    const root = divClass("flex-1 col debug", {}, [
        rg.list(scrollContainer, UrlListItem, (getNext) => {
            const { urls, isIncoming } = c.args;
            
            for (const url of urls) {
                getNext().render({
                    url,
                    isIncoming,
                    onClick: () => c.args.onClick(url),
                });
            }
        }),
    ]);

    const c = newComponent<Args>(root, render);

    function render() {
        rg.render();
    }

    return c;
}

export function UrlExplorer() {
    type Args = { 
        data: CurrentLocationData; 
        currentPath: string[];
        loading: boolean; 
        onPushPathItem(key: string): void;
    };

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        div({ class: "row justify-content-center sb1b" }, [
            "TODO: current path"
        ]),
        div({ class: "b" }, [ rg.text(() => "Incoming: " + c.args.data.incoming.length) ]),
        div({ class: "flex-1 col sb1b" }, [
            rg.componentArgs(UrlList(), () => {
                console.log(c.args.data.incoming);
                return {
                    urls: c.args.data.incoming,
                    isIncoming: true,
                    onClick: pushPath,
                }
            })
        ]),
        div({ class: "b" }, [ rg.text(() => "Outgoing: " + c.args.data.outgoing.length) ]),
        div({ class: "flex-1 col sb1b" }, [
            rg.componentArgs(UrlList(), () => {
                return {
                    urls: c.args.data.outgoing,
                    isIncoming: false,
                    onClick: pushPath,
                }
            })
        ]),
    ]);

    const c = newComponent<Args>(root, render);

    function render() {
        rg.render();
    }

    function pushPath(key: string) {
        c.args.onPushPathItem(key);
    }

    return c;
}
