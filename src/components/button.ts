import { ChildList, el } from "src/utils/dom-utils";

export function makeButton(children: ChildList, classes: string = "", styles: string = "") {
    return el(
        "BUTTON",
        {
            type: "button",
            class: `solid-border ${classes} flex`,
            style: `min-width: 25px; padding: 0px 10px; margin: 5px; justify-content: center; ${styles}`,
        },
        children
    );
}
