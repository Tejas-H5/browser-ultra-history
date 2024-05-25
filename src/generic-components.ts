import { el } from "./dom-utils";

export function makeButton(text: string, classes: string = "", styles: string = "") {
    return el(
        "BUTTON",
        {
            type: "button",
            class: `${classes} flex`,
            style: `min-width: 25px; justify-content: center; ${styles}`,
        },
        [text]
    );
}
