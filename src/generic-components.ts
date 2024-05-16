import { el } from "./dom-utils";

export function makeButton(text: string, classes: string = "", styles: string = "") {
    return el(
        "BUTTON",
        {
            type: "button",
            class: `solid-border ${classes} flex`,
            style: `min-width: 25px; padding: 3px; margin: 5px; justify-content: center; ${styles}`,
        },
        [text]
    );
}
