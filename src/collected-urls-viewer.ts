import { isTypeKey } from "./default-storage-area";
import { urlSchema, UrlInfo } from "./state";
import { div, newComponent, newListRenderer, newRenderGroup, newState } from "./utils/dom-utils";

function UrlItem() {
    const s = newState<{ info: UrlInfo | undefined; }>();

    const rg = newRenderGroup();
    const root = div({}, [
        rg.text(() => "URL: " + s.args?.info?.url || "??"),
    ]);

    return newComponent(root, rg.render, s);
}

// component is in limbo. TODO: finsih or delete
export function CollectedUrlsViewer() {
    const s = newState<{ allData: any }>();

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 flex-center" }, [
        rg(newListRenderer(div(), UrlItem), c => c.render((getNext) => {
            const data = s.args?.allData;
            if (!data) {
                return;
            }

            for (const k in data) {
                if (!isTypeKey(k, urlSchema)) {
                    continue;
                }

                getNext().render({
                    info: data[k] as UrlInfo | undefined
                });
            }
        }))
    ]);

    const c = newComponent(root, rg.render, s);

    return c;
}
