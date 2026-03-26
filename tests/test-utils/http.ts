export function createMockRes() {
    const res: any = {};
    res.statusCode = 200;
    res.payload = undefined;
    res.status = (code: number) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body: any) => {
        res.payload = body;
        return res;
    };
    return res;
}
