import { makeButton } from "./components";
import { CurrentLocationData, LinkInfo, getCurrentLocationData, getCurrentTabUrl } from "./state";
import { div, divClass, newComponent, newRefetcher, newRenderGroup, newStyleGenerator, on, setClass } from "./utils/dom-utils";

const sg = newStyleGenerator();

const cnAlreadyInPath = sg.makeClass("alreadyInPath", [
    `{ color: #00F }`,
]);

function UrlList()  {
    type Args = {
        links: LinkInfo[]; 
        currentUrlsPath: string[];
        isIncoming: boolean;
        onClick: (url: string) => void;
    };

    function UrlListItem() {
        type Args = {
            linkInfo: LinkInfo;
            linkUrl: string;
            isIncoming: boolean;
            onClick(url: string): void;
            isAlreadyInPath: boolean;
        };

        let isMouseOver = false;

        function fmt(name: string, str: string[] | undefined) {
            if (!str) {
                return "";
            }

            return "[" + name + ":" + str.join(", ") + "]";
        }

        const rg = newRenderGroup();
        const root = divClass("hover-parent hover handle-long-words", {}, [
            rg.text(() => c.args.isIncoming && isMouseOver ? "<-- " : ""),

            rg.text(() => c.args.linkInfo.redirect ? "[Redirect]" : ""),
            rg.text(() => fmt("Style", c.args.linkInfo.styleName)),
            rg.text(() => fmt("Attribute", c.args.linkInfo.attrName)),
            rg.text(() => fmt("Context", c.args.linkInfo.contextString)),
            rg.text(() => fmt("Link text", c.args.linkInfo.linkText)),
            rg.text(() => fmt("Image", c.args.linkInfo.linkImage)),

            rg.text(() => c.args.linkUrl),
            rg.text(() => !c.args.isIncoming && isMouseOver ? " -->" : ""),
        ]);

        const c = newComponent<Args>(root, render);

        function canClick() {
            return !c.args.isAlreadyInPath;
        }

        function render() {
            rg.render();

            setClass(root, cnAlreadyInPath, c.args.isAlreadyInPath);

            setClass(root, "pointer", canClick() && isMouseOver);
            setClass(root, "underline", canClick() && isMouseOver);
        }

        on(root, "click", () => {
            const { onClick, linkUrl } = c.args;

            if (canClick()) {
                onClick(linkUrl);
            }
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

    const scrollContainer = div({ class: "nowrap overflow-y-auto" });
    const rg = newRenderGroup();
    const root = divClass("flex-1 overflow-x-auto col", {}, [
        rg.list(scrollContainer, UrlListItem, (getNext) => {
            const { links, isIncoming, currentUrlsPath } = c.args;
            
            for (const linkInfo of links) {
                const linkUrl = isIncoming ? linkInfo.urlFrom : linkInfo.urlTo;

                getNext().render({
                    linkInfo,
                    linkUrl,
                    isIncoming,
                    onClick: c.args.onClick,
                    isAlreadyInPath: currentUrlsPath.includes(linkUrl),
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
        onNavigate(url: string): void; 
    };

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        div({ class: "row justify-content-center sb1b" }, [
            rg.if(
                () => currentTabUrlStack.length > 1, 
                on(makeButton([rg.text(() => "<- (" + currentTabUrlStack.length + ")")]), "click", () => {
                    if (currentTabUrlStack.length > 1) {
                        popPath();
                    }
                })
            ),
            div({ class: "flex-1" }),
            div({ class: "handle-long-words" }, [ rg.text(() => peekTabStack() || "Pick a url to go to") ]),
            div({ class: "flex-1" }),
            rg.if(
                () => !!peekTabStack(), 
                on(makeButton("Go"), "click", () => {
                    if (peekTabStack()) {
                        c.args.onNavigate(peekTabStack());
                    }
                })
            ),
        ]),
        div({ class: "b" }, [ rg.text(() => "Incoming: " + (data?.incoming.length || 0)) ]),
        div({ class: "flex-1 col sb1b" }, [
            rg.componentArgs(UrlList(), () => {
                if (!data) return;

                return {
                    links: data.incoming,
                    isIncoming: true,
                    onClick: pushPath,
                    currentUrlsPath: currentTabUrlStack,
                }
            })
        ]),
        div({ class: "b" }, [ rg.text(() => "Outgoing: " + (data?.outgoing.length || 0)) ]),
        div({ class: "col sb1b min-wh-0", style: "flex: 3" }, [
            rg.componentArgs(UrlList(), () => {
                if (!data) return;

                return {
                    links: data.outgoing,
                    isIncoming: false,
                    onClick: pushPath,
                    currentUrlsPath: currentTabUrlStack,
                }
            })
        ]),
    ]);

    const c = newComponent<Args>(root, () => renderAsync());

    let data: CurrentLocationData | undefined;
    let currentTabUrlStack: string[] = [];
    function peekTabStack() {
        return currentTabUrlStack[currentTabUrlStack.length - 1];
    }

    const fetchState = newRefetcher(render, async (tabUrl: string | undefined) => {
        let currentTabUrl = tabUrl;
        if (!currentTabUrl) {
            currentTabUrl = await getCurrentTabUrl();
        }

        if (!currentTabUrl) {
            throw new Error("Couldn't find current tab!");
        }

        data = await getCurrentLocationData(currentTabUrl);
        if (!data) {
            throw new Error("No data collected yet for this location!");
        }

        data.incoming.sort((a, b) => a.urlTo.localeCompare(b.urlTo));
        data.outgoing.sort((a, b) => a.urlTo.localeCompare(b.urlTo));
    });

    function render() {
        rg.render();
    }

    async function renderAsync() {
        const currentTabUrl = await getCurrentTabUrl();
        if (
            currentTabUrl && 
            currentTabUrl !== currentTabUrlStack[0]
        ) {
            resetPath(currentTabUrl);
        }

        if (!currentTabUrl) {
            return;
        }
    }

    async function resetPath(url: string) {
        currentTabUrlStack.splice(0, currentTabUrlStack.length);
        pushPath(url);
    }

    async function pushPath(url: string) {
        if (peekTabStack() === url) {
            return;
        }

        currentTabUrlStack.push(url);
        await fetchState.refetch(url);
    }

    async function popPath() {
        if (currentTabUrlStack.length > 1) {
            currentTabUrlStack.pop();
            await fetchState.refetch(peekTabStack());
        }
    }

    return c;
}
