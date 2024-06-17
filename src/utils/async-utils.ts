
export function newAwaiter() {
    const tasks: Promise<any>[] = [];
    const awaitTask = (task: () => Promise<any>) => {
        const t = task()
        tasks.push(t);
        return t;
    }

    return Object.assign(awaitTask, {
        tasks,
        allSettled: async () => {
            return await Promise.allSettled(tasks);
        },
    });
}
