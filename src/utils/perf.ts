export function newTimer() {
    const startMs = Date.now();
    const rows: { time: number, messages: any[] }[] = [];

    const timer = {
        logTime(...messages: any[]) {
            rows.push({ time: Date.now(), messages });
        },
        stop() {
            timer.logTime("STOP");
            console.log("0ms: START");
            for (const { time, messages } of rows) {
                console.log(time - startMs + "ms: ", ...messages);
            }
        }
    };

    return timer;
}
