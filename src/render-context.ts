// NOTE: This will only work if our framework's render tree is synchronous.
// This is the main reason why I've actually removed all the Promise<void> and async stuff from dom-utils.
// The synchronicity gives us a lot of guarantees for free
export const renderContext = {
    forceRefetch: false,
};
