import { isTypeKey } from "./default-storage-area";
import { URL_SCHEMA, UrlInfo } from "./state";
import { div, newComponent, newRenderGroup, newState } from "./utils/dom-utils";

function UrlItem() {
    const s = newState<{ info: UrlInfo | undefined; }>();

    const rg = newRenderGroup();
    const root = div({}, [
        rg.text(() => "URL: " + s.args?.info?.url || "??"),
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
                if (!isTypeKey(k, URL_SCHEMA)) {
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
