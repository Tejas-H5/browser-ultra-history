// A helper to manage asynchronous fetching of data that I've found quite useful.
// I've found that storing the data directly on this object isn't ideal.
export function newRefetcher<T extends any[]>({ 
    refetch, 
    onError 
}: { 
    refetch: (...args: T) => Promise<void>;
    onError: () => void;
}): AsyncState<T> {
    const state: AsyncState<T> = {
        state: "none",
        errorMessage: undefined,
        isFetching: false,
        refetch: async (...args: T) => {
            if (state.isFetching) {
                return;
            }

            state.state = "loading";
            state.errorMessage = undefined;
            state.isFetching = true;

            try {
                await refetch(...args);
                state.state = "loaded";
            } catch(err) {
                state.state = "failed";
                state.errorMessage = `${err}`;
                if (state.errorMessage === "[object Object]") {
                    state.errorMessage = "An error occured";
                }

                console.error("error in fetching method", err);

                onError();
            } finally {
                state.isFetching = false;
            }
        }
    };

    return state;
}

export type AsyncState<T extends any[]> = {
    state: "none" | "loading" |  "loaded" | "failed";
    errorMessage: string | undefined;
    isFetching: boolean;
    refetch: (...args: T) => Promise<void>;
}
