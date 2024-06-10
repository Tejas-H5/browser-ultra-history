import { div, newComponent, newRenderGroup } from "./utils/dom-utils";

export function NetworkGraph() {
    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 flex-center" }, [
        rg.text(() => "Network graph - TODO")
    ]);

    const c = newComponent(root, rg.render);

    return c;
}
