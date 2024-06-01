
export function assert(trueVal: any, ...msg: any[]): asserts trueVal {
    if (!trueVal) { 
        console.error("Assertion failed!", ...msg); 
        throw new Error("Assertion failed!");
    } 
};
