import { Hono } from "hono";
import type { AppEnv } from "./lib/auth";
import { requireAccess } from "./lib/auth";
import { onError } from "./lib/errors";

const app = new Hono<AppEnv>();
app.onError(onError);

// 刻意沒有免認證的端點（連 /api/health 都沒有）：那會是唯一能讓未認證流量
// 喚起 Worker 的入口。Access 在邊緣就擋下其餘所有請求。
app.get("/api/me", requireAccess, (c) =>
    c.json({ auth: c.get("auth"), email: c.get("email"), app: c.env.APP_NAME }),
);

app.notFound((c) => c.json({ error: "not found" }, 404));

export default app satisfies ExportedHandler<AppEnv["Bindings"]>;
