// A helper to manage asynchronous fetching of data that I've found quite useful.
// I've found that storing the data directly on this object isn't ideal.
export function newRefetcher<T extends any[]>(render: () => void, refetch: (...args: T) => Promise<void>): AsyncState<T> {
    const state: AsyncState<T> = {
        state: "none",
        errorMessage: undefined,
        refetch: async (...args: T) => {
            state.state = "loading";
            state.errorMessage = undefined;

            render();

            try {
                await refetch(...args);

                state.state = "loaded";
            } catch(err) {
                state.state = "failed";

                state.errorMessage = `${err}`;
                if (state.errorMessage === "[object Object]") {
                    state.errorMessage = "An error occured";
                }
            } finally {
                render();
            }
        }
    };

    return state;
}

export type AsyncState<T extends any[]> = {
    state: "none" | "loading" |  "loaded" | "failed";
    errorMessage: string | undefined;
    refetch: (...args: T) => Promise<void>;
}
