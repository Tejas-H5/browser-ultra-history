import { UrlInfo, getAllData, isUrlKey } from "./state";
import { div, divStyled, newAsyncState, newComponent, newListRenderer, newRenderGroup } from "./utils/dom-utils";

function UrlItem() {
    const rg = newRenderGroup();
    const root = divStyled("", "", [
        rg.text(() => "URL: " + c.args.info?.url || "??"),
        rg.text(() => ", "),
        rg.text(() => "VisitedAt: " + new Date(c.args.info?.visitedAt || 0).toLocaleDateString()),
    ]);

    const c = newComponent<{info: UrlInfo | undefined}>(root, rg.render);
    return c;
}

export function CollectedUrlsViewer() {
    const rg = newRenderGroup();
    const root = divStyled("flex-1 p-5 align-items-center justify-content-center", "", [
        rg.if(() => state.state === "loading", div({}, [ "Loading all the data..." ])),
        rg.if(() => state.state === "failed", div({}, [
            "Loading failed: ",
            rg.text(() => state.errorMessage ?? "An error occured"),
        ])),
        rg.if(() => state.state === "loaded", rg(
            newListRenderer(div(), UrlItem), 
            (list) => {
                const data = state.data;
                if (!data) {
                    return;
                }

                for (const k in data) {
                    if (!isUrlKey(k)) {
                        continue;
                    }

                    list.getNext().render({
                        info: data[k] as UrlInfo | undefined
                    });
                }
            }
        )),
    ]);

    const c = newComponent(root, () => renderAsync());

    const state = newAsyncState<any>(render, async () => {
        const data = await getAllData();
        console.log({ data });
        return data;
    });

    function render() {
        rg.render();
    }

    async function renderAsync() {
        await state.refetch();
    }

    return c;
}
