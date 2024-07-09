import { UrlInfo, isUrlKey } from "./state";
import { div, newComponent, newRenderGroup, newState } from "./utils/dom-utils";

function UrlItem() {
    const s = newState<{ info: UrlInfo | undefined; }>();

    const rg = newRenderGroup();
    const root = div({}, [
        rg.text(() => "URL: " + s.args?.info?.url || "??"),
        rg.text(() => ", "),
        rg.text(() => "VisitedAt: " + new Date(s.args?.info?.visitedAt || 0).toLocaleDateString()),
    ]);

    const c = newComponent(root, rg.render, s);
    return c;
}

// component is in limbo. TODO: finsih or delete
export function CollectedUrlsViewer() {
    const s = newState<{ allData: any }>();

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 flex-center" }, [
        rg.list(div(), UrlItem, (getNext) => {
            const data = s.args?.allData;
            if (!data) {
                return;
            }

            for (const k in data) {
                if (!isUrlKey(k)) {
                    continue;
                }

                getNext().render({
                    info: data[k] as UrlInfo | undefined
                });
            }
        })
    ]);

    const c = newComponent(root, rg.render, s);

    return c;
}
