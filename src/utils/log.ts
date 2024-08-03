
// It's just console.log, except intentional
export function logTrace(...messages: any[]) {
    console.log("[" + process.env.SCRIPT + "]", ...messages);
}

