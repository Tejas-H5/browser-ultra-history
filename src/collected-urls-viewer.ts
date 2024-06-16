import { UrlInfo, isUrlKey } from "./state";
import { div, newComponent, newRenderGroup } from "./utils/dom-utils";

function UrlItem() {
    const rg = newRenderGroup();
    const root = div({}, [
        rg.text(() => "URL: " + c.args?.info?.url || "??"),
        rg.text(() => ", "),
        rg.text(() => "VisitedAt: " + new Date(c.args?.info?.visitedAt || 0).toLocaleDateString()),
    ]);

    const c = newComponent<{info: UrlInfo | undefined}>(root, rg.render);
    return c;
}

// component is in limbo. TODO: finsih or delete
export function CollectedUrlsViewer() {
    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 flex-center" }, [
        rg.list(div(), UrlItem, (getNext) => {
            const data = c.args?.allData;
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

    const c = newComponent<{ allData: any }>(root, rg.render);

    return c;
}
