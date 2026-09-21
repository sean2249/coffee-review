import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export function notFound(what = "resource"): HTTPException {
    return new HTTPException(404, { message: `${what} not found` });
}

export function conflict(message: string, code?: string): HTTPException {
    return new HTTPException(409, { message, cause: { code } });
}

export function badRequest(message: string, code?: string): HTTPException {
    return new HTTPException(400, { message, cause: { code } });
}

// app.js 分支在 Postgres 的 SQLSTATE 上（新增店家撞 google_place_id 是 23505、
// 刪除店家被記錄擋下是 23503）。D1 只給文字訊息，所以在這裡轉譯回同樣的碼，
// 換取前端兩處 catch 完全不用改。
export function d1ErrorCode(err: unknown): string | undefined {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed")) return "23505";
    if (msg.includes("FOREIGN KEY constraint failed")) return "23503";
    return undefined;
}

export function onError(err: Error, c: Context): Response {
    if (err instanceof HTTPException) {
        const code = (err.cause as { code?: string } | undefined)?.code;
        return c.json(code ? { error: err.message, code } : { error: err.message }, err.status);
    }
    const code = d1ErrorCode(err);
    if (code) return c.json({ error: err.message, code }, 409);
    console.error("unhandled", err);
    return c.json({ error: "internal error" }, 500);
}
