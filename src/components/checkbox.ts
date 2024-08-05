import { div, newComponent, newState, newStyleGenerator, on, setClass, setText } from "src/utils/dom-utils";

const sg = newStyleGenerator();

const cnCheckbox = sg.makeClass("checkbox-button", [
    ` { cursor: pointer; }`,
    `.checked { background-color: var(--fg-color); }`,
    // Doing the border radius only on hover was an accident, but it turns out to be a pretty nice interaction
    `:hover { outline: 1px solid var(--fg-color); border-radius: 3px; }`,
]);

export function Checkbox(initialLabel?: string) {
    const s = newState<{
        label?: string;
        value: boolean;
        onChange(val: boolean, e: MouseEvent): void;
    }>();

    const checkbox = div({ class: `${cnCheckbox} w-100 h-100` });
    const label = div({ style: "user-select: none" });
    const root = div({ class: "row align-items-center" }, [
        div({ class: "solid-border-sm-rounded", style: "padding: 4px; width: 0.65em; height: 0.65em;" }, [
            checkbox,
        ]),
        div({ style: "width: 10px" }),
        label,
    ]);

    on(root, "click", (e) => {
        s.args.onChange(!s.args.value, e);
    });

    function render() {
        setClass(checkbox, "checked", s.args.value)
        setText(label, s.args.label || initialLabel || "");
    }

    return newComponent(root, render, s);;
}
