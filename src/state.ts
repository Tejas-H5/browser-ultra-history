
export type AppTheme = "Light" | "Dark";

export type State = {
    currentTheme: AppTheme;
}

function defaultState(): State {
    return {
        currentTheme: "Light",
    };
}

export const state = defaultState();
